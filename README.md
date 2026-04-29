# Smart Recruitment & Resume Parser

An AI-assisted recruitment platform that turns resume PDFs into structured SQL records, extracts candidate skills with NLP, and scores candidates against job descriptions.

## What It Does

- Upload resume PDFs and extract candidate details.
- Detect technical skills, email, phone number, education hints, and experience.
- Store candidates, job postings, and match scores in a SQL database.
- Score each candidate against a job description using skill coverage, keyword overlap, and experience signals.
- Provide a small web UI for uploading resumes, adding jobs, and viewing ranked matches.

## Tech Stack

- Backend: FastAPI
- NLP: spaCy with a rule-based fallback
- PDF parsing: pypdf
- SQL: SQLite by default, PostgreSQL optional, with SQLAlchemy ORM
- UI: HTML, CSS, and vanilla JavaScript served by FastAPI

## Quick Start

1. Create and activate a virtual environment.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Install dependencies.

```powershell
pip install -r requirements.txt
```

The app works immediately after dependency installation by using a lightweight tokenizer fallback. For better NLP quality, you can optionally install the small English spaCy model:

```powershell
python -m spacy download en_core_web_sm
```

3. Copy environment settings.

```powershell
Copy-Item .env.example .env
```

4. Run the API.

```powershell
uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000` in your browser.

The default setup creates a local `recruitment.db` SQLite file. No Docker or database server is required.

## Optional PostgreSQL

If you later want PostgreSQL for a production-style demo, install PostgreSQL locally, create a database, then install the optional driver:

```powershell
pip install -r requirements-postgres.txt
Copy-Item .env.postgres.example .env
```

Update the `DATABASE_URL` username, password, host, and database name in `.env` to match your local PostgreSQL installation.

## API Overview

- `POST /api/candidates`: Upload a resume PDF and create a candidate.
- `GET /api/candidates`: List parsed candidates.
- `POST /api/jobs`: Create a job posting.
- `GET /api/jobs`: List job postings.
- `POST /api/matches`: Score all candidates against a job.
- `GET /api/matches/{job_id}`: View ranked matches for a job.

## Project Structure

```text
app/
  main.py
  config.py
  database.py
  models.py
  schemas.py
  api/
  services/
  static/
tests/
```

## Notes

This project is designed as an internship-ready portfolio project. It keeps the AI component explainable, avoids requiring paid LLM calls, and still demonstrates the full pipeline from unstructured PDFs to SQL-backed matching insights.
