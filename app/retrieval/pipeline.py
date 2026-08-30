from dataclasses import dataclass
from typing import Optional, Sequence
from sqlalchemy.orm import Session

from app.embeddings.base import BaseEmbeddingProvider
from app.embeddings.factory import get_embedding_provider
from app.models import Candidate, JobPosting
from app.retrieval.chunking import chunk_document
from app.retrieval.vector_store import DatabaseVectorStore, SearchResult


@dataclass
class RetrievedContext:
    query: str
    results: list[SearchResult]
    formatted_context: str
    citations: list[dict[str, str]]


class RetrievalPipeline:
    def __init__(self, db: Session, embedding_provider: Optional[BaseEmbeddingProvider] = None):
        self.db = db
        self.vector_store = DatabaseVectorStore(db)
        self.embedder = embedding_provider or get_embedding_provider()

    def index_candidate(self, candidate: Candidate) -> int:
        chunks = chunk_document(candidate.resume_text)
        if not chunks:
            return 0
        
        texts = [c.text for c in chunks]
        vectors = self.embedder.embed_documents(texts)

        payloads = []
        for c, vec in zip(chunks, vectors):
            payloads.append({
                "chunk_index": c.chunk_index,
                "chunk_text": c.text,
                "section_name": c.section_name,
                "embedding": vec,
                "token_count": c.token_count,
            })

        stored = self.vector_store.add_chunks("candidate", candidate.id, payloads)
        return len(stored)

    def index_job(self, job: JobPosting) -> int:
        chunks = chunk_document(job.description)
        if not chunks:
            return 0

        texts = [c.text for c in chunks]
        vectors = self.embedder.embed_documents(texts)

        payloads = []
        for c, vec in zip(chunks, vectors):
            payloads.append({
                "chunk_index": c.chunk_index,
                "chunk_text": c.text,
                "section_name": c.section_name or "requirements",
                "embedding": vec,
                "token_count": c.token_count,
            })

        stored = self.vector_store.add_chunks("job", job.id, payloads)
        return len(stored)

    def retrieve(
        self,
        query: str,
        document_type: Optional[str] = None,
        document_id: Optional[int] = None,
        top_k: int = 4,
    ) -> RetrievedContext:
        query_vec = self.embedder.embed_query(query)
        results = self.vector_store.search(
            query_embedding=query_vec,
            document_type=document_type,
            document_id=document_id,
            top_k=top_k,
        )

        formatted_lines = []
        citations = []

        for i, res in enumerate(results, 1):
            sec_name = res.section_name or "general"
            formatted_lines.append(
                f"[Source {i}: {res.document_type} #{res.document_id} | Section: {sec_name} | Similarity: {res.similarity:.2f}]\n"
                f"{res.chunk_text}\n"
            )
            citations.append({
                "source_type": res.document_type,
                "source_name": f"{res.document_type.title()} #{res.document_id}",
                "section": sec_name,
                "snippet": res.chunk_text[:180] + ("..." if len(res.chunk_text) > 180 else ""),
            })

        formatted_context = "\n".join(formatted_lines) if formatted_lines else "No matching evidence found in indexed documents."
        return RetrievedContext(
            query=query,
            results=results,
            formatted_context=formatted_context,
            citations=citations,
        )
