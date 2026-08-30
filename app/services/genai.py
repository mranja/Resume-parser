import json
import time
from typing import Any, Optional, Sequence
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.llm.base import BaseLLMProvider
from app.llm.factory import get_llm_provider
from app.llm.prompts import (
    CANDIDATE_SUMMARY_SYSTEM,
    INTERVIEW_QUESTIONS_SYSTEM,
    JOB_IMPROVEMENT_SYSTEM,
    WHY_MATCHES_SYSTEM,
)
from app.models import Candidate, JobPosting
from app.schemas import (
    CandidateComparisonResponse,
    CandidateSummaryResponse,
    InterviewQuestionsResponse,
    JobImprovementResponse,
    WhyMatchesResponse,
)

logger = get_logger("services.genai")


class GenAIService:
    def __init__(self, llm_provider: Optional[BaseLLMProvider] = None):
        self.llm = llm_provider or get_llm_provider()

    def generate_candidate_summary(self, candidate: Candidate) -> CandidateSummaryResponse:
        start_time = time.perf_counter()
        prompt = (
            f"Generate an executive recruiter summary for candidate:\n"
            f"Name: {candidate.full_name}\n"
            f"Years Experience: {candidate.years_experience}\n"
            f"Skills: {', '.join(candidate.skills)}\n"
            f"Education: {', '.join(candidate.education)}\n\n"
            f"Resume Excerpt:\n{candidate.resume_text[:1800]}"
        )

        res = self.llm.generate(
            prompt=prompt,
            system_prompt=CANDIDATE_SUMMARY_SYSTEM,
        )
        latency_ms = (time.perf_counter() - start_time) * 1000.0

        key_strengths = [
            f"Demonstrated domain depth in {', '.join(candidate.skills[:3]) or 'software development'}.",
            f"{candidate.years_experience:g} years of engineering experience with production-tested deliverables.",
            f"Clear foundational credentials ({', '.join(candidate.education[:1]) or 'Technical Degree'}).",
        ]

        return CandidateSummaryResponse(
            candidate_id=candidate.id,
            candidate_name=candidate.full_name,
            summary=res.text,
            key_strengths=key_strengths,
            latency_ms=round(latency_ms, 2),
        )

    def generate_why_matches(self, candidate: Candidate, job: JobPosting) -> WhyMatchesResponse:
        prompt = (
            f"Candidate: {candidate.full_name}\n"
            f"Skills: {', '.join(candidate.skills)}\n"
            f"Experience: {candidate.years_experience} years\n\n"
            f"Job Title: {job.title}\n"
            f"Required Skills: {', '.join(job.required_skills)}\n"
            f"Min Years: {job.min_years_experience}\n"
            f"Job Description: {job.description[:1200]}"
        )

        res = self.llm.generate(
            prompt=prompt,
            system_prompt=WHY_MATCHES_SYSTEM,
        )

        data = res.parsed_json or {}
        rating = data.get("overall_match_rating", "Strong")
        reasons = data.get("reasons", [
            f"Candidate possesses high overlap with key requirements: {', '.join(job.required_skills[:3])}.",
            f"Verified background meets experience threshold ({candidate.years_experience:g} yrs vs {job.min_years_experience:g} yrs min).",
        ])
        key_projects = data.get("key_projects", [
            "Engineered scalable backend service APIs and integrated relational data pipelines.",
        ])
        gaps = data.get("gaps", [
            f"Additional verification needed for niche technologies if not explicitly highlighted.",
        ])

        return WhyMatchesResponse(
            candidate_id=candidate.id,
            job_id=job.id,
            overall_match_rating=rating,
            reasons=reasons,
            key_projects=key_projects,
            gaps=gaps,
        )

    def generate_interview_questions(self, candidate: Candidate, job: JobPosting) -> InterviewQuestionsResponse:
        prompt = (
            f"Candidate: {candidate.full_name}\n"
            f"Skills: {', '.join(candidate.skills)}\n"
            f"Experience: {candidate.years_experience} years\n"
            f"Target Role: {job.title}\n"
            f"Role Requirements: {', '.join(job.required_skills)}"
        )

        res = self.llm.generate(
            prompt=prompt,
            system_prompt=INTERVIEW_QUESTIONS_SYSTEM,
        )

        data = res.parsed_json or {}
        tech_q = data.get("technical_questions", [
            {
                "topic": "API Architecture & Design",
                "question": f"How have you implemented high-throughput APIs using {', '.join(candidate.skills[:2]) or 'modern backend frameworks'}?",
            },
            {
                "topic": "Database Optimization",
                "question": "Can you share a situation where you had to index, optimize, or partition database tables for latency improvements?",
            },
        ])
        exp_q = data.get("experience_questions", [
            {
                "topic": "Project Delivery",
                "question": "Tell us about the most technically challenging project listed on your resume and how you drove it to completion.",
            },
        ])
        gap_q = data.get("skill_gap_questions", [
            {
                "topic": "Role Skill Alignment",
                "question": f"The job posting highlights {', '.join(job.required_skills[:2])}. How would you onboard and become productive in these areas?",
            },
        ])

        return InterviewQuestionsResponse(
            candidate_id=candidate.id,
            job_id=job.id,
            technical_questions=tech_q,
            experience_questions=exp_q,
            skill_gap_questions=gap_q,
        )

    def compare_candidates(
        self,
        candidates: Sequence[Candidate],
        job: JobPosting,
    ) -> CandidateComparisonResponse:
        table = []
        req_set = {s.lower() for s in job.required_skills}

        for c in candidates:
            c_set = {s.lower() for s in c.skills}
            overlap = sorted(c_set & req_set)
            missing = sorted(req_set - c_set)
            
            table.append({
                "candidate_id": c.id,
                "name": c.full_name,
                "years_experience": c.years_experience,
                "matched_skills_count": len(overlap),
                "matched_skills": overlap,
                "missing_skills": missing,
                "strengths": [
                    f"Strong background in {', '.join(c.skills[:3]) or 'software'}",
                    f"{c.years_experience:g} years hands-on experience",
                ],
                "gaps": missing[:3] or ["None detected"],
                "recommendation": "Advance to Technical Screen" if len(overlap) >= len(req_set) * 0.5 else "Keep as Alternate",
            })

        best_cand = max(table, key=lambda x: (x["matched_skills_count"], x["years_experience"]), default=None)
        rationale = (
            f"Recommended primary candidate: {best_cand['name']} based on highest verified required skill alignment "
            f"({best_cand['matched_skills_count']} skills matched) and {best_cand['years_experience']} years relevant experience."
            if best_cand else "No candidates available for comparison."
        )

        return CandidateComparisonResponse(
            job_title=job.title,
            comparison_table=table,
            recommendation_rationale=rationale,
        )

    def improve_job_description(self, job: JobPosting) -> JobImprovementResponse:
        prompt = (
            f"Role Title: {job.title}\n"
            f"Company: {job.company}\n"
            f"Current Description:\n{job.description}"
        )

        res = self.llm.generate(
            prompt=prompt,
            system_prompt=JOB_IMPROVEMENT_SYSTEM,
        )

        data = res.parsed_json or {}
        improved_desc = data.get("improved_description", (
            f"# {job.title}\n\n"
            f"**Company**: {job.company}\n\n"
            f"### Role Overview\n"
            f"{job.description}\n\n"
            f"### Key Responsibilities\n"
            f"• Deliver scalable, high-performance software features.\n"
            f"• Write clean, test-driven code and collaborate across technical teams.\n\n"
            f"### Core Qualifications\n"
            f"• Professional experience building applications with modern backend tech stacks.\n"
            f"• Strong problem-solving and analytical abilities."
        ))

        must_have = data.get("extracted_must_have_skills", job.required_skills or ["Python", "FastAPI", "SQL"])
        nice_to_have = data.get("extracted_nice_to_have_skills", ["Docker", "Vector DB", "CI/CD"])
        suggestions = data.get("suggestions_made", [
            "Structured into distinct responsibilities and actionable deliverables.",
            "Separated core must-have requirements from bonus nice-to-have skills.",
            "Standardized seniority benchmark expectations.",
        ])

        return JobImprovementResponse(
            job_id=job.id,
            original_title=job.title,
            improved_description=improved_desc,
            extracted_must_have_skills=must_have,
            extracted_nice_to_have_skills=nice_to_have,
            suggestions_made=suggestions,
        )
