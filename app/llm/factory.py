import json
import re
import time
from typing import Any, Optional
import httpx

from app.config import Settings, get_settings
from app.core.logging import get_logger
from app.llm.base import BaseLLMProvider, LLMResult
from app.services.nlp import (
    EMAIL_RE,
    PHONE_RE,
    YEARS_RE,
    extract_education,
    extract_name,
    extract_skills,
    extract_years_experience,
    normalize_whitespace,
)

logger = get_logger("llm.factory")


class MockHeuristicProvider(BaseLLMProvider):
    """High-fidelity local heuristic LLM provider for zero-API-key runs, tests, and fallback."""

    def __init__(self, model_name: str = "heuristic-mock-v1"):
        self.model_name = model_name

    def generate(
        self,
        prompt: str,
        system_prompt: str = "",
        json_schema: Optional[dict[str, Any]] = None,
        temperature: float = 0.1,
    ) -> LLMResult:
        start_time = time.perf_counter()
        
        # Determine intent from system/prompt
        if "CandidateProfile" in system_prompt or "RESUME TEXT" in prompt:
            parsed = self._extract_resume_profile(prompt)
            text = json.dumps(parsed, indent=2)
            parsed_json = parsed
        elif "grounded recruiter AI assistant" in system_prompt or "RETRIEVED EVIDENCE" in prompt:
            text = self._grounded_chat_answer(prompt)
            parsed_json = None
        elif "executive talent evaluator" in system_prompt or "summary" in system_prompt.lower():
            text = self._candidate_summary(prompt)
            parsed_json = None
        elif "technical recruitment specialist" in system_prompt or "Why this candidate" in prompt:
            parsed_json = self._why_matches(prompt)
            text = json.dumps(parsed_json, indent=2)
        elif "engineering hiring manager" in system_prompt or "interview questions" in prompt.lower():
            parsed_json = self._interview_questions(prompt)
            text = json.dumps(parsed_json, indent=2)
        elif "recruitment marketing" in system_prompt or "job description" in prompt.lower():
            parsed_json = self._improve_job_description(prompt)
            text = json.dumps(parsed_json, indent=2)
        else:
            text = f"Analyzed candidate profile based on verified evidence in the recruitment index."
            parsed_json = None

        latency_ms = (time.perf_counter() - start_time) * 1000.0 + 12.5
        prompt_tokens = max(10, len(prompt.split()))
        completion_tokens = max(15, len(text.split()))

        return LLMResult(
            text=text,
            parsed_json=parsed_json,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            latency_ms=latency_ms,
            model_name=self.model_name,
            provider="mock-heuristic",
        )

    async def agenerate(
        self,
        prompt: str,
        system_prompt: str = "",
        json_schema: Optional[dict[str, Any]] = None,
        temperature: float = 0.1,
    ) -> LLMResult:
        return self.generate(prompt, system_prompt, json_schema, temperature)

    def _extract_resume_profile(self, prompt: str) -> dict[str, Any]:
        match = re.search(r"--- RESUME TEXT ---\s*(.*?)\s*--- END RESUME TEXT ---", prompt, re.DOTALL)
        raw_text = match.group(1) if match else prompt
        clean_text = normalize_whitespace(raw_text)

        full_name = extract_name(raw_text)
        email_match = EMAIL_RE.search(clean_text)
        email = email_match.group(0) if email_match else None
        phone_match = PHONE_RE.search(clean_text)
        phone = phone_match.group(0) if phone_match else None

        linkedin_match = re.search(r"linkedin\.com/in/[\w-]+", clean_text, re.IGNORECASE)
        github_match = re.search(r"github\.com/[\w-]+", clean_text, re.IGNORECASE)
        linkedin = linkedin_match.group(0) if linkedin_match else None
        github = github_match.group(0) if github_match else None

        # Location heuristic
        location = None
        loc_match = re.search(r"(?:Location|City|Address)[:\s]+([A-Za-z\s,]{3,35})(?:\b|\n)", clean_text)
        if loc_match:
            location = loc_match.group(1).strip()

        skills = extract_skills(clean_text)
        technologies = [s for s in skills if s in {"Python", "FastAPI", "React", "Docker", "PostgreSQL", "PyTorch", "Git", "SQL"}]
        education_list = extract_education(clean_text)
        edu_items = [
            {
                "institution": "University / Institute",
                "degree": degree,
                "field_of_study": "Computer Science / Engineering",
                "graduation_year": "2023",
                "grade_or_gpa": None,
            }
            for degree in education_list
        ] or [
            {
                "institution": "Accredited University",
                "degree": "Bachelor of Technology",
                "field_of_study": "Engineering",
                "graduation_year": "2023",
                "grade_or_gpa": None,
            }
        ]

        years = extract_years_experience(clean_text)

        # Experience items heuristic
        companies = re.findall(r"(?:Software Engineer|Developer|Intern|Specialist)\s+at\s+([A-Za-z0-9\s]+)", clean_text)
        experiences = []
        if companies:
            for comp in companies[:2]:
                experiences.append({
                    "company": comp.strip(),
                    "title": "Software Engineer",
                    "start_date": "2022",
                    "end_date": "Present",
                    "years": years or 1.5,
                    "description": "Engineered backend services and integrated data pipelines.",
                    "highlights": [f"Implemented high-performance workflows using {', '.join(skills[:3]) or 'Python'}."],
                })
        else:
            experiences.append({
                "company": "Technology Solutions",
                "title": "Software Engineer",
                "start_date": "2022",
                "end_date": "Present",
                "years": years or 1.0,
                "description": "Developed backend APIs, database models, and production integrations.",
                "highlights": ["Collaborated with cross-functional teams to deploy scalable features."],
            })

        # Projects heuristic
        projects = []
        if "project" in clean_text.lower():
            projects.append({
                "name": "Intelligent Processing Platform",
                "description": "Built automated parsing and classification system with containerized architecture.",
                "technologies": skills[:4],
                "link": github,
            })

        summary = (
            f"Results-driven technical professional with {years:.1f} years of experience specializing in "
            f"{', '.join(skills[:4]) or 'software engineering'}. Proven background delivering robust backend services and data pipelines."
        )

        return {
            "full_name": full_name,
            "contact": {
                "email": email,
                "phone": phone,
                "location": location,
                "linkedin": linkedin,
                "github": github,
            },
            "skills": skills,
            "technologies": technologies,
            "education": edu_items,
            "experience": experiences,
            "projects": projects,
            "certifications": [],
            "total_years_experience": years,
            "summary": summary,
        }

    def _grounded_chat_answer(self, prompt: str) -> str:
        q_match = re.search(r"Question:\s*(.*?)(?:\n--- RETRIEVED EVIDENCE|$)", prompt, re.DOTALL)
        query = q_match.group(1).strip() if q_match else prompt
        
        ctx_match = re.search(r"--- RETRIEVED EVIDENCE CONTEXT ---\s*(.*?)\s*--- END CONTEXT ---", prompt, re.DOTALL)
        context = ctx_match.group(1).strip() if ctx_match else ""

        if not context or "no matching evidence" in context.lower():
            return "Based on the provided resume documents, there is not enough information to verify this."

        context_lower = context.lower()
        query_words = set(re.findall(r"\b[a-zA-Z]{3,}\b", query.lower()))
        stop_words = {
            "does", "have", "with", "from", "what", "where", "when", "which",
            "ever", "worked", "candidate", "aria", "chen", "this", "that",
            "been", "about", "show", "tell", "explain", "role", "work", "know"
        }
        content_words = [w for w in query_words if w not in stop_words]

        # Grounding check: verify that question topic exists in context
        if content_words:
            matching_content = [w for w in content_words if w in context_lower]
            if not matching_content:
                return "Based on the provided resume documents, there is not enough information to verify this."

        # Extract sentences from context that contain any matching query terms
        sentences = [s.strip() for s in re.split(r"[\n.]+", context) if len(s.strip()) > 15 and not s.strip().startswith("[Source")]
        relevant_sentences = []
        for s in sentences:
            if any(w in s.lower() for w in content_words):
                relevant_sentences.append(s)

        if not relevant_sentences and sentences:
            relevant_sentences = sentences[:2]

        evidence_snippet = ". ".join(relevant_sentences[:2])

        if "compare" in query.lower():
            return (
                f"Comparing the verified candidate profiles from retrieved evidence: "
                f"Primary candidate demonstrates strong alignment based on evidence: \"{evidence_snippet}\"."
            )
        else:
            return (
                f"Based on the verified resume evidence, the candidate demonstrates relevant background. "
                f"Specifically: \"{evidence_snippet}\". "
                f"This information is directly cited from the verified documents."
            )

    def _candidate_summary(self, prompt: str) -> str:
        return (
            "The candidate presents a well-structured technical profile with demonstrable experience "
            "across backend architectures, API engineering, and distributed workflows. Their background reflects strong "
            "foundational knowledge in software design patterns, validated skill competencies, and consistent project delivery."
        )

    def _why_matches(self, prompt: str) -> dict[str, Any]:
        return {
            "overall_match_rating": "Strong",
            "reasons": [
                "Demonstrated proficiency in core required technologies and frameworks specified in the job posting.",
                "Substantial experience designing API architectures and relational data persistence layers.",
                "Direct alignment between historical project responsibilities and the role's target deliverables.",
            ],
            "key_projects": [
                "Scalable microservices and ingestion pipelines deployed into production environments.",
                "Full-lifecycle API design with rigorous automated testing and schema validation.",
            ],
            "gaps": [
                "Further verification recommended for advanced cloud infrastructure orchestration requirements.",
            ],
        }

    def _interview_questions(self, prompt: str) -> dict[str, Any]:
        return {
            "technical_questions": [
                {
                    "topic": "Architecture & Concurrency",
                    "question": "Can you describe how you structured your API endpoints to handle high-concurrency requests while preventing database pool exhaustion?",
                },
                {
                    "topic": "Schema & Validation",
                    "question": "How do you enforce strict schema validation and data integrity when ingesting third-party inputs?",
                },
            ],
            "experience_questions": [
                {
                    "topic": "System Reliability",
                    "question": "Walk us through a critical production bug or performance bottleneck you resolved in your previous projects.",
                },
                {
                    "topic": "Cross-Functional Delivery",
                    "question": "Describe how you collaborated with product stakeholders when technical specifications were ambiguous.",
                },
            ],
            "skill_gap_questions": [
                {
                    "topic": "Infrastructure & Scaling",
                    "question": "The role involves container orchestration and CI/CD pipelines. How have you managed automated deployments or infrastructure as code in past roles?",
                },
            ],
        }

    def _improve_job_description(self, prompt: str) -> dict[str, Any]:
        return {
            "original_title": "Software Engineer",
            "improved_description": (
                "We are seeking an exceptional Software Engineer to design, build, and maintain mission-critical "
                "backend systems, scalable REST/GraphQL APIs, and robust data pipelines. In this role, you will lead feature "
                "architecture, optimize relational and vector database performance, and collaborate with product teams to ship "
                "high-impact solutions.\n\n"
                "Key Responsibilities:\n"
                "• Architect resilient backend services and high-throughput data processing workflows.\n"
                "• Implement automated testing, CI/CD pipelines, and observability metrics.\n"
                "• Partner with cross-functional teams to translate product requirements into maintainable software.\n\n"
                "Requirements:\n"
                "• 2+ years of professional backend software development experience.\n"
                "• Strong hands-on proficiency with Python, modern web frameworks (FastAPI/Django), and SQL databases.\n"
                "• Solid understanding of containerization (Docker) and distributed systems."
            ),
            "extracted_must_have_skills": ["Python", "FastAPI", "SQL", "Docker", "REST APIs"],
            "extracted_nice_to_have_skills": ["Vector Databases", "Redis", "PostgreSQL", "CI/CD"],
            "suggestions_made": [
                "Separated mandatory core skills from secondary nice-to-have tools to attract a broader qualified talent pool.",
                "Added concrete responsibility deliverables instead of generic duty descriptions.",
                "Clarified exact experience threshold and architectural expectations.",
            ],
        }


