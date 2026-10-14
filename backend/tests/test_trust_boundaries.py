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


def test_uploading_requested_proof_resumes_the_workflow():
    import base64, io, random
    from PIL import Image
    txid = _old_transaction(days_ago=2)
    data = _claim(txid, description="The screen arrived cracked and the product is damaged.")
    assert data["automation"]["next_action"] == "AWAIT_PROOF"

    rng = random.Random(7)
    img = Image.new("RGB", (320, 320))
    img.putdata([(rng.randrange(256), rng.randrange(256), rng.randrange(256)) for _ in range(320 * 320)])
    buf = io.BytesIO(); img.save(buf, format="JPEG")
    r = client.post("/api/v1/evidence/upload", headers=_customer_headers(), json={
        "ticket_id": data["id"], "file_name": "crack.jpg", "file_type": "image/jpeg",
        "base64_data": base64.b64encode(buf.getvalue()).decode()})
    assert r.status_code == 200, r.text
    automation = r.json()["automation"]
    assert automation and automation["trigger"] == "EVIDENCE_UPLOADED"
    assert "EVIDENCE_MISSING" not in automation["reason_codes"]


def test_high_refund_to_gmv_ratio_is_a_review_signal_not_a_denial():
    from app.agents.risk_agent import evaluate_customer_risk
    customer_id = f"cust-{uuid4().hex[:8]}"
    with SessionLocal() as db:
        for i, refunded in enumerate((1000, 1000, 0)):
            db.add(Transaction(id=f"TXN-R-{customer_id}-{i}", customer_id=customer_id, order_id=f"O-{i}", amount=1000,
                               currency="INR", payment_status="SUCCESSFUL", refunded_amount=refunded))
        db.commit()
        risk = evaluate_customer_risk(db, customer_id, "no-ticket", 500, "DEFECTIVE_PRODUCT")
    assert risk["refund_to_gmv_ratio"] == 0.6667 and risk["lifetime_orders"] == 3
    assert "HIGH_REFUND_TO_GMV_RATIO" in [s["signal"] for s in risk["risk_signals"]]
    assert risk["risk_tier"] != "HIGH"  # one signal alone never forces supervisory review


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


def test_unknown_store_ticket_is_refused_when_demo_claims_are_off(monkeypatch):
    from app import shopflow
    from app.config import settings
    monkeypatch.setattr(settings, "demo_claims_enabled", False)
    monkeypatch.setattr(shopflow, "fetch_shopflow_context", lambda tid: None)
    r = client.post("/webhook/refund-tickets", headers={"Authorization": "Bearer test-key"}, json={
        "event_id": f"evt-{uuid4().hex}", "event_type": "refund.ticket.created", "ticket_id": "SF-NOT-IN-STORE",
        "claimed_amount": 999, "description": "Invented claim that the store never recorded"})
    assert r.status_code == 404


def _arbiter_inputs(**over):
    from decimal import Decimal
    from app.agents.decision_agent import DecisionInputs
    base = dict(ledger_status="VERIFIED", is_duplicate=False, policy_eligible=True, policy_reason_code="POLICY_WITHIN_WINDOW",
                policy_reason="ok", claim_reason="CHANGED_MIND", contradictions=[], evidence_required=False, evidence_count=0,
                identity_status="inconclusive", defect_status="inconclusive", evidence_next_step="", risk_tier="LOW",
                requires_supervisory_review=False, risk_signals=[], claimed_amount=Decimal("1000"), auto_approve_limit=Decimal("5000"))
    return DecisionInputs(**{**base, **over})


def test_non_delivery_is_never_auto_refunded_without_carrier_confirmation():
    from app.agents.decision_agent import arbitrate
    d = arbitrate(_arbiter_inputs(claim_reason="ITEM_NOT_RECEIVED"))
    assert (d.assigned_desk, d.next_action, d.reason_codes) == ("CS_2", "MANUAL_REVIEW", ["LOGISTICS_UNVERIFIED"])
    confirmed = arbitrate(_arbiter_inputs(claim_reason="ITEM_NOT_RECEIVED", delivery_loss_confirmed=True))
    assert confirmed.next_action == "AUTO_APPROVE"


def test_above_limit_claim_carries_the_amount_reason_code():
    from decimal import Decimal
    from app.agents.decision_agent import arbitrate
    d = arbitrate(_arbiter_inputs(claimed_amount=Decimal("5499"), requires_supervisory_review=True,
                                  risk_signals=["HIGH_VALUE_CLAIM_THRESHOLD_EXCEEDED"]))
    assert d.next_action == "AWAIT_APPROVAL" and {"RISK_SUPERVISORY_REVIEW", "AMOUNT_ABOVE_AUTO_LIMIT"} <= set(d.reason_codes)


def test_payout_policy_drives_desk_flags_and_four_eyes():
    from types import SimpleNamespace as NS
    from app.permissions import next_step, user_permissions, can_propose, PAYOUT_ROLES
    finance = NS(id="u-fin", role="finance_approver")
    cs1 = NS(id="u-cs1", role="cs_1")
    analyst = NS(id="u-risk", role="risk_analyst")
    normal = NS(classification_evidence={"workflow": {"next_action": "AUTO_APPROVE"}})
    supervised = NS(classification_evidence={"workflow": {"next_action": "AWAIT_APPROVAL"}})
    assert can_propose(cs1, normal) is True            # CS-1 keeps its fast-track refund
    assert can_propose(cs1, supervised) is False       # but not for claims routed to a supervisor
    assert can_propose(finance, supervised) is True
    assert user_permissions(analyst)["payout"] == {a: False for a in PAYOUT_ROLES}
    pending = NS(status="PENDING_APPROVAL", requested_by_id="u-fin", approved_by_id=None)
    assert next_step(pending, finance)["can_act"] is False  # the proposer cannot approve
    admin = NS(id="u-admin", role="administrator")
    assert next_step(pending, admin)["can_act"] is True
    approved = NS(status="APPROVED", requested_by_id="u-fin", approved_by_id="u-admin")
    assert next_step(approved, admin)["can_act"] is False  # the approver cannot execute
    assert next_step(approved, NS(id="u-ops", role="refund_operations"))["can_act"] is True


def test_supervised_claim_payout_is_refused_for_cs1_and_me_reports_roles():
    def login(email):
        return client.post("/api/v1/auth/login", json={"email": email, "password": "ChangeMe123!"}).json()
    data = login("cs1@ritos.local")
    assert "supervisor" in data["user"]["permissions"]["payout_roles"]["propose_supervised"]
    # an above-limit claim is routed for supervisor approval; a CS-1 agent cannot approve its payout
    txid = _old_transaction(days_ago=2)
    with SessionLocal() as db:
        db.query(Transaction).filter(Transaction.id == txid).update({"amount": 9000})
        db.commit()
    auto = _claim(txid, claimed_amount=9000)["automation"]
    assert auto["next_action"] == "AWAIT_APPROVAL"
    r = client.post(f"/api/v1/tickets/{auto['ticket_id']}/authorize-payout", headers={"Authorization": f"Bearer {data['access_token']}"})
    assert r.status_code == 403 and "supervisor" in r.json()["detail"]
