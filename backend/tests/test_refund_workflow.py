"""Refund workflow on RITOS-ledger claims, end to end through the API: approve the claim, second approval, payout,
and every way it can stop (cancel, rejection at approval, gateway decline, unknown outcome).

The payout gateway is the SANDBOX adapter: it records a provider reference but moves no real money, and the
customer is told so.
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.database import SessionLocal
from app.models import LedgerJournal, OrderItem, Product, RefundRequest, Ticket, Transaction, User

client = TestClient(app)


def _h(email):
    r = client.post("/api/v1/auth/login", json={"email": email, "password": "ChangeMe123!"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _approval_desk_claim(amount=1500.0) -> str:
    """A customer portal claim that RITOS routes to the Approval Desk: in-window general item, changed mind."""
    txid = f"TXN-RW-{uuid4().hex[:8]}"
    with SessionLocal() as db:
        customer = db.scalar(select(User).where(User.email == "customer@ritos.local"))
        db.add(Transaction(id=txid, customer_id=customer.id, order_id=f"ORD-{txid}", amount=amount, currency="INR",
                           payment_status="SUCCESSFUL", refunded_amount=0,
                           created_at=datetime.now(timezone.utc) - timedelta(days=2)))
        sku = f"SKU-{txid}"
        db.add(Product(sku=sku, name=f"Desk Organiser {txid}", category="GENERAL", price_minor=int(amount * 100), currency="INR"))
        db.add(OrderItem(transaction_id=txid, product_sku=sku, amount=amount))
        db.commit()
    r = client.post("/api/v1/tickets", headers=_h("customer@ritos.local"),
                    json={"transaction_id": txid, "reason": "CHANGED_MIND"})
    assert r.status_code == 200, r.text
    t = client.get(f"/api/v1/tickets/{r.json()['id']}", headers=_h("admin@ritos.local")).json()
    assert t["decision_bucket"] == "GENUINE_REFUNDABLE" and t["assigned_desk"] == "CS_1", t["policy_evaluation_reason"]
    return t["id"]


def _propose(ticket_id, email="cs1@ritos.local"):
    r = client.post(f"/api/v1/cs1/tickets/{ticket_id}/direct-refund", headers=_h(email))
    assert r.status_code == 200 and r.json()["status"] == "REFUND_PROPOSED", r.text
    return r.json()["refund"]["id"]


def _approve(refund_id, email="finance@ritos.local"):
    return client.post(f"/api/v1/refunds/{refund_id}/approve", headers=_h(email), json={"reason": "Checked against the order"})


def _execute(refund_id, email="admin@ritos.local", key=None):
    return client.post(f"/api/v1/refunds/{refund_id}/execute", headers={**_h(email), "Idempotency-Key": key or f"exec-{refund_id}"})


def _customer_status(ticket_id):
    return client.get(f"/api/v1/tickets/{ticket_id}", headers=_h("customer@ritos.local")).json()["customer_status"]


def _ticket(ticket_id) -> Ticket:
    with SessionLocal() as db:
        return db.get(Ticket, ticket_id)


def test_refund_is_approved_by_two_people_and_paid_by_a_third_through_the_sandbox():
    tid = _approval_desk_claim()
    rid = _propose(tid)
    assert _ticket(tid).refund_status == "PENDING_APPROVAL"
    assert _customer_status(tid)["label"] == "Refund in progress"
    assert client.post(f"/api/v1/cs1/tickets/{tid}/direct-refund", headers=_h("cs1@ritos.local")).json()["refund"]["idempotent_replay"]

    # Approval: a different person; it does not move money
    assert _approve(rid, "cs1@ritos.local").status_code == 403
    r = _approve(rid)
    assert r.status_code == 200 and r.json()["status"] == "APPROVED", r.text
    assert _ticket(tid).refund_status == "APPROVED"
    assert _customer_status(tid)["label"] == "Refund approved"
    with SessionLocal() as db:
        assert float(db.get(Transaction, _ticket(tid).transaction_id).refunded_amount) == 0

    # Payout: neither the proposer nor the approver may send it
    assert _execute(rid, "finance@ritos.local").status_code == 409
    r = _execute(rid)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "REFUNDED" and body["provider"] == "SANDBOX" and body["provider_reference"].startswith("SANDBOX-")
    t = _ticket(tid)
    assert (t.status, t.refund_status) == ("RESOLVED", "REFUNDED")
    with SessionLocal() as db:
        assert Decimal(str(db.get(Transaction, t.transaction_id).refunded_amount)) == Decimal("1500.00")
        assert db.scalar(select(LedgerJournal).where(LedgerJournal.refund_id == rid))
    status = _customer_status(tid)
    assert status["code"] == "REFUNDED" and "no real money" in status["description"]

    # Paying twice is impossible: a replay returns the same result and the ledger is unchanged
    assert _execute(rid).json()["status"] == "REFUNDED"
    assert _execute(rid, key="another-key").json().get("idempotent_replay")
    with SessionLocal() as db:
        assert Decimal(str(db.get(Transaction, t.transaction_id).refunded_amount)) == Decimal("1500.00")
    assert client.post(f"/api/v1/cs1/tickets/{tid}/direct-refund", headers=_h("cs1@ritos.local")).status_code == 409


def test_claim_cannot_be_cancelled_while_its_payout_is_in_progress():
    tid = _approval_desk_claim()
    rid = _propose(tid)
    r = client.post(f"/api/v1/cs1/tickets/{tid}/manual-decide", headers=_h("cs1@ritos.local"),
                    json={"decision": "CANCEL", "reason": "Courier says it was delivered intact"})
    assert r.status_code == 409 and "approval step" in r.json()["detail"]
    with SessionLocal() as db:
        assert db.get(RefundRequest, rid).status == "PENDING_APPROVAL"
    assert _ticket(tid).status != "REJECTED"


def test_cancelling_before_any_payout_closes_the_claim_for_good():
    tid = _approval_desk_claim()
    r = client.post(f"/api/v1/cs1/tickets/{tid}/manual-decide", headers=_h("cs1@ritos.local"),
                    json={"decision": "CANCEL", "reason": "Courier says it was delivered intact"})
    assert r.status_code == 200, r.text
    t = _ticket(tid)
    assert (t.status, t.refund_status) == ("REJECTED", "CANCELLED")
    assert _customer_status(tid)["code"] == "NOT_APPROVED"
    assert client.post(f"/api/v1/cs1/tickets/{tid}/direct-refund", headers=_h("cs1@ritos.local")).status_code == 409


def test_rejection_at_approval_closes_the_claim_and_tells_the_customer_why():
    tid = _approval_desk_claim()
    rid = _propose(tid)
    r = client.post(f"/api/v1/refunds/{rid}/reject", headers=_h("finance@ritos.local"), json={"reason": "Order was already replaced"})
    assert r.status_code == 200 and r.json()["status"] == "REJECTED", r.text
    t = _ticket(tid)
    assert (t.status, t.refund_status) == ("REJECTED", "REJECTED")
    claim = client.get(f"/api/v1/tickets/{tid}", headers=_h("customer@ritos.local")).json()
    assert claim["customer_status"]["code"] == "NOT_APPROVED"
    assert any("Order was already replaced" in c["body"] for c in claim["comments"])
    assert _approve(rid).status_code == 409                      # a rejected payout can't be approved later
    assert client.post(f"/api/v1/cs1/tickets/{tid}/direct-refund", headers=_h("cs1@ritos.local")).status_code == 409


def test_declined_payout_pays_nothing_and_can_be_proposed_again():
    tid = _approval_desk_claim()
    rid = _propose(tid)
    assert _approve(rid).status_code == 200
    r = _execute(rid, key=f"exec-sandbox_fail-{rid}")
    assert r.status_code == 502
    t = _ticket(tid)
    assert t.refund_status == "FAILED" and t.status != "RESOLVED"
    with SessionLocal() as db:
        assert float(db.get(Transaction, t.transaction_id).refunded_amount) == 0
    assert _customer_status(tid)["label"] == "Refund delayed"
    retry = _propose(tid)                                        # a new proposal, approved again from the start
    assert retry != rid
    with SessionLocal() as db:
        assert db.get(RefundRequest, retry).status == "PENDING_APPROVAL"


def test_unknown_payout_outcome_is_confirmed_with_the_provider_before_it_counts():
    tid = _approval_desk_claim()
    rid = _propose(tid)
    assert _approve(rid).status_code == 200
    r = _execute(rid, key=f"exec-sandbox_timeout-{rid}")
    assert r.status_code == 200 and r.json()["status"] == "RECONCILIATION_REQUIRED", r.text
    assert _ticket(tid).refund_status == "RECONCILIATION_REQUIRED"
    assert _customer_status(tid)["label"] == "Refund being confirmed"
    with SessionLocal() as db:
        assert float(db.get(Transaction, _ticket(tid).transaction_id).refunded_amount) == 0
    r = client.post(f"/api/v1/refunds/{rid}/reconcile", headers=_h("finance@ritos.local"))
    assert r.status_code == 200 and r.json()["status"] == "REFUNDED", r.text
    assert _ticket(tid).refund_status == "REFUNDED"
