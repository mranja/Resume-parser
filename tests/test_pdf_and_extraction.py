import pytest
from app.schemas import CandidateProfile, ContactInfo
from app.services.extraction import ResumeExtractionService
from app.services.pdf import clean_resume_text

SAMPLE_RESUME = """Sarah Connor
Email: sarah.connor@sky.net
Phone: (555) 234-5678
Location: Los Angeles, CA
Summary: Lead Systems Engineer with 6 years experience in resilient distributed computing and Python.
Skills: Python, FastAPI, Docker, PostgreSQL, Redis, Linux, Kubernetes, Git
Experience:
Senior Backend Engineer at Cyberdyne Defense (2020-Present, 4 yrs)
- Designed resilient microservices using Python, FastAPI, and PostgreSQL.
- Decreased system recovery time by 60% through containerized Docker workflows.
Education:
B.S. in Computer Systems, UCLA, 2018
"""


def test_clean_resume_text():
    dirty = "Software  Engineer \u2022 Python \u2014 \n\nimple-\nmentation\r\n"
    cleaned = clean_resume_text(dirty)
    assert "implementation" in cleaned
    assert "•" in cleaned
    assert "-" in cleaned
    assert "\r" not in cleaned


def test_candidate_profile_schema_validation():
    profile = CandidateProfile(
        full_name="Sarah Connor",
        contact=ContactInfo(email="sarah.connor@sky.net", phone="555-234-5678"),
        skills=["Python", "FastAPI", "Docker"],
        technologies=["Python", "FastAPI"],
        total_years_experience=6.0,
    )
    assert profile.full_name == "Sarah Connor"
    assert profile.contact.email == "sarah.connor@sky.net"
    assert len(profile.skills) == 3


def test_resume_extraction_service():
    service = ResumeExtractionService()
    outcome = service.extract_candidate_profile(SAMPLE_RESUME)
    assert outcome.profile is not None
    assert "Sarah" in outcome.profile.full_name or "Connor" in outcome.profile.full_name
    assert outcome.profile.contact.email == "sarah.connor@sky.net"
    assert any("python" in s.lower() for s in outcome.profile.skills)
    assert outcome.raw_text == SAMPLE_RESUME
    assert not outcome.fallback_used or outcome.extraction_method.startswith("fallback")
