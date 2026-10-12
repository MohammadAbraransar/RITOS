"""Durable outbound delivery to the store (transactional outbox).

Messages are written in the same DB transaction as the ticket change, then delivered by a
background thread in creation order per ticket, with exponential backoff. A message that keeps
failing is marked FAILED and blocks later messages for that ticket until an operator retries it,
so a decision can never overtake the status update it depends on.
"""
from __future__ import annotations
import logging
import threading
from datetime import datetime, timedelta, timezone
import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session
from .config import settings
from .models import OutboxMessage

logger = logging.getLogger("ritos.outbox")
_worker: threading.Thread | None = None
_stop = threading.Event()


def _now():
    return datetime.now(timezone.utc)


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def enqueue(db: Session, ticket_id: str | None, kind: str, path: str, payload: dict, idempotency_key: str) -> OutboxMessage:
    existing = db.scalar(select(OutboxMessage).where(OutboxMessage.idempotency_key == idempotency_key))
    if existing:
        return existing
    msg = OutboxMessage(ticket_id=ticket_id, kind=kind, path=path, payload=payload, idempotency_key=idempotency_key)
    db.add(msg)
    db.flush()
    return msg


def _send(msg: OutboxMessage) -> httpx.Response:
    headers = {"Authorization": f"Bearer {settings.ritos_api_key}", "Idempotency-Key": msg.idempotency_key}
    with httpx.Client(timeout=10.0) as client:
        return client.post(f"{settings.shopflow_base_url}{msg.path}", json=msg.payload, headers=headers)


def deliver_due(db: Session, limit: int = 20) -> list[dict]:
    """Deliver pending messages that are due. Returns a summary per attempted message."""
    now = _now()
    pending = db.scalars(select(OutboxMessage).where(OutboxMessage.status.in_(["PENDING", "FAILED"]))
                         .order_by(OutboxMessage.created_at)).all()
    blocked: set[str] = set()
    results = []
    for msg in pending:
        key = msg.ticket_id or msg.id
        if key in blocked:
            continue
        if msg.status == "FAILED" or _aware(msg.next_attempt_at) > now:
            blocked.add(key)  # keep per-ticket order: later messages wait for this one
            continue
        if len(results) >= limit:
            break
        msg.attempts += 1
        try:
            resp = _send(msg)
            body = None
            try:
                body = resp.json()
            except Exception:
                body = {"text": resp.text[:500]}
            # 409 on a decision means the store already moved past this state (e.g. replayed): treat as delivered.
            if resp.is_success or resp.status_code == 409:
                msg.status, msg.sent_at, msg.response, msg.last_error = "SENT", _now(), body, None
            else:
                raise RuntimeError(f"HTTP {resp.status_code}: {str(body)[:300]}")
        except Exception as exc:
            msg.last_error = str(exc)[:1000]
            if msg.attempts >= settings.outbox_max_attempts:
                msg.status = "FAILED"
            else:
                msg.next_attempt_at = _now() + timedelta(seconds=min(300, 2 ** msg.attempts))
            blocked.add(key)
        results.append({"id": msg.id, "kind": msg.kind, "status": msg.status, "attempts": msg.attempts, "error": msg.last_error})
    db.commit()
    return results


def retry(db: Session, msg: OutboxMessage):
    msg.status = "PENDING"
    msg.next_attempt_at = _now()
    msg.attempts = 0
    db.commit()


def _loop():
    from .database import SessionLocal
    while not _stop.wait(settings.outbox_poll_seconds):
        try:
            with SessionLocal() as db:
                deliver_due(db)
        except Exception as exc:
            logger.warning("Outbox delivery cycle failed: %s", exc)


def start_worker():
    global _worker
    if _worker and _worker.is_alive():
        return
    _stop.clear()
    _worker = threading.Thread(target=_loop, name="ritos-outbox", daemon=True)
    _worker.start()


def stop_worker():
    _stop.set()


def outbox_view(m: OutboxMessage) -> dict:
    return {"id": m.id, "ticket_id": m.ticket_id, "kind": m.kind, "path": m.path, "status": m.status,
            "attempts": m.attempts, "last_error": m.last_error, "payload": m.payload,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "sent_at": m.sent_at.isoformat() if m.sent_at else None}
