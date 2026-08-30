import math
from dataclasses import dataclass
from typing import Any, Optional, Sequence
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.models import DocumentChunk

logger = get_logger("retrieval.vector_store")


@dataclass
class SearchResult:
    chunk_id: int
    document_type: str
    document_id: int
    chunk_index: int
    chunk_text: str
    section_name: Optional[str]
    similarity: float


def cosine_similarity(v1: Sequence[float], v2: Sequence[float]) -> float:
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot = sum(a * b for a, b in zip(v1, v2))
    norm1 = math.sqrt(sum(a * a for a in v1))
    norm2 = math.sqrt(sum(b * b for b in v2))
    if norm1 == 0.0 or norm2 == 0.0:
        return 0.0
    return max(-1.0, min(1.0, dot / (norm1 * norm2)))


class DatabaseVectorStore:
    """
    SQLAlchemy-backed vector store that persists chunks and embeddings into the database.
    Works natively on both SQLite and PostgreSQL. Computes exact top-k cosine similarity.
    """

    def __init__(self, db: Session):
        self.db = db

    def delete_document_chunks(self, document_type: str, document_id: int) -> None:
        self.db.execute(
            delete(DocumentChunk).where(
                DocumentChunk.document_type == document_type,
                DocumentChunk.document_id == document_id,
            )
        )
        self.db.commit()

    def add_chunks(
        self,
        document_type: str,
        document_id: int,
        chunks: Sequence[dict[str, Any]],
    ) -> list[DocumentChunk]:
        # Clear existing first to avoid duplicate chunking
        self.delete_document_chunks(document_type, document_id)

        entities = []
        for c in chunks:
            entity = DocumentChunk(
                document_type=document_type,
                document_id=document_id,
                chunk_index=c["chunk_index"],
                chunk_text=c["chunk_text"],
                section_name=c.get("section_name"),
                embedding_json=c.get("embedding", []),
                token_count=c.get("token_count", 0),
            )
            self.db.add(entity)
            entities.append(entity)
        self.db.commit()
        for e in entities:
            self.db.refresh(e)
        return entities

    def search(
        self,
        query_embedding: Sequence[float],
        document_type: Optional[str] = None,
        document_id: Optional[int] = None,
        top_k: int = 5,
        min_similarity: float = 0.0,
    ) -> list[SearchResult]:
        query = select(DocumentChunk)
        if document_type:
            query = query.where(DocumentChunk.document_type == document_type)
        if document_id is not None:
            query = query.where(DocumentChunk.document_id == document_id)

        chunks = list(self.db.scalars(query))
        scored: list[SearchResult] = []

        for chunk in chunks:
            sim = cosine_similarity(query_embedding, chunk.embedding_json)
            if sim >= min_similarity:
                scored.append(
                    SearchResult(
                        chunk_id=chunk.id,
                        document_type=chunk.document_type,
                        document_id=chunk.document_id,
                        chunk_index=chunk.chunk_index,
                        chunk_text=chunk.chunk_text,
                        section_name=chunk.section_name,
                        similarity=round(sim, 4),
                    )
                )

        scored.sort(key=lambda item: item.similarity, reverse=True)
        return scored[:top_k]
