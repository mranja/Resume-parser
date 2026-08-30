import json
from dataclasses import dataclass
from typing import Any, Optional
from pydantic import ValidationError

from app.core.logging import get_logger
from app.llm.base import BaseLLMProvider
from app.llm.factory import get_llm_provider
from app.llm.prompts import RESUME_EXTRACTION_SYSTEM, RESUME_EXTRACTION_USER
from app.schemas import (
    CandidateProfile,
    ContactInfo,
    EducationItem,
    ExperienceItem,
    ProjectItem,
)
from app.services.nlp import parse_resume_text as parse_resume_rule_based

logger = get_logger("services.extraction")


@dataclass
class ExtractionOutcome:
    profile: CandidateProfile
    raw_text: str
    extraction_method: str
    fallback_used: bool = False
    error_message: Optional[str] = None


class ResumeExtractionService:
    def __init__(self, llm_provider: Optional[BaseLLMProvider] = None):
        self.llm = llm_provider or get_llm_provider()

    def extract_candidate_profile(self, resume_text: str) -> ExtractionOutcome:
        """
        Attempts LLM structured extraction with schema enforcement.
        If the LLM provider fails, times out, or produces invalid JSON schema,
        gracefully falls back to the deterministic rule-based parser.
        """
        prompt = RESUME_EXTRACTION_USER.format(resume_text=resume_text[:6000])
        
        try:
            llm_result = self.llm.generate(
                prompt=prompt,
                system_prompt=RESUME_EXTRACTION_SYSTEM,
                json_schema=CandidateProfile.model_json_schema(),
            )

            # Check parsed json or attempt json.loads
            data = llm_result.parsed_json
            if data is None:
                try:
                    data = json.loads(llm_result.text)
                except Exception:
                    # Look for JSON markdown block
                    import re
                    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", llm_result.text, re.DOTALL)
                    if match:
                        data = json.loads(match.group(1))

            if data and isinstance(data, dict):
                # Validate against Pydantic schema
                profile = CandidateProfile.model_validate(data)
                return ExtractionOutcome(
                    profile=profile,
                    raw_text=resume_text,
                    extraction_method=f"llm:{llm_result.provider}:{llm_result.model_name}",
                    fallback_used=False,
                )

            raise ValueError("LLM returned non-JSON response.")

        except (ValidationError, ValueError, Exception) as exc:
            logger.warning("LLM structured extraction failed (%s). Falling back to rule-based parser.", exc)
            fallback_profile = self._fallback_rule_based_extraction(resume_text)
            return ExtractionOutcome(
                profile=fallback_profile,
                raw_text=resume_text,
                extraction_method="fallback:rule_based",
                fallback_used=True,
                error_message=str(exc),
            )

    def _fallback_rule_based_extraction(self, resume_text: str) -> CandidateProfile:
        parsed = parse_resume_rule_based(resume_text)

        edu_items = [
            EducationItem(
                institution="Educational Institution",
                degree=item,
                field_of_study=None,
                graduation_year=None,
            )
            for item in parsed.education
        ]

        exp_items = [
            ExperienceItem(
                company="Previous Organization",
                title="Software Professional",
                years=parsed.years_experience,
                description="Experience extracted via NLP rule-based parser.",
            )
        ]

        return CandidateProfile(
            full_name=parsed.full_name,
            contact=ContactInfo(
                email=parsed.email,
                phone=parsed.phone,
                location=parsed.location,
            ),
            skills=parsed.skills,
            technologies=[s for s in parsed.skills if s in {"Python", "FastAPI", "React", "Docker", "PostgreSQL", "SQL"}],
            education=edu_items,
            experience=exp_items,
            projects=[],
            certifications=[],
            total_years_experience=parsed.years_experience,
            summary=f"Extracted candidate record with {parsed.years_experience:g} years experience and {len(parsed.skills)} detected skills.",
        )
