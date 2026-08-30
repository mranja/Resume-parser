from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.database import get_db
from app.models import Candidate, JobPosting
from app.schemas import (
    CandidateComparisonRequest,
    CandidateComparisonResponse,
    CandidateSummaryResponse,
    InterviewQuestionsResponse,
    WhyMatchesResponse,
)
from app.services.audit import AuditService
from app.services.genai import GenAIService

router = APIRouter()
logger = get_logger("api.genai")


@router.post("/genai/candidates/{candidate_id}/summary", response_model=CandidateSummaryResponse)
def candidate_summary(candidate_id: int, db: Session = Depends(get_db)) -> CandidateSummaryResponse:
    candidate = db.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found.")

    genai = GenAIService()
    res = genai.generate_candidate_summary(candidate)

    AuditService(db).log_event(
        action="GENAI_SUMMARY",
        resource_type="candidate",
        resource_id=str(candidate.id),
        latency_ms=res.latency_ms,
    )

    return res


@router.post("/genai/candidates/{candidate_id}/why-matches/{job_id}", response_model=WhyMatchesResponse)
def why_matches(candidate_id: int, job_id: int, db: Session = Depends(get_db)) -> WhyMatchesResponse:
    candidate = db.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found.")

    job = db.get(JobPosting, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job posting not found.")

    genai = GenAIService()
    res = genai.generate_why_matches(candidate, job)

    AuditService(db).log_event(
        action="GENAI_WHY_MATCHES",
        resource_type="candidate",
        resource_id=str(candidate.id),
        metadata={"job_id": job.id},
    )

    return res


@router.post("/genai/candidates/{candidate_id}/interview-questions/{job_id}", response_model=InterviewQuestionsResponse)
def interview_questions(candidate_id: int, job_id: int, db: Session = Depends(get_db)) -> InterviewQuestionsResponse:
    candidate = db.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found.")

    job = db.get(JobPosting, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job posting not found.")

    genai = GenAIService()
    res = genai.generate_interview_questions(candidate, job)

    AuditService(db).log_event(
        action="GENAI_INTERVIEW_QUESTIONS",
        resource_type="candidate",
        resource_id=str(candidate.id),
        metadata={"job_id": job.id},
    )

    return res


@router.post("/genai/compare", response_model=CandidateComparisonResponse)
def compare_candidates(payload: CandidateComparisonRequest, db: Session = Depends(get_db)) -> CandidateComparisonResponse:
    job = db.get(JobPosting, payload.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job posting not found.")

    candidates = list(db.scalars(select(Candidate).where(Candidate.id.in_(payload.candidate_ids))))
    if len(candidates) < 2:
        raise HTTPException(status_code=400, detail="Select at least two valid candidates to compare.")

    genai = GenAIService()
    res = genai.compare_candidates(candidates, job)

    AuditService(db).log_event(
        action="GENAI_COMPARE_CANDIDATES",
        resource_type="job",
        resource_id=str(job.id),
        metadata={"candidate_ids": payload.candidate_ids},
    )

    return res
