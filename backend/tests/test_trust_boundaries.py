"""Regression tests for trust boundaries and run determinism.

- The return window is anchored to trusted dates only; a customer-typed purchase date is never used.
- A pipeline run evaluates every date rule against one recorded clock reading.
- The outbox never re-sends a message another worker has leased.
"""
from datetime import datetime, timedelta, timezone
from uuid import uuid4
import httpx
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app import outbox
from app.database import SessionLocal
from app.models import Transaction, User, OutboxMessage
from app.agents.policy_agent import evaluate_policy_eligibility

client = TestClient(app)


def _customer_headers():
    r = client.post("/api/v1/auth/login", json={"email": "customer@ritos.local", "password": "ChangeMe123!"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _old_transaction(days_ago: int) -> str:
    txid = f"TXN-AGED-{uuid4().hex[:8]}"
    with SessionLocal() as db:
        customer = db.scalar(select(User).where(User.email == "customer@ritos.local"))
        db.add(Transaction(id=txid, customer_id=customer.id, order_id=f"ORD-{txid}", amount=1000, currency="INR",
                           payment_status="SUCCESSFUL", refunded_amount=0,
                           created_at=datetime.now(timezone.utc) - timedelta(days=days_ago)))
        db.commit()
    return txid


def _claim(txid: str, **extra):
    body = {"transaction_id": txid, "order_id": f"ORD-{txid}", "claimed_amount": 1000, "currency": "INR",
            "description": "I changed my mind and no longer need this item, it is unused.",
            "item_name": f"Headphones {txid}", "item_category": "ELECTRONICS", **extra}
    r = client.post("/api/v1/tickets", json=body, headers=_customer_headers())
    assert r.status_code == 200, r.text
    return r.json()


def test_customer_supplied_purchase_date_cannot_reopen_an_expired_window():
    txid = _old_transaction(days_ago=60)
    data = _claim(txid, purchase_date=datetime.now(timezone.utc).isoformat())
    auto = data["automation"]
    assert auto["assigned_desk"] == "CS_3" and auto["next_action"] == "AUTO_REJECT"
    assert "POLICY_WINDOW_EXPIRED" in auto["reason_codes"]
    evidence = data["classification_evidence"]
    assert evidence["purchase_date_source"] == "LEDGER_CAPTURE"
    assert evidence["customer_reported_purchase_date"]  # kept for reviewers only


def test_portal_claim_without_a_date_uses_the_ledger_capture_date():
    txid = _old_transaction(days_ago=3)
    auto = _claim(txid)["automation"]
    assert auto["next_action"] == "AUTO_APPROVE"
    assert "POLICY_WITHIN_WINDOW" in auto["reason_codes"]


def test_policy_result_depends_only_on_inputs_and_as_of():
    policy = {"source": "RITOS_POLICY", "category": "ELECTRONICS", "return_window_days": 14,
              "allow_damaged_exceptions": False, "policy_summary": ""}
    bought = datetime(2026, 1, 1, tzinfo=timezone.utc)
    inside = evaluate_policy_eligibility(policy, bought, as_of=datetime(2026, 1, 10, tzinfo=timezone.utc))
    outside = evaluate_policy_eligibility(policy, bought, as_of=datetime(2026, 2, 10, tzinfo=timezone.utc))
    assert inside["reason_code"] == "POLICY_WITHIN_WINDOW" and inside["days_elapsed"] == 9
    assert outside["reason_code"] == "POLICY_WINDOW_EXPIRED"


def test_policy_without_a_trusted_date_is_not_guessed():
    policy = {"source": "RITOS_POLICY", "category": "GENERAL", "return_window_days": 14,
              "allow_damaged_exceptions": False, "policy_summary": ""}
    result = evaluate_policy_eligibility(policy, None)
    assert result["eligible"] is None and result["reason_code"] == "POLICY_DATE_UNKNOWN"


def test_outbox_does_not_resend_a_leased_message(monkeypatch):
    with SessionLocal() as db:
        db.query(OutboxMessage).filter(OutboxMessage.status == "PENDING").update({"status": "SENT"})
        msg = OutboxMessage(ticket_id=None, kind="STATUS", path="/api/test", payload={},
                            idempotency_key=f"lease-{uuid4().hex}")
        db.add(msg)
        db.commit()
        msg_id = msg.id

    sent = []
    monkeypatch.setattr(outbox, "_send", lambda m: sent.append(m.id) or httpx.Response(200, json={"ok": True}))
    try:
        with SessionLocal() as db:
            claimed = outbox._claim(db, limit=10)  # worker A claims and is still sending
            assert [c.id for c in claimed] == [msg_id]
        with SessionLocal() as db:
            assert outbox.deliver_due(db) == []  # worker B must skip the leased message
        assert sent == []
    finally:
        with SessionLocal() as db:
            db.query(OutboxMessage).filter(OutboxMessage.id == msg_id).update({"status": "SENT"})
            db.commit()
