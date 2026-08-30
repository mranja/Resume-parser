from pathlib import Path
from uuid import uuid4
from typing import Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.logging import get_logger
from app.core.security import mask_email, mask_name, mask_phone, validate_pdf_content
from app.database import get_db
from app.models import Candidate
from app.retrieval.pipeline import RetrievalPipeline
from app.schemas import CandidateDetailRead, CandidateRead
from app.services.audit import AuditService
from app.services.extraction import ResumeExtractionService
from app.services.pdf import extract_pdf_text

router = APIRouter()
logger = get_logger("api.candidates")


@router.post("/candidates", response_model=CandidateRead, status_code=status.HTTP_201_CREATED)
async def create_candidate(
    resume: UploadFile = File(...),
    full_name: Optional[str] = Form(default=None),
    db: Session = Depends(get_db),
) -> Candidate:
    settings = get_settings()

    # Content type check
    if resume.content_type not in {"application/pdf", "application/x-pdf", "binary/octet-stream"}:
        raise HTTPException(status_code=400, detail="Only PDF resumes are supported.")

    data = await resume.read()
    
    # PDF magic byte and size security validation (Phase 7)
    try:
        validate_pdf_content(data, settings.max_upload_mb)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid file: {exc}") from exc

    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    safe_name = Path(resume.filename or "resume.pdf").name
    stored_filename = f"{uuid4().hex}_{safe_name}"
    stored_path = settings.upload_dir / stored_filename
    stored_path.write_bytes(data)

    # 1. Text extraction & normalization (Phase 2)
    try:
        resume_text = extract_pdf_text(stored_path)
    except ValueError as exc:
        stored_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # 2. LLM structured extraction with Pydantic schema and fallback (Phase 2)
    extraction_service = ResumeExtractionService()
    outcome = extraction_service.extract_candidate_profile(resume_text)
    profile = outcome.profile

    final_name = full_name or profile.full_name or "Unknown Candidate"

    candidate = Candidate(
        full_name=final_name,
        email=profile.contact.email,
        phone=profile.contact.phone,
        location=profile.contact.location,
        linkedin=profile.contact.linkedin,
        github=profile.contact.github,
        resume_filename=stored_filename,
        resume_text=resume_text,  # Stored separately from structured data
        structured_profile=profile.model_dump(),
        skills=profile.skills,
        education=[f"{e.degree} - {e.institution}" for e in profile.education] if profile.education else [],
        years_experience=profile.total_years_experience,
        extraction_method=outcome.extraction_method,
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)

    # 3. Vector chunking and indexing for semantic search (Phase 3)
    try:
        pipeline = RetrievalPipeline(db)
        chunk_count = pipeline.index_candidate(candidate)
        logger.info("Indexed candidate %d with %d chunks.", candidate.id, chunk_count)
    except Exception as exc:
        logger.warning("Vector indexing candidate %d failed: %s", candidate.id, exc)

    # 4. Audit log (Phase 7)
    AuditService(db).log_event(
        action="CANDIDATE_INGESTION",
        resource_type="candidate",
        resource_id=str(candidate.id),
        model_name=outcome.extraction_method,
        metadata={"filename": safe_name, "skills_detected": len(profile.skills)},
    )

    return candidate


@router.get("/candidates", response_model=list[CandidateRead])
def list_candidates(
    blind_mode: bool = Query(default=False, description="Enable blind screening to mask PII for responsible hiring"),
    db: Session = Depends(get_db),
) -> list[Candidate]:
    candidates = list(db.scalars(select(Candidate).order_by(Candidate.created_at.desc())))
    if not blind_mode:
        return candidates

    # Apply PII masking for blind screening
    masked_list = []
    for c in candidates:
        masked_c = Candidate(
            id=c.id,
            full_name=mask_name(c.full_name),
            email=mask_email(c.email),
            phone=mask_phone(c.phone),
            location="[REDACTED_LOCATION]",
            linkedin="[REDACTED]",
            github=c.github,
            resume_filename=c.resume_filename,
            resume_text=c.resume_text,
            structured_profile=c.structured_profile,
            skills=c.skills,
            education=c.education,
            years_experience=c.years_experience,
            extraction_method=c.extraction_method,
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        masked_list.append(masked_c)
    return masked_list


@router.get("/candidates/{candidate_id}", response_model=CandidateDetailRead)
def get_candidate(candidate_id: int, db: Session = Depends(get_db)) -> Candidate:
    candidate = db.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    return candidate


@router.delete("/candidates/{candidate_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_candidate(candidate_id: int, db: Session = Depends(get_db)) -> None:
    candidate = db.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    
    # Remove vector chunks
    RetrievalPipeline(db).vector_store.delete_document_chunks("candidate", candidate_id)

    db.delete(candidate)
    db.commit()