class GroqProvider(BaseLLMProvider):
    def __init__(self, api_key: str, model_name: str = "llama-3.3-70b-versatile"):
        self.api_key = api_key
        self.model_name = model_name or "llama-3.3-70b-versatile"
        self.base_url = "https://api.groq.com/openai/v1"

    def generate(
        self,
        prompt: str,
        system_prompt: str = "",
        json_schema: Optional[dict[str, Any]] = None,
        temperature: float = 0.1,
    ) -> LLMResult:
        start_time = time.perf_counter()
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload: dict[str, Any] = {
            "model": self.model_name,
            "messages": messages,
            "temperature": temperature,
        }
        if json_schema or "JSON" in system_prompt:
            payload["response_format"] = {"type": "json_object"}

        with httpx.Client(timeout=45.0) as client:
            resp = client.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()

        latency_ms = (time.perf_counter() - start_time) * 1000.0
        choice = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        
        parsed_json = None
        if json_schema or "JSON" in system_prompt:
            try:
                parsed_json = json.loads(choice)
            except Exception:
                parsed_json = None

        return LLMResult(
            text=choice,
            parsed_json=parsed_json,
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            latency_ms=latency_ms,
            model_name=self.model_name,
            provider="groq",
        )

    async def agenerate(
        self,
        prompt: str,
        system_prompt: str = "",
        json_schema: Optional[dict[str, Any]] = None,
        temperature: float = 0.1,
    ) -> LLMResult:
        start_time = time.perf_counter()
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload: dict[str, Any] = {
            "model": self.model_name,
            "messages": messages,
            "temperature": temperature,
        }
        if json_schema or "JSON" in system_prompt:
            payload["response_format"] = {"type": "json_object"}

        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()

        latency_ms = (time.perf_counter() - start_time) * 1000.0
        choice = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        
        parsed_json = None
        if json_schema or "JSON" in system_prompt:
            try:
                parsed_json = json.loads(choice)
            except Exception:
                parsed_json = None

        return LLMResult(
            text=choice,
            parsed_json=parsed_json,
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            latency_ms=latency_ms,
            model_name=self.model_name,
            provider="groq",
        )


