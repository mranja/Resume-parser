from fastapi import APIRouter

from app.api.audit import router as audit_router
from app.api.candidates import router as candidates_router
from app.api.evaluation import router as evaluation_router
from app.api.genai import router as genai_router
from app.api.jobs import router as jobs_router
from app.api.matches import router as matches_router
from app.api.rag import router as rag_router

router = APIRouter(prefix="/api")

router.include_router(candidates_router, tags=["Candidates"])
router.include_router(jobs_router, tags=["Jobs"])
router.include_router(matches_router, tags=["Matching"])
router.include_router(rag_router, tags=["RAG Assistant"])
router.include_router(genai_router, tags=["GenAI Features"])
router.include_router(evaluation_router, tags=["Evaluation"])
router.include_router(audit_router, tags=["Audit & Telemetry"])
