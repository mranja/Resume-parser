from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.config import get_settings
from app.core.exceptions import AppException, app_exception_handler, unhandled_exception_handler
from app.core.middleware import RequestContextMiddleware
from app.database import Base, engine
from app.models import AuditLog, Candidate, ChatMessage, ChatSession, DocumentChunk, JobPosting, MatchScore

_ = (Candidate, JobPosting, MatchScore, DocumentChunk, ChatSession, ChatMessage, AuditLog)

settings = get_settings()


def seed_default_roles():
    from sqlalchemy import select
    from app.database import SessionLocal
    with SessionLocal() as db:
        existing_titles = set(db.scalars(select(JobPosting.title)))
        predefined_jobs = [
            {
                "title": "Senior Frontend Engineer",
                "company": "WebStudio UI",
                "min_years_experience": 3.0,
                "required_skills": ["react", "typescript", "tailwind", "next.js", "javascript", "css", "html"],
                "description": "Lead modern frontend web development building responsive interfaces, design systems, and state management in React, TypeScript, and Tailwind CSS.",
            },
            {
                "title": "Backend Infrastructure Architect",
                "company": "CloudForge",
                "min_years_experience": 3.0,
                "required_skills": ["python", "fastapi", "docker", "postgresql", "redis", "kubernetes"],
                "description": "Architect and scale mission-critical backend services, RESTful APIs, relational databases, and asynchronous distributed pipelines.",
            },
            {
                "title": "Full Stack Software Engineer",
                "company": "FinTech Core",
                "min_years_experience": 3.0,
                "required_skills": ["python", "react", "node.js", "postgresql", "docker", "aws"],
                "description": "Build end-to-end features spanning React web clients, Python/Node microservices, secure authentication, and cloud infrastructure.",
            },
            {
                "title": "AI & Machine Learning Engineer",
                "company": "DeepSignal AI",
                "min_years_experience": 4.0,
                "required_skills": ["python", "pytorch", "langchain", "embeddings", "rag", "vector search", "llm"],
                "description": "Develop and deploy production GenAI systems, RAG retrieval pipelines, fine-tuned embeddings, and LLM evaluation frameworks.",
            },
            {
                "title": "DevOps & Cloud SRE Architect",
                "company": "InfraScale Systems",
                "min_years_experience": 4.0,
                "required_skills": ["docker", "kubernetes", "terraform", "aws", "ci/cd", "linux", "monitoring"],
                "description": "Automate cloud infrastructure deployments, container orchestration, CI/CD delivery pipelines, and site reliability engineering.",
            },
            {
                "title": "Data Platform Engineer",
                "company": "DataFlow Analytics",
                "min_years_experience": 3.0,
                "required_skills": ["python", "sql", "spark", "kafka", "dbt", "postgresql", "airflow"],
                "description": "Build high-throughput streaming and batch data processing pipelines, ETL workflows, and analytical data warehouses.",
            },
            {
                "title": "UI/UX Product Designer",
                "company": "DesignSys Studio",
                "min_years_experience": 3.0,
                "required_skills": ["figma", "wireframe", "prototyping", "design systems", "auto-layout", "typography"],
                "description": "Create intuitive digital user journeys, component design systems, high-fidelity prototypes, and design specs in Figma.",
            },
        ]
        for job_data in predefined_jobs:
            if job_data["title"] not in existing_titles:
                job = JobPosting(
                    title=job_data["title"],
                    company=job_data["company"],
                    min_years_experience=job_data["min_years_experience"],
                    required_skills=job_data["required_skills"],
                    nice_to_have_skills=[],
                    description=job_data["description"],
                )
                db.add(job)
        db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    try:
        seed_default_roles()
    except Exception:
        pass
    yield


app = FastAPI(
    title="TalentSignal | GenAI Recruitment & Resume Intelligence",
    description="Production-grade GenAI recruitment platform with LLM structured extraction, embeddings, hybrid semantic matching, RAG assistant, evaluation benchmarks, and responsible AI safeguards.",
    version="2.0.0",
    lifespan=lifespan,
)

# Core Middleware
app.add_middleware(RequestContextMiddleware)

# Custom Exception Handlers
app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

# Mount Routes
app.include_router(router)
app.mount("/static", StaticFiles(directory="app/static"), name="static")


@app.get("/health", tags=["Health"])
def health_check() -> dict[str, str]:
    cfg = get_settings()
    return {
        "status": "healthy",
        "version": "2.0.0",
        "llm_provider": cfg.llm_provider,
        "embedding_provider": cfg.embedding_provider,
        "vector_store": cfg.vector_store,
        "disclaimer": cfg.ai_disclaimer,
    }


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse("app/static/index.html")
