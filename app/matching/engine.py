import re
from dataclasses import dataclass
from typing import Any, Sequence
from sqlalchemy.orm import Session

from app.embeddings.base import BaseEmbeddingProvider
from app.embeddings.factory import get_embedding_provider
from app.retrieval.vector_store import cosine_similarity
from app.services.nlp import token_counts, cosine_similarity as text_cosine_similarity


@dataclass
class HybridMatchResult:
    score: float
    skill_score: float
    semantic_score: float
    keyword_score: float
    experience_score: float
    matched_skills: list[str]
    missing_skills: list[str]
    summary: str
    evidence_snippets: list[dict[str, Any]]


class HybridMatchingEngine:
    def __init__(self, embedder: BaseEmbeddingProvider | None = None):
        self.embedder = embedder or get_embedding_provider()

    def compute_match(
        self,
        resume_text: str,
        candidate_skills: list[str],
        candidate_years: float,
        job_description: str,
        required_skills: list[str],
        min_years: float,
    ) -> HybridMatchResult:
        # 1. Semantic Similarity (Vector Embeddings)
        resume_vec = self.embedder.embed_query(resume_text[:2500])
        job_vec = self.embedder.embed_query(job_description[:2500])
        raw_semantic_sim = cosine_similarity(resume_vec, job_vec)
        # Normalize cosine [-1, 1] to [0, 1]
        norm_semantic = max(0.0, min(1.0, (raw_semantic_sim + 1.0) / 2.0 if raw_semantic_sim < 0.2 else raw_semantic_sim))
        semantic_score = round(norm_semantic * 100.0, 2)

        # 2. Skill Overlap & Gap Detection
        candidate_skill_set = {s.lower() for s in candidate_skills}
        required_skill_set = {s.lower() for s in required_skills}

        if required_skill_set:
            matched = sorted(candidate_skill_set & required_skill_set)
            missing = sorted(required_skill_set - candidate_skill_set)
            skill_ratio = len(matched) / len(required_skill_set)
            skill_score = round(skill_ratio * 100.0, 2)
        else:
            matched = []
            missing = []
            skill_score = 0.0

        # 3. Experience Alignment
        if min_years <= 0.0:
            exp_ratio = 1.0
        else:
            exp_ratio = min(candidate_years / min_years, 1.25)
        experience_score = round(min(1.0, exp_ratio) * 100.0, 2)

        # 4. Keyword Cosine Overlap (Lexical Baseline)
        raw_keyword_sim = text_cosine_similarity(token_counts(resume_text), token_counts(job_description))
        keyword_score = round(raw_keyword_sim * 100.0, 2)

        # 5. Explainable Weighted Hybrid Score
        if required_skill_set:
            total_score = (
                0.40 * (skill_score / 100.0)
                + 0.35 * (semantic_score / 100.0)
                + 0.15 * (experience_score / 100.0)
                + 0.10 * (keyword_score / 100.0)
            ) * 100.0
        else:
            total_score = (
                0.55 * (semantic_score / 100.0)
                + 0.25 * (experience_score / 100.0)
                + 0.20 * (keyword_score / 100.0)
            ) * 100.0

        score = round(max(0.0, min(100.0, total_score)), 2)

        # 6. Evidence Snippet Extraction
        evidence_snippets = self._extract_evidence_snippets(resume_text, matched)

        # 7. Human-readable summary
        if required_skill_set:
            summary = (
                f"Hybrid match: {score}%. Semantic alignment is {semantic_score}%, "
                f"matching {len(matched)} of {len(required_skill_set)} required skills. "
                f"Experience: {candidate_years:g}/{min_years:g} yrs ({experience_score}%)."
            )
        else:
            summary = (
                f"Hybrid match: {score}%. High semantic affinity ({semantic_score}%) "
                f"with {candidate_years:g} years background."
            )

        return HybridMatchResult(
            score=score,
            skill_score=skill_score,
            semantic_score=semantic_score,
            keyword_score=keyword_score,
            experience_score=experience_score,
            matched_skills=matched,
            missing_skills=missing,
            summary=summary,
            evidence_snippets=evidence_snippets,
        )

    def _extract_evidence_snippets(self, text: str, matched_skills: Sequence[str]) -> list[dict[str, Any]]:
        snippets = []
        sentences = [s.strip() for s in re.split(r"[.\n]+", text) if len(s.strip()) > 20]
        
        seen_skills = set()
        for s in matched_skills:
            if s in seen_skills:
                continue
            for sentence in sentences:
                if re.search(rf"\b{re.escape(s)}\b", sentence, re.IGNORECASE):
                    snippets.append({
                        "section": "resume_content",
                        "skill": s,
                        "snippet": sentence[:160] + ("..." if len(sentence) > 160 else ""),
                        "relevance": 0.95,
                    })
                    seen_skills.add(s)
                    break
            if len(snippets) >= 4:
                break
        return snippets
