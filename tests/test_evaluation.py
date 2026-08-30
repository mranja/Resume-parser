from app.evaluation.evaluator import EvaluationSuite


def test_evaluation_suite_run():
    suite = EvaluationSuite()
    metrics = suite.run_all()

    assert metrics.field_extraction_accuracy >= 70.0
    assert metrics.skill_extraction_f1 >= 60.0
    assert metrics.retrieval_recall_at_3 >= 70.0
    assert metrics.rag_faithfulness_rate >= 50.0
    assert metrics.avg_latency_ms > 0.0
    assert metrics.benchmark_dataset_size >= 4
