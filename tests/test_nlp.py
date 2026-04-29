from app.services.nlp import extract_skills, extract_years_experience, score_candidate


def test_extract_skills_uses_aliases() -> None:
    text = "Built REST APIs with Python, FastAPI, PostgreSQL, React.js, Docker, and sklearn."

    assert extract_skills(text) == [
        "docker",
        "fastapi",
        "postgresql",
        "python",
        "react",
        "rest api",
        "scikit-learn",
    ]


def test_extract_years_experience_uses_largest_signal() -> None:
    text = "Internship: 1 year. Freelance backend projects: 2.5 years."

    assert extract_years_experience(text) == 2.5


def test_score_candidate_prioritizes_required_skill_coverage() -> None:
    breakdown = score_candidate(
        resume_text="Python FastAPI PostgreSQL machine learning internship projects",
        candidate_skills=["python", "fastapi", "postgresql", "machine learning"],
        candidate_years=1,
        job_description="Need Python, FastAPI, PostgreSQL, Docker, and machine learning basics.",
        required_skills=["python", "fastapi", "postgresql", "docker", "machine learning"],
        min_years=1,
    )

    assert breakdown.score >= 75
    assert breakdown.matched_skills == ["fastapi", "machine learning", "postgresql", "python"]
    assert breakdown.missing_skills == ["docker"]
