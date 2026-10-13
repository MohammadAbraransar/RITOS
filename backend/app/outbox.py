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
from types import SimpleNamespace
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


def _send(msg) -> httpx.Response:
    headers = {"Authorization": f"Bearer {settings.ritos_api_key}", "Idempotency-Key": msg.idempotency_key}
    with httpx.Client(timeout=settings.outbox_http_timeout_seconds) as client:
        return client.post(f"{settings.shopflow_base_url}{msg.path}", json=msg.payload, headers=headers)


def _claim(db: Session, limit: int) -> list[SimpleNamespace]:
    """Lock pending rows, pick due messages in per-ticket order, and lease them so other workers skip them."""
    now = _now()
    # A FAILED message blocks every later message for its ticket until an operator retries it.
    blocked: set[str] = set(db.scalars(select(OutboxMessage.ticket_id).distinct()
                                       .where(OutboxMessage.status == "FAILED", OutboxMessage.ticket_id.is_not(None))))
    pending = db.scalars(select(OutboxMessage).where(OutboxMessage.status == "PENDING")
                         .order_by(OutboxMessage.created_at).with_for_update()).all()
    lease_until = now + timedelta(seconds=settings.outbox_claim_lease_seconds)
    claimed = []
    for msg in pending:
        key = msg.ticket_id or msg.id
        if key in blocked:
            continue
        if _aware(msg.next_attempt_at) > now:
            blocked.add(key)  # not due, or leased by another worker: later messages wait for this one
            continue
        if len(claimed) >= limit:
            break
        claimed.append(SimpleNamespace(id=msg.id, key=key, kind=msg.kind, path=msg.path, payload=msg.payload,
                                       idempotency_key=msg.idempotency_key, previous_attempt_at=msg.next_attempt_at))
        msg.next_attempt_at = lease_until
    db.commit()  # releases the row locks and returns the connection to the pool before any network call
    return claimed


def deliver_due(db: Session, limit: int | None = None) -> list[dict]:
    """Deliver pending messages that are due. Returns a summary per attempted message.

    No database connection is held while the store is being called: messages are claimed in one short
    transaction, sent, and their outcomes are recorded in a second short transaction.
    """
    claimed = _claim(db, limit or settings.outbox_batch_size)
    outcomes: dict[str, tuple] = {}
    failed_keys: set[str] = set()
    for msg in claimed:
        if msg.key in failed_keys:
            outcomes[msg.id] = ("SKIPPED", None, None)  # keep per-ticket order behind the failed message
            continue
        try:
            resp = _send(msg)
            try:
                body = resp.json()
            except Exception:
                body = {"text": resp.text[:500]}
            # 409 on a decision means the store already moved past this state (e.g. replayed): treat as delivered.
            if resp.is_success or resp.status_code == 409:
                outcomes[msg.id] = ("SENT", body, None)
            else:
                raise RuntimeError(f"HTTP {resp.status_code}: {str(body)[:300]}")
        except Exception as exc:
            outcomes[msg.id] = ("ERROR", None, str(exc)[:1000])
            failed_keys.add(msg.key)

    if not claimed:
        return []
    rows = {m.id: m for m in db.scalars(select(OutboxMessage).where(OutboxMessage.id.in_(list(outcomes)))
                                         .with_for_update())}
    results = []
    for msg in claimed:
        row = rows.get(msg.id)
        if row is None:
            continue
        outcome, body, error = outcomes[msg.id]
        if outcome == "SKIPPED":
            row.next_attempt_at = msg.previous_attempt_at  # release the lease untouched
            continue
        row.attempts += 1
        if outcome == "SENT":
            row.status, row.sent_at, row.response, row.last_error = "SENT", _now(), body, None
        else:
            row.last_error = error
            if row.attempts >= settings.outbox_max_attempts:
                row.status = "FAILED"
            else:
                row.next_attempt_at = _now() + timedelta(seconds=min(settings.outbox_max_backoff_seconds,
                                                                       settings.outbox_base_backoff_seconds * 2 ** (row.attempts - 1)))
        results.append({"id": row.id, "kind": row.kind, "status": row.status, "attempts": row.attempts, "error": row.last_error})
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
