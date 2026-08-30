from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.logging import get_logger
from app.database import get_db
from app.models import ChatMessage, ChatSession
from app.schemas import ChatMessageRequest, ChatMessageResponse
from app.services.audit import AuditService
from app.services.rag import RAGRecruitmentAssistant

router = APIRouter()
logger = get_logger("api.rag")


@router.post("/rag/chat", response_model=ChatMessageResponse)
def recruiter_chat(payload: ChatMessageRequest, db: Session = Depends(get_db)) -> ChatMessageResponse:
    session_uuid = payload.session_id
    if not session_uuid:
        session_uuid = uuid4().hex
        session = ChatSession(session_uuid=session_uuid, job_id=payload.job_id)
        db.add(session)
        db.commit()
        db.refresh(session)
    else:
        session = db.scalar(select(ChatSession).where(ChatSession.session_uuid == session_uuid))
        if not session:
            session = ChatSession(session_uuid=session_uuid, job_id=payload.job_id)
            db.add(session)
            db.commit()

    assistant = RAGRecruitmentAssistant(db)
    response = assistant.answer_query(
        query=payload.query,
        session_uuid=session_uuid,
        job_id=payload.job_id,
        candidate_id=payload.candidate_id,
    )

    AuditService(db).log_event(
        action="RAG_QUERY",
        resource_type="chat_session",
        resource_id=session_uuid,
        latency_ms=response.latency_ms,
        prompt_tokens=response.tokens_used,
        metadata={"query": payload.query, "citation_count": len(response.citations)},
    )

    return response


@router.get("/rag/sessions/{session_uuid}/messages")
def get_chat_messages(session_uuid: str, db: Session = Depends(get_db)):
    session = db.scalar(
        select(ChatSession)
        .where(ChatSession.session_uuid == session_uuid)
        .options(selectinload(ChatSession.messages))
    )
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found.")

    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "citations": m.citations,
            "latency_ms": m.latency_ms,
            "created_at": m.created_at,
        }
        for m in session.messages
    ]
