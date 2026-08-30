from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.database import get_db
from app.models import JobPosting
from app.retrieval.pipeline import RetrievalPipeline
from app.schemas import JobCreate, JobImprovementResponse, JobRead
from app.services.audit import AuditService
from app.services.genai import GenAIService
from app.services.nlp import extract_required_skills

router = APIRouter()
logger = get_logger("api.jobs")


@router.post("/jobs", response_model=JobRead, status_code=status.HTTP_201_CREATED)
def create_job(payload: JobCreate, db: Session = Depends(get_db)) -> JobPosting:
    req_skills = payload.required_skills or extract_required_skills(payload.description)
    nice_skills = payload.nice_to_have_skills or []

    job = JobPosting(
        title=payload.title,
        company=payload.company,
        description=payload.description,
        min_years_experience=payload.min_years_experience,
        required_skills=req_skills,
        nice_to_have_skills=nice_skills,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Index job description chunks in vector store (Phase 3)
    try:
        pipeline = RetrievalPipeline(db)
        chunk_count = pipeline.index_job(job)
        logger.info("Indexed job posting %d with %d chunks.", job.id, chunk_count)
    except Exception as exc:
        logger.warning("Vector indexing job %d failed: %s", job.id, exc)

    AuditService(db).log_event(
        action="JOB_CREATED",
        resource_type="job",
        resource_id=str(job.id),
        metadata={"title": job.title, "skills_count": len(req_skills)},
    )

    return job


@router.get("/jobs", response_model=list[JobRead])
def list_jobs(db: Session = Depends(get_db)) -> list[JobPosting]:
    return list(db.scalars(select(JobPosting).order_by(JobPosting.created_at.desc())))


@router.get("/jobs/{job_id}", response_model=JobRead)
def get_job(job_id: int, db: Session = Depends(get_db)) -> JobPosting:
    job = db.get(JobPosting, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job posting not found.")
    return job


@router.post("/jobs/{job_id}/improve", response_model=JobImprovementResponse)
def improve_job(job_id: int, db: Session = Depends(get_db)) -> JobImprovementResponse:
    job = db.get(JobPosting, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job posting not found.")

    genai = GenAIService()
    improvement = genai.improve_job_description(job)

    job.improved_description = improvement.improved_description
    db.commit()

    AuditService(db).log_event(
        action="JOB_DESCRIPTION_IMPROVED",
        resource_type="job",
        resource_id=str(job.id),
    )

    return improvement
