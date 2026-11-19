"""Customer portal claims: everything that decides a refund comes from trusted records, and the backend re-checks
it no matter what the browser sends (tampered amounts, products, categories, other customers' orders)."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.database import SessionLocal
from app.models import OrderItem, Product, ReturnPolicy, Transaction, User
from app.security import hash_password

client = TestClient(app)
INTERNAL_FIELDS = {"classification_evidence", "assigned_desk", "decision_bucket", "priority", "queue", "confidence",
                   "customer_message_draft", "policy_evaluation_reason", "recommended_action", "assigned_to_id", "automation"}


def _headers(email):
    r = client.post("/api/v1/auth/login", json={"email": email, "password": "ChangeMe123!"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _customer_id(email="customer@ritos.local"):
    with SessionLocal() as db:
        return db.scalar(select(User).where(User.email == email)).id


def _order(items, days_ago=2, customer_email="customer@ritos.local", payment="SUCCESSFUL"):
    """A ledger order with its products. items: [(name, category, amount)]. Returns (txid, [item ids])."""
    txid = f"TXN-P-{uuid4().hex[:8]}"
    with SessionLocal() as db:
        db.add(Transaction(id=txid, customer_id=_customer_id(customer_email), order_id=f"ORD-{txid}",
                           amount=sum(a for _, _, a in items), currency="INR", payment_status=payment, refunded_amount=0,
                           created_at=datetime.now(timezone.utc) - timedelta(days=days_ago)))
        ids = []
        for i, (name, category, amount) in enumerate(items):
            sku = f"SKU-{txid}-{i}"
            db.add(Product(sku=sku, name=name, category=category, price_minor=int(amount * 100), currency="INR"))
            item = OrderItem(transaction_id=txid, product_sku=sku, amount=amount)
            db.add(item); db.flush(); ids.append(item.id)
        db.commit()
    return txid, ids


def _policy(category, window, exceptions):
    with SessionLocal() as db:
        if not db.scalar(select(ReturnPolicy).where(ReturnPolicy.category == category)):
            db.add(ReturnPolicy(category=category, return_window_days=window, allow_damaged_exceptions=exceptions,
                                policy_summary=f"test policy {category}"))
            db.commit()


def _purchase(txid, item_id=None):
    items = client.get("/api/v1/customer/purchases", headers=_headers("customer@ritos.local")).json()["items"]
    return next(p for p in items if p["transaction_id"] == txid and (item_id is None or p["purchase_id"] == item_id))


def _submit(body):
    return client.post("/api/v1/tickets", headers=_headers("customer@ritos.local"), json=body)


def test_purchases_list_products_with_eligibility_from_trusted_records():
    txid, (item,) = _order([("Trail Running Shoes", "APPAREL", 2400)], days_ago=3)
    p = _purchase(txid)
    assert p["purchase_id"] == item and p["product"]["name"] == "Trail Running Shoes"
    assert p["product"]["category"] == "APPAREL" and p["amount"] == 2400
    e = p["eligibility"]
    assert e["status"] == "ELIGIBLE" and e["claimable"] and e["refundable_amount"] == 2400
    assert e["return_window_days"] == 30 and e["days_elapsed"] == 3 and e["window_ends_at"]
    reasons = client.get("/api/v1/customer/purchases", headers=_headers("customer@ritos.local")).json()["reasons"]
    by_code = {r["code"]: r for r in reasons}
    assert by_code["PRODUCT_DAMAGED"]["item_problem"] is True and by_code["CHANGED_MIND"]["item_problem"] is False
    assert by_code["OTHER"]["details_required"] is True


def test_expired_and_non_refundable_purchases_are_shown_and_refused_by_the_backend():
    _policy("TEST_FINAL", 0, False)       # final sale, no defect exception
    _policy("TEST_SHORT", 7, False)       # 7-day window, no defect exception
    final_tx, _ = _order([("Gift Card", "TEST_FINAL", 500)], days_ago=1)
    expired_tx, _ = _order([("Desk Lamp", "TEST_SHORT", 900)], days_ago=20)
    assert _purchase(final_tx)["eligibility"]["status"] == "NOT_REFUNDABLE"
    assert _purchase(expired_tx)["eligibility"]["status"] == "EXPIRED"
    assert _purchase(expired_tx)["eligibility"]["claimable"] is False
    # a hand-built request is refused all the same, even with a damage reason
    for txid in (final_tx, expired_tx):
        r = _submit({"transaction_id": txid, "reason": "PRODUCT_DAMAGED"})
        assert r.status_code == 409, r.text


def test_merchant_defect_exception_allows_only_item_problems():
    txid, _ = _order([("Old Speaker", "ELECTRONICS", 1999)], days_ago=40)  # ELECTRONICS: 14 days, exceptions allowed
    assert _purchase(txid)["eligibility"]["status"] == "ITEM_PROBLEM_ONLY"
    assert _submit({"transaction_id": txid, "reason": "CHANGED_MIND"}).status_code == 409
    assert _submit({"transaction_id": txid, "reason": "PRODUCT_DEFECTIVE"}).status_code == 200


def test_tampered_amount_product_and_category_are_ignored_and_recorded():
    txid, _ = _order([("Ceramic Mug", "GENERAL", 450)])
    r = _submit({"transaction_id": txid, "reason": "PRODUCT_DAMAGED", "claimed_amount": 99999, "currency": "USD",
                 "item_name": "iPhone 16 Pro", "item_category": "APPAREL", "order_id": "ORD-SOMEONE-ELSE"})
    assert r.status_code == 200, r.text
    claim = r.json()
    assert claim["claimed_amount"] == 450 and claim["currency"] == "INR"
    assert claim["item_name"] == "Ceramic Mug" and claim["item_category"] == "GENERAL" and claim["order_id"] == f"ORD-{txid}"
    staff = client.get(f"/api/v1/tickets/{claim['id']}", headers=_headers("admin@ritos.local")).json()
    ignored = staff["classification_evidence"]["client_values_ignored"]
    assert set(ignored) == {"claimed_amount", "currency", "item_name", "item_category", "order_id"}


def test_refundable_amount_excludes_what_is_already_refunded():
    txid, _ = _order([("Rain Jacket", "APPAREL", 3000)])
    with SessionLocal() as db:
        db.query(Transaction).filter(Transaction.id == txid).update({"refunded_amount": 1000}); db.commit()
    assert _purchase(txid)["eligibility"]["refundable_amount"] == 2000
    r = _submit({"transaction_id": txid, "reason": "WRONG_SIZE", "claimed_amount": 3000})
    assert r.status_code == 200 and r.json()["claimed_amount"] == 2000


def test_another_customers_purchase_or_item_cannot_be_claimed():
    with SessionLocal() as db:
        if not db.scalar(select(User).where(User.email == "other.customer@ritos.local")):
            db.add(User(email="other.customer@ritos.local", full_name="Other Customer", role="customer",
                        password_hash=hash_password("ChangeMe123!")))
            db.commit()
    other_tx, (other_item,) = _order([("Their Laptop", "ELECTRONICS", 50000)], customer_email="other.customer@ritos.local")
    mine_tx, _ = _order([("My Mouse", "ELECTRONICS", 800)])
    assert _submit({"transaction_id": other_tx, "reason": "PRODUCT_DAMAGED"}).status_code == 404
    assert _submit({"transaction_id": "TXN-DOES-NOT-EXIST", "reason": "PRODUCT_DAMAGED"}).status_code == 404
    # their item id smuggled into my order
    assert _submit({"transaction_id": mine_tx, "purchase_id": other_item, "reason": "PRODUCT_DAMAGED"}).status_code == 404
    mine = client.get("/api/v1/customer/purchases", headers=_headers("customer@ritos.local")).json()["items"]
    assert other_tx not in {p["transaction_id"] for p in mine}


def test_multi_item_orders_need_the_item_and_each_item_is_claimed_once():
    txid, (dock, cable) = _order([("Dock", "ELECTRONICS", 1299), ("Cable", "ELECTRONICS", 299)])
    assert _submit({"transaction_id": txid, "reason": "PRODUCT_DEFECTIVE"}).status_code == 422
    r = _submit({"transaction_id": txid, "purchase_id": cable, "reason": "PRODUCT_DEFECTIVE"})
    assert r.status_code == 200 and r.json()["item_name"] == "Cable" and r.json()["claimed_amount"] == 299
    assert _purchase(txid, cable)["eligibility"]["status"] == "ALREADY_CLAIMED"
    assert _submit({"transaction_id": txid, "purchase_id": cable, "reason": "PRODUCT_DAMAGED"}).status_code == 409
    assert _purchase(txid, dock)["eligibility"]["status"] == "ELIGIBLE"  # the other product is unaffected


def test_orders_without_product_records_cannot_be_claimed_online():
    txid = f"TXN-P-{uuid4().hex[:8]}"
    with SessionLocal() as db:
        db.add(Transaction(id=txid, customer_id=_customer_id(), order_id=f"ORD-{txid}", amount=700, currency="INR",
                           payment_status="SUCCESSFUL", refunded_amount=0))
        db.commit()
    assert _purchase(txid)["eligibility"]["status"] == "UNAVAILABLE"
    r = _submit({"transaction_id": txid, "description": "It broke on the first day.", "item_name": "Anything",
                 "item_category": "GENERAL", "claimed_amount": 700})
    assert r.status_code == 409


def test_reason_or_words_are_required_and_other_needs_words():
    txid, _ = _order([("Notebook", "GENERAL", 200)])
    assert _submit({"transaction_id": txid}).status_code == 422
    assert _submit({"transaction_id": txid, "reason": "NOT_A_REASON"}).status_code == 422
    assert _submit({"transaction_id": txid, "reason": "OTHER"}).status_code == 422
    r = _submit({"transaction_id": txid, "reason": "OTHER", "description": "Pages are printed upside down."})
    assert r.status_code == 200
    claim = r.json()
    assert claim["reason"] == "OTHER" and claim["details"] == "Pages are printed upside down."
    assert claim["description"].startswith("Something else.")


def test_customers_never_receive_internal_claim_data():
    txid, _ = _order([("Water Bottle", "GENERAL", 600)])
    created = _submit({"transaction_id": txid, "reason": "PRODUCT_DAMAGED"}).json()
    listed = client.get("/api/v1/tickets", headers=_headers("customer@ritos.local")).json()["items"]
    one = client.get(f"/api/v1/tickets/{created['id']}", headers=_headers("customer@ritos.local")).json()
    for view in (created, one, next(t for t in listed if t["id"] == created["id"])):
        assert not INTERNAL_FIELDS & set(view), INTERNAL_FIELDS & set(view)
        assert view["customer_status"]["code"] in {"UNDER_REVIEW", "ACTION_NEEDED"}
    staff = client.get(f"/api/v1/tickets/{created['id']}", headers=_headers("admin@ritos.local")).json()
    assert "classification_evidence" in staff and "assigned_desk" in staff


def _photo_b64():
    import base64, io, random
    from PIL import Image
    rng = random.Random(11)
    img = Image.new("RGB", (320, 320))
    img.putdata([(rng.randrange(256), rng.randrange(256), rng.randrange(256)) for _ in range(320 * 320)])
    buf = io.BytesIO(); img.save(buf, format="JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def test_late_item_claim_with_a_photo_goes_to_a_person_not_back_to_the_customer():
    txid, _ = _order([("Late Speaker", "ELECTRONICS", 1999)], days_ago=40)
    r = _submit({"transaction_id": txid, "reason": "PRODUCT_DAMAGED", "evidence_images": [_photo_b64()]})
    assert r.status_code == 200, r.text
    assert r.json()["customer_status"]["code"] == "UNDER_REVIEW"
    staff = client.get(f"/api/v1/tickets/{r.json()['id']}", headers=_headers("admin@ritos.local")).json()
    assert staff["classification_evidence"]["workflow"]["next_action"] == "MANUAL_REVIEW"
    # without a photo we still ask for one
    txid2, _ = _order([("Late Speaker 2", "ELECTRONICS", 1999)], days_ago=40)
    r2 = _submit({"transaction_id": txid2, "reason": "PRODUCT_DAMAGED"})
    assert r2.json()["customer_status"]["code"] == "ACTION_NEEDED"


def test_answering_a_photo_request_hands_the_claim_back_to_the_team():
    txid, _ = _order([("Kettle", "ELECTRONICS", 1500)])
    claim = _submit({"transaction_id": txid, "reason": "PRODUCT_DEFECTIVE"}).json()
    assert claim["customer_status"]["code"] == "ACTION_NEEDED"
    r = client.post("/api/v1/evidence/upload", headers=_headers("customer@ritos.local"), json={
        "ticket_id": claim["id"], "file_name": "kettle.jpg", "file_type": "image/jpeg", "base64_data": _photo_b64()})
    assert r.status_code == 200, r.text
    assert r.json()["claim"]["customer_status"]["code"] == "UNDER_REVIEW"
    assert "photo" in r.json()["claim"]["customer_status"]["description"]
