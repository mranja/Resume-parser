from datetime import datetime

from pydantic import BaseModel, Field


class CandidateRead(BaseModel):
    id: int
    full_name: str
    email: str | None
    phone: str | None
    location: str | None
    resume_filename: str
    skills: list[str]
    education: list[str]
    years_experience: float
    created_at: datetime

    model_config = {"from_attributes": True}


class JobCreate(BaseModel):
    title: str = Field(min_length=2, max_length=180)
    company: str = Field(default="Internal", max_length=180)
    description: str = Field(min_length=20)
    min_years_experience: float = Field(default=0.0, ge=0)


class JobRead(BaseModel):
    id: int
    title: str
    company: str
    description: str
    required_skills: list[str]
    min_years_experience: float
    created_at: datetime

    model_config = {"from_attributes": True}


class MatchRequest(BaseModel):
    job_id: int


class MatchRead(BaseModel):
    id: int
    candidate_id: int
    job_id: int
    score: float
    skill_score: float
    keyword_score: float
    experience_score: float
    matched_skills: list[str]
    missing_skills: list[str]
    summary: str
    candidate: CandidateRead

    model_config = {"from_attributes": True}
