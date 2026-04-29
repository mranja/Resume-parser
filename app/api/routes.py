from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.database import get_db
from app.models import Candidate, JobPosting, MatchScore
from app.schemas import CandidateRead, JobCreate, JobRead, MatchRead, MatchRequest
from app.services.nlp import extract_required_skills, parse_resume_text, score_candidate
from app.services.pdf import extract_pdf_text

router = APIRouter(prefix="/api")


@router.post("/candidates", response_model=CandidateRead, status_code=status.HTTP_201_CREATED)
async def create_candidate(
    resume: UploadFile = File(...),
    full_name: str | None = Form(default=None),
    db: Session = Depends(get_db),
) -> Candidate:
    settings = get_settings()
    if resume.content_type not in {"application/pdf", "application/x-pdf"}:
        raise HTTPException(status_code=400, detail="Only PDF resumes are supported.")

    data = await resume.read()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(data) > max_bytes:
        raise HTTPException(status_code=413, detail=f"Resume exceeds {settings.max_upload_mb} MB.")

    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    safe_name = Path(resume.filename or "resume.pdf").name
    stored_filename = f"{uuid4().hex}_{safe_name}"
    stored_path = settings.upload_dir / stored_filename
    stored_path.write_bytes(data)

    try:
        resume_text = extract_pdf_text(stored_path)
        parsed = parse_resume_text(resume_text)
    except ValueError as exc:
        stored_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    candidate = Candidate(
        full_name=full_name or parsed.full_name,
        email=parsed.email,
        phone=parsed.phone,
        location=parsed.location,
        resume_filename=stored_filename,
        resume_text=parsed.text,
        skills=parsed.skills,
        education=parsed.education,
        years_experience=parsed.years_experience,
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return candidate


@router.get("/candidates", response_model=list[CandidateRead])
def list_candidates(db: Session = Depends(get_db)) -> list[Candidate]:
    return list(db.scalars(select(Candidate).order_by(Candidate.created_at.desc())))


@router.post("/jobs", response_model=JobRead, status_code=status.HTTP_201_CREATED)
def create_job(payload: JobCreate, db: Session = Depends(get_db)) -> JobPosting:
    job = JobPosting(
        title=payload.title,
        company=payload.company,
        description=payload.description,
        min_years_experience=payload.min_years_experience,
        required_skills=extract_required_skills(payload.description),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.get("/jobs", response_model=list[JobRead])
def list_jobs(db: Session = Depends(get_db)) -> list[JobPosting]:
    return list(db.scalars(select(JobPosting).order_by(JobPosting.created_at.desc())))


@router.post("/matches", response_model=list[MatchRead])
def create_matches(payload: MatchRequest, db: Session = Depends(get_db)) -> list[MatchScore]:
    job = db.get(JobPosting, payload.job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job posting not found.")

    candidates = list(db.scalars(select(Candidate)))
    if not candidates:
        raise HTTPException(status_code=409, detail="Upload at least one candidate before matching.")

    matches: list[MatchScore] = []
    for candidate in candidates:
        breakdown = score_candidate(
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
        match.keyword_score = breakdown.keyword_score
        match.experience_score = breakdown.experience_score
        match.matched_skills = breakdown.matched_skills
        match.missing_skills = breakdown.missing_skills
        match.summary = breakdown.summary
        db.add(match)
        matches.append(match)

    db.commit()
    for match in matches:
        db.refresh(match)

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
