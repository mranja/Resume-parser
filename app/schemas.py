from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field


# --- Phase 2: CandidateProfile & Nested Schemas ---

class ContactInfo(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None


class EducationItem(BaseModel):
    institution: str
    degree: str
    field_of_study: Optional[str] = None
    graduation_year: Optional[str] = None
    grade_or_gpa: Optional[str] = None


class ExperienceItem(BaseModel):
    company: str
    title: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    years: Optional[float] = 0.0
    description: Optional[str] = None
    highlights: list[str] = Field(default_factory=list)


class ProjectItem(BaseModel):
    name: str
    description: Optional[str] = None
    technologies: list[str] = Field(default_factory=list)
    link: Optional[str] = None


class CandidateProfile(BaseModel):
    full_name: str
    contact: ContactInfo = Field(default_factory=ContactInfo)
    skills: list[str] = Field(default_factory=list)
    technologies: list[str] = Field(default_factory=list)
    education: list[EducationItem] = Field(default_factory=list)
    experience: list[ExperienceItem] = Field(default_factory=list)
    projects: list[ProjectItem] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    total_years_experience: float = 0.0
    summary: Optional[str] = None


# --- Candidate API Schemas ---

class CandidateRead(BaseModel):
    id: int
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    resume_filename: str
    resume_text: Optional[str] = ""
    skills: list[str]
    education: list[str]
    years_experience: float
    extraction_method: str = "rule_based"
    structured_profile: Optional[dict[str, Any]] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CandidateDetailRead(CandidateRead):
    resume_text: str


# --- Job Schemas ---

class JobCreate(BaseModel):
    title: str = Field(min_length=2, max_length=180)
    company: str = Field(default="Internal", max_length=180)
    description: str = Field(min_length=15)
    min_years_experience: float = Field(default=0.0, ge=0)
    required_skills: Optional[list[str]] = None
    nice_to_have_skills: Optional[list[str]] = None


class JobRead(BaseModel):
    id: int
    title: str
    company: str
    description: str
    required_skills: list[str]
    nice_to_have_skills: list[str] = Field(default_factory=list)
    min_years_experience: float
    improved_description: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Matching Schemas ---

class MatchRequest(BaseModel):
    job_id: int


class EvidenceSnippet(BaseModel):
    section: str
    snippet: str
    relevance: float = 1.0


class MatchRead(BaseModel):
    id: int
    candidate_id: int
    job_id: int
    score: float
    skill_score: float
    semantic_score: float = 0.0
    keyword_score: float
    experience_score: float
    matched_skills: list[str]
    missing_skills: list[str]
    summary: str
    evidence_snippets: list[dict[str, Any]] = Field(default_factory=list)
    why_matches: Optional[str] = None
    candidate: CandidateRead

    model_config = {"from_attributes": True}


# --- RAG & Chat Schemas ---

class ChatCitation(BaseModel):
    source_type: str  # 'resume' | 'job'
    source_name: str
    section: Optional[str] = None
    snippet: str


class ChatMessageRequest(BaseModel):
    query: str = Field(min_length=2)
    session_id: Optional[str] = None
    job_id: Optional[int] = None
    candidate_id: Optional[int] = None


class ChatMessageResponse(BaseModel):
    session_id: str
    role: str = "assistant"
    answer: str
    citations: list[ChatCitation] = Field(default_factory=list)
    latency_ms: float = 0.0
    tokens_used: int = 0
    grounded: bool = True


# --- GenAI Features Schemas ---

class CandidateSummaryResponse(BaseModel):
    candidate_id: int
    candidate_name: str
    summary: str
    key_strengths: list[str]
    latency_ms: float = 0.0


class WhyMatchesResponse(BaseModel):
    candidate_id: int
    job_id: int
    overall_match_rating: str  # Strong | Moderate | Potential
    reasons: list[str]
    key_projects: list[str]
    gaps: list[str]


class InterviewQuestionsResponse(BaseModel):
    candidate_id: int
    job_id: int
    technical_questions: list[dict[str, str]]
    experience_questions: list[dict[str, str]]
    skill_gap_questions: list[dict[str, str]]


class CandidateComparisonRequest(BaseModel):
    candidate_ids: list[int] = Field(min_length=2, max_length=5)
    job_id: int


class CandidateComparisonResponse(BaseModel):
    job_title: str
    comparison_table: list[dict[str, Any]]
    recommendation_rationale: str


class JobImprovementResponse(BaseModel):
    job_id: int
    original_title: str
    improved_description: str
    extracted_must_have_skills: list[str]
    extracted_nice_to_have_skills: list[str]
    suggestions_made: list[str]


# --- Evaluation Schemas ---

class EvaluationMetrics(BaseModel):
    field_extraction_accuracy: float
    skill_extraction_f1: float
    retrieval_recall_at_3: float
    retrieval_precision_at_3: float
    semantic_match_correlation: float
    rag_faithfulness_rate: float
    avg_latency_ms: float
    total_tokens_evaluated: int
    benchmark_dataset_size: int
    evaluated_at: datetime
