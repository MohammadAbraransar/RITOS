from datetime import datetime, timedelta, timezone
from uuid import uuid4
import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app import shopflow, outbox
from app.database import SessionLocal
from app.models import Ticket, OutboxMessage, WorkflowRun

KEY = {"Authorization": "Bearer test-key"}
client = TestClient(app)


def login(email):
    r = client.post("/api/v1/auth/login", json={"email": email, "password": "ChangeMe123!"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def store_context(ticket_id, *, amount_minor=149900, reason="CHANGED_MIND", within=True, evidence_required=False,
                  evidence=(), days=3, conflicts=(), tickets_30d=1, description="Not what I expected"):
    order_id = f"ORD-{ticket_id}"
    return {
        "ticket": {"ticket_id": ticket_id, "reason": reason, "description": description,
                   "requested_amount_minor": amount_minor},
        "customer": {"customer_id": "CUS-1", "name": "Aarav", "email": "aarav@example.com",
                     "refund_tickets_30d": tickets_30d, "account_age_days": 400},
        "order": {"order_id": order_id, "ordered_at": (datetime.now(timezone.utc) - timedelta(days=days + 2)).isoformat(),
                  "delivered_at": (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()},
        "product": {"name": f"Item {ticket_id}", "category": "Audio"},
        "transaction": {"transaction_id": f"TXN-{ticket_id}", "payment_status": "PAID", "payment_id": "PAY-1"},
        "refund_policy": {"return_window_days": 10, "policy_version": 2},
        "refund_ledger": {"transaction_amount_minor": amount_minor, "already_refunded_minor": 0},
        "evidence": [{"filename": f, "url": f"http://store.test/evidence/{f}"} for f in evidence],
        "derived_facts": {"within_return_window": within, "days_since_delivery": days, "evidence_required": evidence_required,
                          "evidence_count": len(evidence), "claim_data_conflicts": list(conflicts)},
    }


@pytest.fixture
def store(monkeypatch):
    contexts = {}
    monkeypatch.setattr(shopflow, "fetch_shopflow_context", lambda tid: contexts.get(tid))
    return contexts


def send_event(ticket_id, event_type="refund.ticket.created", event_id=None, **extra):
    body = {"event_id": event_id or f"EVT-{uuid4().hex[:10]}", "event_type": event_type, "ticket_id": ticket_id, **extra}
    r = client.post("/webhook/refund-tickets", json=body, headers=KEY)
    assert r.status_code == 200, r.text
    return r.json()["data"]


def outbox_kinds(ritos_ticket_id):
    with SessionLocal() as db:
        return [m.kind for m in db.scalars(select(OutboxMessage).where(OutboxMessage.ticket_id == ritos_ticket_id)
                                           .order_by(OutboxMessage.created_at))]


def test_webhook_rejects_missing_or_wrong_key():
    body = {"ticket_id": "T-NOAUTH", "claimed_amount": 99999}
    assert client.post("/webhook/refund-tickets", json=body).status_code == 401
    assert client.post("/webhook/refund-tickets", json=body, headers={"Authorization": "Bearer nope"}).status_code == 401
    # customers are not integration callers either
    assert client.post("/webhook/refund-tickets", json=body, headers=login("customer@ritos.local")).status_code == 401


def test_store_claim_within_policy_is_auto_approved(store):
    store["SF-AUTO"] = store_context("SF-AUTO")
    data = send_event("SF-AUTO")
    assert data["store_linked"] is True
    assert data["next_action"] == "AUTO_APPROVE" and data["decision"] == "APPROVED"
    assert outbox_kinds(data["ritos_ticket_id"]) == ["DECISION"]


def test_store_claim_missing_required_evidence_waits_for_proof(store):
    store["SF-PROOF"] = store_context("SF-PROOF", reason="PRODUCT_DAMAGED", evidence_required=True)
    data = send_event("SF-PROOF")
    assert data["assigned_desk"] == "CS_2" and data["next_action"] == "AWAIT_PROOF"
    assert outbox_kinds(data["ritos_ticket_id"]) == ["STATUS", "NOTIFICATION"]
    with SessionLocal() as db:
        run = db.scalar(select(WorkflowRun).where(WorkflowRun.ticket_id == data["ritos_ticket_id"]))
        assert run.status == "WAITING_HUMAN" and len(run.steps) == 9


def _png_bytes():
    """TEST DATA: a generated textured image, never presented as customer evidence."""
    import io, random
    from PIL import Image
    rnd = random.Random(3)
    img = Image.new("RGB", (320, 320))
    img.putdata([(rnd.randrange(256), rnd.randrange(256), rnd.randrange(256)) for _ in range(320 * 320)])
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class _VisionDouble:
    """Test double for the vision provider (fixed verdicts) to exercise routing."""
    def __init__(self, identity, defect):
        self.identity, self.defect = identity, defect

    def assess(self, images, product, claimed_defect, reference_images):
        return {"identity_status": self.identity, "defect_status": self.defect, "observed_defects": [claimed_defect],
                "raw_scores": {"test_double": True}, "model_version": "test-double"}


def test_store_photo_claim_verified_by_vision_is_auto_approved(store, monkeypatch):
    monkeypatch.setattr(shopflow, "fetch_store_evidence", lambda url: _png_bytes())
    monkeypatch.setattr("app.vision.get_vision_provider", lambda: _VisionDouble("verified", "verified"))
    store["SF-EVID"] = store_context("SF-EVID", reason="PRODUCT_DAMAGED", evidence_required=True,
                                     evidence=["earcup.jpg"], description="Ear cushion torn")
    data = send_event("SF-EVID")
    assert data["assigned_desk"] == "CS_1" and data["next_action"] == "AUTO_APPROVE"


def test_store_photo_claim_without_vision_goes_to_review(store, monkeypatch):
    monkeypatch.setattr(shopflow, "fetch_store_evidence", lambda url: _png_bytes())
    monkeypatch.setattr("app.vision.get_vision_provider", lambda: None)
    store["SF-NOVIS"] = store_context("SF-NOVIS", reason="PRODUCT_DAMAGED", evidence_required=True,
                                      evidence=["earcup2.jpg"], description="Ear cushion torn")
    data = send_event("SF-NOVIS")
    assert data["assigned_desk"] == "CS_2" and data["next_action"] == "MANUAL_REVIEW"
    assert data["visual_evidence"]["verification_status"] == "inconclusive"


def test_store_photo_of_different_product_asks_for_identity_proof(store, monkeypatch):
    monkeypatch.setattr(shopflow, "fetch_store_evidence", lambda url: _png_bytes())
    monkeypatch.setattr("app.vision.get_vision_provider", lambda: _VisionDouble("mismatch", "verified"))
    store["SF-MISM"] = store_context("SF-MISM", reason="PRODUCT_DAMAGED", evidence_required=True,
                                     evidence=["other.jpg"], description="Cracked casing")
    data = send_event("SF-MISM")
    assert data["assigned_desk"] == "CS_2" and data["next_action"] == "AWAIT_PROOF"


def test_store_photo_that_cannot_be_downloaded_is_not_guessed(store, monkeypatch):
    monkeypatch.setattr(shopflow, "fetch_store_evidence", lambda url: None)
    store["SF-NODL"] = store_context("SF-NODL", reason="PRODUCT_DAMAGED", evidence_required=True,
                                     evidence=["damage-headphones.jpg"], description="Damaged on arrival")
    data = send_event("SF-NODL")
    assert data["assigned_desk"] == "CS_2"
    assert data["visual_evidence"]["verification_status"] == "not_assessable"


def test_store_claim_outside_window_is_auto_rejected(store):
    store["SF-LATE"] = store_context("SF-LATE", within=False, days=40)
    data = send_event("SF-LATE")
    assert data["assigned_desk"] == "CS_3" and data["decision"] == "REJECTED"
    assert outbox_kinds(data["ritos_ticket_id"]) == ["DECISION"]


def test_high_value_claim_waits_for_human_then_approval_is_sent(store):
    store["SF-BIG"] = store_context("SF-BIG", amount_minor=1899900)
    data = send_event("SF-BIG")
    assert data["assigned_desk"] == "CS_2" and data["next_action"] == "AWAIT_APPROVAL"
    r = client.post(f"/api/v1/tickets/{data['ritos_ticket_id']}/authorize-payout", headers=login("finance@ritos.local"))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "DECISION_QUEUED_FOR_STORE"
    assert outbox_kinds(data["ritos_ticket_id"]) == ["STATUS", "NOTIFICATION", "DECISION"]
    # a second approval cannot send a second decision
    assert client.post(f"/api/v1/tickets/{data['ritos_ticket_id']}/authorize-payout", headers=login("finance@ritos.local")).status_code == 409
    wf = client.get(f"/api/v1/tickets/{data['ritos_ticket_id']}/workflow", headers=login("admin@ritos.local")).json()
    assert wf["runs"][0]["trigger"] == "HUMAN_DECISION" and wf["runs"][1]["status"] == "RESUMED"


def test_replayed_event_does_not_rerun_workflow(store):
    store["SF-REPLAY"] = store_context("SF-REPLAY")
    first = send_event("SF-REPLAY", event_id="EVT-REPLAY-1")
    again = send_event("SF-REPLAY", event_id="EVT-REPLAY-1")
    assert again["replayed"] is True
    with SessionLocal() as db:
        assert len(db.scalars(select(WorkflowRun).where(WorkflowRun.ticket_id == first["ritos_ticket_id"])).all()) == 1


def test_execution_completed_marks_ticket_refunded(store):
    store["SF-EXEC"] = store_context("SF-EXEC")
    data = send_event("SF-EXEC")
    send_event("SF-EXEC", event_type="refund.execution.completed", amount_minor=149900, refund_id="RF-1")
    with SessionLocal() as db:
        t = db.get(Ticket, data["ritos_ticket_id"])
        assert t.refund_status == "REFUNDED" and t.status == "RESOLVED"


def test_customer_cannot_approve_own_proof(store):
    store["SF-CUST"] = store_context("SF-CUST", reason="PRODUCT_DAMAGED", evidence_required=True)
    data = send_event("SF-CUST")
    r = client.post(f"/api/v1/tickets/{data['ritos_ticket_id']}/proof-action", json={"action": "APPROVE_PROOF"},
                    headers=login("customer@ritos.local"))
    assert r.status_code == 403


def test_payout_refused_outside_cs1(store):
    store["SF-CS3"] = store_context("SF-CS3", within=False, days=40)
    data = send_event("SF-CS3")
    r = client.post(f"/api/v1/tickets/{data['ritos_ticket_id']}/authorize-payout", headers=login("finance@ritos.local"))
    assert r.status_code == 409


@pytest.mark.parametrize("order,item,cat,amount,desc,days,photos,reason,desk", [
    ("ORD-88201", "Executive Laptop Sleeve 15-inch", "APPAREL", 2499, "Main zipper stitching came loose on first use.", 2, [], "DEFECTIVE_PRODUCT", "CS_2"),
    ("ORD-88202", "Nimbus Wireless ANC Headphones", "ELECTRONICS", 2999, "Left ear cushion torn inside box.", 5, [], "PRODUCT_DAMAGED", "CS_2"),
    ("ORD-88202", "Nimbus ANC Headphones (photo)", "ELECTRONICS", 2999, "Left ear cushion torn inside box.", 5, ["earcup_cushion_tear.jpg"], "PRODUCT_DAMAGED", "CS_2"),
    ("ORD-88203", "Aura Mechanical RGB Gaming Keyboard", "ELECTRONICS", 3499, "Decided I do not like tactile switches.", 26, [], "CHANGED_MIND", "CS_3"),
    ("ORD-88204", "Precision Stylus Pen Pro", "ELECTRONICS", 1499, "Stylus pressure tip erratic out of the box.", 2, [], "DEFECTIVE_PRODUCT", "CS_2"),
    ("ORD-88205", "Cotton Throw Blanket", "GENERAL", 1299, "Colour does not suit my room.", 3, [], "CHANGED_MIND", "CS_1"),
], ids=["sleeve-no-photo", "headphones-no-photo", "headphones-filename-only", "keyboard-expired", "stylus-defect", "blanket-changed-mind"])
def test_storefront_demo_claims_route_to_expected_desk(store, order, item, cat, amount, desc, days, photos, reason, desk):
    tid = f"sf_tkt_{uuid4().hex[:8]}"
    purchase = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    data = send_event(tid, order_id=order, transaction_id=f"TXN-{order}", item_name=item, item_category=cat,
                      claimed_amount=amount, description=desc, purchase_date=purchase, evidence_images=photos, category=reason)
    assert data["store_linked"] is False
    assert data["assigned_desk"] == desk, data["policy_evaluation_reason"]
    assert data["callbacks"][0]["kind"] == "NONE"


def test_second_claim_for_same_item_is_duplicate(store):
    common = dict(order_id="ORD-88299", transaction_id="TXN-ORD-88299", item_name="MagSafe Fast Wireless Stand",
                  item_category="ELECTRONICS", claimed_amount=1999, description="Wrong colour sent",
                  purchase_date=datetime.now(timezone.utc).isoformat())
    send_event(f"sf_tkt_{uuid4().hex[:8]}", **common)
    data = send_event(f"sf_tkt_{uuid4().hex[:8]}", **common)
    assert data["assigned_desk"] == "CS_3" and "Duplicate" in data["policy_evaluation_reason"]


def test_outbox_retries_in_order_then_marks_failed(store, monkeypatch):
    store["SF-OUT"] = store_context("SF-OUT", reason="PRODUCT_DAMAGED", evidence_required=True)
    data = send_event("SF-OUT")
    calls = []

    def flaky(msg):
        calls.append(msg.kind)
        return httpx.Response(503, json={"error": "down"})
    monkeypatch.setattr(outbox, "_send", flaky)
    with SessionLocal() as db:
        db.query(OutboxMessage).filter(OutboxMessage.ticket_id != data["ritos_ticket_id"]).update({"status": "SENT"})
        db.commit()
        outbox.deliver_due(db)
        assert calls == ["STATUS"]  # notification waits behind the failed status update
        for m in db.scalars(select(OutboxMessage)):
            m.next_attempt_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
        monkeypatch.setattr(outbox, "_send", lambda msg: calls.append(msg.kind) or httpx.Response(200, json={"ok": True}))
        outbox.deliver_due(db)
        assert calls == ["STATUS", "STATUS", "NOTIFICATION"]
        assert {m.status for m in db.scalars(select(OutboxMessage).where(OutboxMessage.ticket_id == data["ritos_ticket_id"]))} == {"SENT"}


def test_reused_store_ticket_number_starts_a_new_ticket(store):
    store["SF-REUSE"] = store_context("SF-REUSE")
    first = send_event("SF-REUSE")
    # the store resets its data and hands the same ticket number to a different order
    ctx = store_context("SF-REUSE")
    ctx["order"]["order_id"] = "ORD-NEW-AFTER-RESET"
    ctx["transaction"]["transaction_id"] = "TXN-NEW-AFTER-RESET"
    store["SF-REUSE"] = ctx
    second = send_event("SF-REUSE")
    assert second["ritos_ticket_id"] != first["ritos_ticket_id"]
    assert second["next_action"] == "AUTO_APPROVE"
    assert outbox_kinds(second["ritos_ticket_id"]) == ["DECISION"]
    with SessionLocal() as db:
        assert db.get(Ticket, first["ritos_ticket_id"]).ticket_number.startswith("SF-REUSE~")


def test_slow_store_is_retried_not_guessed(monkeypatch):
    def unavailable(tid):
        raise shopflow.StoreUnavailable("timed out")
    monkeypatch.setattr(shopflow, "fetch_shopflow_context", unavailable)
    r = client.post("/webhook/refund-tickets", json={"event_id": "EVT-SLOW-1", "ticket_id": "SF-SLOW"}, headers=KEY)
    assert r.status_code == 503
    with SessionLocal() as db:
        assert db.scalar(select(Ticket).where(Ticket.ticket_number == "SF-SLOW")) is None


def test_store_event_without_context_or_facts_is_retried(store):
    # 404 from the store and no claim details in the event: nothing to evaluate, so ask for a retry
    r = client.post("/webhook/refund-tickets", json={"event_id": "EVT-NOFACTS-1", "ticket_id": "SF-NOFACTS"}, headers=KEY)
    assert r.status_code == 503


ECOM = {"order_id": "ORD-1002", "transaction_id": "TXN-1002", "claimed_amount": 499, "currency": "INR",
        "customer_email": "customer@ritos.local",
        "description": "Item arrived damaged in transit", "item_name": "Desk Lamp", "item_category": "GENERAL"}


def test_ecommerce_intake_accepts_secret_or_staff_only():
    from app.config import settings
    url = "/api/v1/integrations/ecommerce/ticket"
    assert client.post(url, json=ECOM).status_code == 401
    assert client.post(url, json=ECOM, headers={"X-Ecommerce-Secret": "wrong"}).status_code == 401
    assert client.post(url, json=ECOM, headers=login("customer@ritos.local")).status_code == 401
    assert client.post(url, json=ECOM, headers=login("agent@ritos.local")).status_code == 200
    settings.ecommerce_webhook_secret = "server-secret"
    try:
        store = {"X-Ecommerce-Secret": "server-secret"}
        new_tx = {**ECOM, "order_id": "ORD-ECOM-2", "transaction_id": "TXN-ECOM-2"}
        # A claim never certifies its own payment: an unknown transaction needs the store's payment facts.
        assert client.post(url, json=new_tx, headers=store).status_code == 409
        assert client.post(url, json={**new_tx, "transaction_amount": 999, "payment_status": "SUCCESSFUL"},
                           headers=store).status_code == 200
    finally:
        settings.ecommerce_webhook_secret = ""


def test_ecommerce_intake_never_guesses_customer_or_payment():
    staff = login("agent@ritos.local")
    url = "/api/v1/integrations/ecommerce/ticket"
    assert client.post(url, json={**ECOM, "customer_email": "nobody@example.com"}, headers=staff).status_code == 404
    unknown_tx = {**ECOM, "transaction_id": "TXN-NOT-IN-LEDGER", "transaction_amount": 999, "payment_status": "SUCCESSFUL"}
    assert client.post(url, json=unknown_tx, headers=staff).status_code == 409  # staff cannot create payments
