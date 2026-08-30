from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Candidate, JobPosting
from app.retrieval.pipeline import RetrievalPipeline
from app.services.genai import GenAIService
from app.services.rag import RAGRecruitmentAssistant


def setup_in_memory_db():
    test_engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=test_engine)
    session_factory = sessionmaker(bind=test_engine)
    return session_factory()


def test_rag_assistant_grounded_answer():
    db = setup_in_memory_db()
    candidate = Candidate(
        full_name="Jordan Lee",
        email="jordan.lee@example.com",
        resume_filename="jordan.pdf",
        resume_text="Jordan Lee is an expert in Kubernetes and Docker container orchestration with 4 years at Apex Cloud.",
        skills=["Kubernetes", "Docker", "Go"],
        education=["B.S. Computer Engineering"],
        years_experience=4.0,
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)

    # Index candidate in vector store
    pipeline = RetrievalPipeline(db)
    pipeline.index_candidate(candidate)

    assistant = RAGRecruitmentAssistant(db)
    response = assistant.answer_query(
        query="What container technologies does Jordan Lee know?",
        session_uuid="test-session-123",
        candidate_id=candidate.id,
    )

    assert response.role == "assistant"
    assert response.grounded is True
    assert len(response.citations) > 0
    assert "not enough information" not in response.answer.lower()


def test_rag_assistant_unsupported_claim_declined():
    db = setup_in_memory_db()
    candidate = Candidate(
        full_name="Taylor Swift",
        email="taylor@example.com",
        resume_filename="taylor.pdf",
        resume_text="Taylor is a frontend developer with HTML and CSS.",
        skills=["HTML", "CSS"],
        education=["High School"],
        years_experience=1.0,
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)

    assistant = RAGRecruitmentAssistant(db)
    response = assistant.answer_query(
        query="Does Taylor have 10 years of experience deploying Quantum Cryptography to AWS?",
        session_uuid="test-session-456",
        candidate_id=candidate.id,
    )

    assert "not enough information" in response.answer.lower()
    assert response.grounded is False


def test_genai_service_features():
    candidate = Candidate(
        id=1,
        full_name="Alex Rivera",
        skills=["Python", "FastAPI", "Docker", "PostgreSQL"],
        years_experience=3.5,
        education=["B.S. in Computer Science"],
        resume_filename="alex.pdf",
        resume_text="Alex Rivera is a backend developer experienced with FastAPI and Docker.",
    )
    job = JobPosting(
        id=1,
        title="Senior Python Engineer",
        company="InnoTech",
        description="We need a Python engineer with FastAPI and Docker skills.",
        required_skills=["Python", "FastAPI", "Docker"],
        min_years_experience=3.0,
    )

    genai = GenAIService()
    
    # 1. Summary
    summary_res = genai.generate_candidate_summary(candidate)
    assert len(summary_res.summary) > 20
    assert len(summary_res.key_strengths) > 0

    # 2. Why Matches
    why_res = genai.generate_why_matches(candidate, job)
    assert len(why_res.reasons) > 0
    assert why_res.overall_match_rating in {"Strong", "Moderate", "Potential"}

    # 3. Interview Questions
    q_res = genai.generate_interview_questions(candidate, job)
    assert len(q_res.technical_questions) > 0
    assert len(q_res.experience_questions) > 0

    # 4. Job Description Improvement
    job_res = genai.improve_job_description(job)
    assert len(job_res.improved_description) > len(job.description)
    assert len(job_res.suggestions_made) > 0