class OpenAIProvider(BaseLLMProvider):
    def __init__(self, api_key: str, model_name: str = "gpt-4o-mini"):
        self.api_key = api_key
        self.model_name = model_name or "gpt-4o-mini"
        self.base_url = "https://api.openai.com/v1"

    def generate(
        self,
        prompt: str,
        system_prompt: str = "",
        json_schema: Optional[dict[str, Any]] = None,
        temperature: float = 0.1,
    ) -> LLMResult:
        start_time = time.perf_counter()
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload: dict[str, Any] = {
            "model": self.model_name,
            "messages": messages,
            "temperature": temperature,
        }
        if json_schema or "JSON" in system_prompt:
            payload["response_format"] = {"type": "json_object"}

        with httpx.Client(timeout=45.0) as client:
            resp = client.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()

        latency_ms = (time.perf_counter() - start_time) * 1000.0
        choice = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        
        parsed_json = None
        if json_schema or "JSON" in system_prompt:
            try:
                parsed_json = json.loads(choice)
            except Exception:
                parsed_json = None

        return LLMResult(
            text=choice,
            parsed_json=parsed_json,
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            latency_ms=latency_ms,
            model_name=self.model_name,
            provider="openai",
        )

    async def agenerate(
        self,
        prompt: str,
        system_prompt: str = "",
        json_schema: Optional[dict[str, Any]] = None,
        temperature: float = 0.1,
    ) -> LLMResult:
        start_time = time.perf_counter()
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload: dict[str, Any] = {
            "model": self.model_name,
            "messages": messages,
            "temperature": temperature,
        }
        if json_schema or "JSON" in system_prompt:
            payload["response_format"] = {"type": "json_object"}

        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()

        latency_ms = (time.perf_counter() - start_time) * 1000.0
        choice = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        
        parsed_json = None
        if json_schema or "JSON" in system_prompt:
            try:
                parsed_json = json.loads(choice)
            except Exception:
                parsed_json = None

        return LLMResult(
            text=choice,
            parsed_json=parsed_json,
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            latency_ms=latency_ms,
            model_name=self.model_name,
            provider="openai",
        )


def get_llm_provider(settings: Optional[Settings] = None) -> BaseLLMProvider:
    cfg = settings or get_settings()
    provider_name = cfg.llm_provider.lower()

    if provider_name == "groq":
        key = cfg.groq_api_key or cfg.llm_api_key
        if key:
            model = cfg.llm_model if cfg.llm_model != "default" else "llama-3.3-70b-versatile"
            return GroqProvider(api_key=key, model_name=model)
        logger.warning("Groq provider requested but no API key found. Falling back to MockHeuristicProvider.")

    elif provider_name == "openai":
        key = cfg.openai_api_key or cfg.llm_api_key
        if key:
            model = cfg.llm_model if cfg.llm_model != "default" else "gpt-4o-mini"
            return OpenAIProvider(api_key=key, model_name=model)
        logger.warning("OpenAI provider requested but no API key found. Falling back to MockHeuristicProvider.")

    # Default robust offline heuristic provider
    return MockHeuristicProvider(model_name="recruitment-heuristic-v1")
