from app.embeddings.factory import get_embedding_provider
from app.matching.engine import HybridMatchingEngine
from app.retrieval.chunking import chunk_document


def test_embedding_generation():
    provider = get_embedding_provider()
    vec = provider.embed_query("Python FastAPI backend engineer")
    assert len(vec) == provider.dimension
    assert any(v != 0.0 for v in vec)


def test_document_chunking():
    doc = """Professional Experience
Senior Backend Engineer at TechCorp. Built scalable microservices with Python and FastAPI.
Handled 10k requests per second and managed PostgreSQL read replicas.

Academic Education
B.S. in Computer Science from MIT, graduated with honors in 2020.
"""
    chunks = chunk_document(doc, max_chars=120, overlap=20)
    assert len(chunks) >= 2
    sections = [c.section_name for c in chunks]
    assert any(s in {"experience", "education", "overview"} for s in sections)


def test_hybrid_matching_calculation():
    matcher = HybridMatchingEngine()
    resume = "Senior Python Engineer with 5 years experience in FastAPI, Docker, and PostgreSQL databases."
    job = "Looking for a Senior Python Developer with FastAPI, Docker, and PostgreSQL. 4+ years required."
    
    result = matcher.compute_match(
        resume_text=resume,
        candidate_skills=["Python", "FastAPI", "Docker", "PostgreSQL"],
        candidate_years=5.0,
        job_description=job,
        required_skills=["Python", "FastAPI", "PostgreSQL"],
        min_years=4.0,
    )

    assert result.score >= 75.0
    assert result.skill_score == 100.0
    assert result.experience_score == 100.0
    assert len(result.matched_skills) == 3
    assert len(result.missing_skills) == 0
    assert len(result.evidence_snippets) > 0
