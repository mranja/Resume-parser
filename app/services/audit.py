from typing import Any, Optional
from sqlalchemy.orm import Session

from app.core.logging import get_logger, get_request_id
from app.models import AuditLog

logger = get_logger("services.audit")


class AuditService:
    def __init__(self, db: Session):
        self.db = db

    def log_event(
        self,
        action: str,
        resource_type: str,
        resource_id: Optional[str] = None,
        model_name: Optional[str] = None,
        latency_ms: float = 0.0,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        metadata: Optional[dict[str, Any]] = None,
    ) -> AuditLog:
        req_id = get_request_id()
        entry = AuditLog(
            request_id=req_id,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else None,
            model_name=model_name,
            latency_ms=latency_ms,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            metadata_json=metadata or {},
        )
        self.db.add(entry)
        self.db.commit()
        self.db.refresh(entry)

        logger.info(
            "AUDIT [%s] on %s:%s | model=%s latency=%.2fms tokens=%d",
            action,
            resource_type,
            resource_id,
            model_name,
            latency_ms,
            prompt_tokens + completion_tokens,
        )
        return entry
