from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.database import get_db
from app.evaluation.evaluator import EvaluationSuite
from app.schemas import EvaluationMetrics
from app.services.audit import AuditService

router = APIRouter()
logger = get_logger("api.evaluation")

_latest_metrics: EvaluationMetrics | None = None


@router.post("/evaluation/run", response_model=EvaluationMetrics)
def run_evaluation(db: Session = Depends(get_db)) -> EvaluationMetrics:
    global _latest_metrics
    suite = EvaluationSuite()
    metrics = suite.run_all()
    _latest_metrics = metrics

    AuditService(db).log_event(
        action="EVALUATION_RUN",
        resource_type="benchmark",
        latency_ms=metrics.avg_latency_ms,
        prompt_tokens=metrics.total_tokens_evaluated,
        metadata={
            "field_acc": metrics.field_extraction_accuracy,
            "skill_f1": metrics.skill_extraction_f1,
            "recall@3": metrics.retrieval_recall_at_3,
            "faithfulness": metrics.rag_faithfulness_rate,
        },
    )

    return metrics


@router.get("/evaluation/latest", response_model=EvaluationMetrics)
def get_latest_evaluation() -> EvaluationMetrics:
    global _latest_metrics
    if _latest_metrics is None:
        suite = EvaluationSuite()
        _latest_metrics = suite.run_all()
    return _latest_metrics
