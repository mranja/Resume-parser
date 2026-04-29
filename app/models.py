from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.database import Base


JsonList = JSON().with_variant(JSONB, "postgresql")


class Candidate(Base):
    __tablename__ = "candidates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    full_name: Mapped[str] = mapped_column(String(160), index=True)
    email: Mapped[str | None] = mapped_column(String(255), index=True)
    phone: Mapped[str | None] = mapped_column(String(40))
    location: Mapped[str | None] = mapped_column(String(160))
    resume_filename: Mapped[str] = mapped_column(String(255))
    resume_text: Mapped[str] = mapped_column(Text)
    skills: Mapped[list[str]] = mapped_column(JsonList, default=list)
    education: Mapped[list[str]] = mapped_column(JsonList, default=list)
    years_experience: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    matches: Mapped[list["MatchScore"]] = relationship(
        back_populates="candidate",
        cascade="all, delete-orphan",
    )


class JobPosting(Base):
    __tablename__ = "job_postings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(180), index=True)
    company: Mapped[str] = mapped_column(String(180), default="Internal")
    description: Mapped[str] = mapped_column(Text)
    required_skills: Mapped[list[str]] = mapped_column(JsonList, default=list)
    min_years_experience: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    matches: Mapped[list["MatchScore"]] = relationship(
        back_populates="job",
        cascade="all, delete-orphan",
    )


class MatchScore(Base):
    __tablename__ = "match_scores"
    __table_args__ = (
        UniqueConstraint("candidate_id", "job_id", name="uq_candidate_job_match"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id"), index=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("job_postings.id"), index=True)
    score: Mapped[float] = mapped_column(Float, index=True)
    skill_score: Mapped[float] = mapped_column(Float)
    keyword_score: Mapped[float] = mapped_column(Float)
    experience_score: Mapped[float] = mapped_column(Float)
    matched_skills: Mapped[list[str]] = mapped_column(JsonList, default=list)
    missing_skills: Mapped[list[str]] = mapped_column(JsonList, default=list)
    summary: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    candidate: Mapped[Candidate] = relationship(back_populates="matches")
    job: Mapped[JobPosting] = relationship(back_populates="matches")
