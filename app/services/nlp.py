from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache

from app.services.skills import CANONICAL_SKILLS, EDUCATION_KEYWORDS

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE_RE = re.compile(r"(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3,5}\)?[-.\s]?)?\d{3,5}[-.\s]?\d{4}")
YEARS_RE = re.compile(r"(?P<years>\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)", re.IGNORECASE)
TOKEN_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9+#./-]*")


@dataclass(frozen=True)
class ParsedResume:
    full_name: str
    email: str | None
    phone: str | None
    location: str | None
    skills: list[str]
    education: list[str]
    years_experience: float
    text: str


@dataclass(frozen=True)
class MatchBreakdown:
    score: float
    skill_score: float
    keyword_score: float
    experience_score: float
    matched_skills: list[str]
    missing_skills: list[str]
    summary: str


@lru_cache(maxsize=1)
def load_nlp():
    try:
        import spacy

        try:
            return spacy.load("en_core_web_sm")
        except OSError:
            return spacy.blank("en")
    except ImportError:
        return None


def parse_resume_text(text: str) -> ParsedResume:
    raw_text = text.strip()
    clean_text = normalize_whitespace(text)
    skills = extract_skills(clean_text)
    education = extract_education(clean_text)
    years_experience = extract_years_experience(clean_text)

    return ParsedResume(
        full_name=extract_name(raw_text),
        email=extract_first(EMAIL_RE, clean_text),
        phone=extract_first(PHONE_RE, clean_text),
        location=None,
        skills=skills,
        education=education,
        years_experience=years_experience,
        text=clean_text,
    )


def extract_skills(text: str) -> list[str]:
    text_lower = f" {text.lower()} "
    detected: list[str] = []

    for canonical, aliases in CANONICAL_SKILLS.items():
        if any(_contains_alias(text_lower, alias) for alias in aliases):
            detected.append(canonical)

    return sorted(set(detected))


def extract_education(text: str) -> list[str]:
    text_lower = text.lower()
    found = [keyword for keyword in EDUCATION_KEYWORDS if keyword in text_lower]
    return sorted(set(found))


def extract_required_skills(description: str) -> list[str]:
    return extract_skills(description)


def extract_years_experience(text: str) -> float:
    matches = [float(match.group("years")) for match in YEARS_RE.finditer(text)]
    if not matches:
        return 0.0
    return max(matches)


def score_candidate(
    resume_text: str,
    candidate_skills: list[str],
    candidate_years: float,
    job_description: str,
    required_skills: list[str],
    min_years: float,
) -> MatchBreakdown:
    candidate_skill_set = {skill.lower() for skill in candidate_skills}
    required_skill_set = {skill.lower() for skill in required_skills}

    if required_skill_set:
        matched = sorted(candidate_skill_set & required_skill_set)
        missing = sorted(required_skill_set - candidate_skill_set)
        skill_score = len(matched) / len(required_skill_set)
    else:
        matched = []
        missing = []
        skill_score = 0.0

    keyword_score = cosine_similarity(token_counts(resume_text), token_counts(job_description))
    experience_score = 1.0 if min_years <= 0 else min(candidate_years / min_years, 1.0)

    score = round((0.7 * skill_score + 0.2 * keyword_score + 0.1 * experience_score) * 100, 2)
    skill_score = round(skill_score * 100, 2)
    keyword_score = round(keyword_score * 100, 2)
    experience_score = round(experience_score * 100, 2)

    if required_skill_set:
        summary = (
            f"Matched {len(matched)} of {len(required_skill_set)} required skills. "
            f"Experience signal: {candidate_years:g}/{min_years:g} years."
        )
    else:
        summary = "No required skills were detected in the job description; score relies on keyword and experience signals."

    return MatchBreakdown(
        score=score,
        skill_score=skill_score,
        keyword_score=keyword_score,
        experience_score=experience_score,
        matched_skills=matched,
        missing_skills=missing,
        summary=summary,
    )


def token_counts(text: str) -> Counter[str]:
    nlp = load_nlp()
    if nlp is not None:
        doc = nlp(text.lower())
        tokens = [
            token.lemma_.strip() if token.lemma_ else token.text
            for token in doc
            if not token.is_stop and not token.is_punct and token.text.strip()
        ]
    else:
        tokens = [token.lower() for token in TOKEN_RE.findall(text)]

    return Counter(token for token in tokens if len(token) > 2)


def cosine_similarity(left: Counter[str], right: Counter[str]) -> float:
    if not left or not right:
        return 0.0

    common = set(left) & set(right)
    numerator = sum(left[token] * right[token] for token in common)
    left_norm = math.sqrt(sum(value * value for value in left.values()))
    right_norm = math.sqrt(sum(value * value for value in right.values()))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return numerator / (left_norm * right_norm)


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def extract_first(pattern: re.Pattern[str], text: str) -> str | None:
    match = pattern.search(text)
    return match.group(0).strip() if match else None


def extract_name(text: str) -> str:
    lines = [line.strip() for line in re.split(r"[\r\n]+", text) if line.strip()]
    if lines:
        first_line = re.sub(r"[^A-Za-z .'-]", "", lines[0]).strip()
        if 2 <= len(first_line.split()) <= 5:
            return first_line

    email = extract_first(EMAIL_RE, text)
    if email:
        return email.split("@")[0].replace(".", " ").replace("_", " ").title()
    return "Unknown Candidate"


def _contains_alias(text_lower: str, alias: str) -> bool:
    escaped = re.escape(alias.lower())
    if " " in alias or "." in alias or "/" in alias:
        return alias.lower() in text_lower
    return re.search(rf"(?<![a-z0-9+#.]){escaped}(?![a-z0-9+#])", text_lower) is not None
