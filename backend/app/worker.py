"""Optional Celery worker entrypoint for durable background automation.
Start with: celery -A app.worker.celery_app worker --loglevel=INFO
Beat scheduler: celery -A app.worker.celery_app beat --loglevel=INFO
Requires Redis and celery installed from requirements.txt.
"""
from celery import Celery
from .config import settings

celery_app = Celery("ritos", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(
    task_serializer="json", result_serializer="json", accept_content=["json"],
    timezone="UTC", enable_utc=True, task_acks_late=True,
    task_reject_on_worker_lost=True, worker_prefetch_multiplier=1,
    task_routes={"app.worker.process_ticket": {"queue": "ticket-automation"}},
)

@celery_app.task(name="app.worker.process_ticket", autoretry_for=(ConnectionError,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def process_ticket(ticket_id: str) -> dict:
    from .database import SessionLocal
    from .models import Ticket
    from .agents import run_ticket_pipeline
    db = SessionLocal()
    try:
        ticket = db.get(Ticket, ticket_id)
        if not ticket:
            return {"ticket_id": ticket_id, "status": "NOT_FOUND"}
        result = run_ticket_pipeline(db, ticket)
        db.commit()
        return {"ticket_id": ticket_id, "status": "COMPLETED", "decision": result["decision"]}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

@celery_app.task(name="app.worker.health_check")
def health_check() -> dict:
    return {"status": "ok", "service": "ritos-worker"}
