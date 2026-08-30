import time
from typing import Optional
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.llm.base import BaseLLMProvider
from app.llm.factory import get_llm_provider
from app.llm.prompts import RAG_RECRUITER_SYSTEM, RAG_RECRUITER_USER
from app.models import ChatMessage, ChatSession
from app.retrieval.pipeline import RetrievalPipeline
from app.schemas import ChatCitation, ChatMessageResponse

logger = get_logger("services.rag")


class RAGRecruitmentAssistant:
    def __init__(
        self,
        db: Session,
        llm_provider: Optional[BaseLLMProvider] = None,
        retrieval_pipeline: Optional[RetrievalPipeline] = None,
    ):
        self.db = db
        self.llm = llm_provider or get_llm_provider()
        self.retrieval = retrieval_pipeline or RetrievalPipeline(db)

    def answer_query(
        self,
        query: str,
        session_uuid: str,
        job_id: Optional[int] = None,
        candidate_id: Optional[int] = None,
    ) -> ChatMessageResponse:
        start_time = time.perf_counter()

        # Retrieve relevant chunks
        document_type = "candidate" if candidate_id is not None else None
        doc_id = candidate_id if candidate_id is not None else job_id

        retrieved = self.retrieval.retrieve(
            query=query,
            document_type=document_type,
            document_id=doc_id,
            top_k=4,
        )

        # Grounded prompt construction
        user_prompt = RAG_RECRUITER_USER.format(
            query=query,
            context=retrieved.formatted_context,
        )

        llm_result = self.llm.generate(
            prompt=user_prompt,
            system_prompt=RAG_RECRUITER_SYSTEM,
            temperature=0.0,
        )

        latency_ms = (time.perf_counter() - start_time) * 1000.0

        # Check for 'not enough information' condition
        grounded = "not enough information" not in llm_result.text.lower()

        citations = [
            ChatCitation(
                source_type=c["source_type"],
                source_name=c["source_name"],
                section=c.get("section"),
                snippet=c["snippet"],
            )
            for c in retrieved.citations
        ] if grounded else []

        # Persist to database if session exists
        session = self.db.query(ChatSession).filter(ChatSession.session_uuid == session_uuid).first()
        if session:
            # User message
            self.db.add(ChatMessage(
                session_id=session.id,
                role="user",
                content=query,
            ))
            # Assistant message
            self.db.add(ChatMessage(
                session_id=session.id,
                role="assistant",
                content=llm_result.text,
                citations=[c.model_dump() for c in citations],
                latency_ms=latency_ms,
                prompt_tokens=llm_result.prompt_tokens,
                completion_tokens=llm_result.completion_tokens,
            ))
            self.db.commit()

        return ChatMessageResponse(
            session_id=session_uuid,
            role="assistant",
            answer=llm_result.text,
            citations=citations,
            latency_ms=round(latency_ms, 2),
            tokens_used=llm_result.prompt_tokens + llm_result.completion_tokens,
            grounded=grounded,
        )
