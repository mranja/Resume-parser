from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AuditLog

router = APIRouter()


@router.get("/audit/logs")
def get_audit_logs(
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    logs = list(
        db.scalars(
            select(AuditLog)
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
        )
    )
    return [
        {
            "id": l.id,
            "request_id": l.request_id,
            "action": l.action,
            "resource_type": l.resource_type,
            "resource_id": l.resource_id,
            "model_name": l.model_name,
            "latency_ms": l.latency_ms,
            "tokens": l.prompt_tokens + l.completion_tokens,
            "metadata": l.metadata_json,
            "created_at": l.created_at.isoformat(),
        }
        for l in logs
    ]
