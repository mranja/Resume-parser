from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.logging import get_logger
from app.database import get_db
from app.matching.engine import HybridMatchingEngine
from app.models import Candidate, JobPosting, MatchScore
from app.schemas import MatchRead, MatchRequest
from app.services.audit import AuditService

router = APIRouter()
logger = get_logger("api.matches")


@router.post("/matches", response_model=list[MatchRead])
def create_matches(payload: MatchRequest, db: Session = Depends(get_db)) -> list[MatchScore]:
    job = db.get(JobPosting, payload.job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job posting not found.")

    candidates = list(db.scalars(select(Candidate)))
    if not candidates:
        raise HTTPException(status_code=409, detail="Upload at least one candidate before matching.")

    matcher = HybridMatchingEngine()
    matches: list[MatchScore] = []

    for candidate in candidates:
        breakdown = matcher.compute_match(
            resume_text=candidate.resume_text,
            candidate_skills=candidate.skills,
            candidate_years=candidate.years_experience,
            job_description=job.description,
            required_skills=job.required_skills,
            min_years=job.min_years_experience,
        )

        existing = db.scalar(
            select(MatchScore).where(
                MatchScore.candidate_id == candidate.id,
                MatchScore.job_id == job.id,
            )
        )
        match = existing or MatchScore(candidate_id=candidate.id, job_id=job.id)
        match.score = breakdown.score
        match.skill_score = breakdown.skill_score
        match.semantic_score = breakdown.semantic_score
        match.keyword_score = breakdown.keyword_score
        match.experience_score = breakdown.experience_score
        match.matched_skills = breakdown.matched_skills
        match.missing_skills = breakdown.missing_skills
        match.summary = breakdown.summary
        match.evidence_snippets = breakdown.evidence_snippets

        db.add(match)
        matches.append(match)

    db.commit()

    AuditService(db).log_event(
        action="MATCH_SCORES_GENERATED",
        resource_type="job",
        resource_id=str(job.id),
        metadata={"candidate_count": len(candidates), "top_score": max(m.score for m in matches)},
    )

    return get_matches(payload.job_id, db)


@router.get("/matches/{job_id}", response_model=list[MatchRead])
def get_matches(job_id: int, db: Session = Depends(get_db)) -> list[MatchScore]:
    return list(
        db.scalars(
            select(MatchScore)
            .where(MatchScore.job_id == job_id)
            .options(selectinload(MatchScore.candidate))
            .order_by(MatchScore.score.desc())
        )
    )
