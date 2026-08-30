import io
import pytest
from starlette.testclient import TestClient
from app.main import app


from app.database import Base, engine


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "version" in data
    assert "disclaimer" in data


def test_job_lifecycle(client):
    # Create job
    payload = {
        "title": "Backend Infrastructure Architect",
        "company": "CloudForge",
        "description": "Looking for a seasoned backend engineer proficient in Python, FastAPI, Docker, and PostgreSQL.",
        "min_years_experience": 3.0,
        "required_skills": ["Python", "FastAPI", "Docker", "PostgreSQL"],
    }
    create_res = client.post("/api/jobs", json=payload)
    assert create_res.status_code == 201
    job = create_res.json()
    assert job["title"] == payload["title"]
    assert len(job["required_skills"]) >= 4

    # List jobs
    list_res = client.get("/api/jobs")
    assert list_res.status_code == 200
    assert any(j["id"] == job["id"] for j in list_res.json())

    # Improve job
    improve_res = client.post(f"/api/jobs/{job['id']}/improve")
    assert improve_res.status_code == 200
    imp = improve_res.json()
    assert "improved_description" in imp
    assert len(imp["suggestions_made"]) > 0


def test_candidate_upload_and_blind_screening(client):
    # Construct minimal valid PDF bytes
    pdf_content = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000053 00000 n\n00000000102 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF\n"

    files = {"resume": ("resume.pdf", io.BytesIO(pdf_content), "application/pdf")}
    data = {"full_name": "Devin Vance"}

    # Mock text extraction if the minimal PDF has no text stream
    from unittest.mock import patch
    with patch("app.api.candidates.extract_pdf_text") as mock_extract:
        mock_extract.return_value = (
            "Devin Vance\nEmail: devin.vance@techcorp.io\nPhone: 555-901-2834\n"
            "Skills: Python, FastAPI, Docker, SQL\n"
            "Experience: 3 years building cloud backend services at TechCorp."
        )
        res = client.post("/api/candidates", files=files, data=data)
        assert res.status_code == 201
        cand = res.json()
        assert cand["full_name"] == "Devin Vance"
        assert cand["email"] == "devin.vance@techcorp.io"
        cand_id = cand["id"]

    # Test blind screening mode
    blind_res = client.get("/api/candidates?blind_mode=true")
    assert blind_res.status_code == 200
    blind_candidates = blind_res.json()
    target = next((c for c in blind_candidates if c["id"] == cand_id), None)
    assert target is not None
    assert "devin.vance" not in target["email"]
    assert "*" in target["email"]

    # Test RAG chat
    chat_res = client.post(
        "/api/rag/chat",
        json={"query": "What skills does Devin have?", "candidate_id": cand_id},
    )
    assert chat_res.status_code == 200
    chat_data = chat_res.json()
    assert "answer" in chat_data
    assert chat_data["session_id"] is not None

    # Test Audit logs
    audit_res = client.get("/api/audit/logs")
    assert audit_res.status_code == 200
    assert len(audit_res.json()) > 0
