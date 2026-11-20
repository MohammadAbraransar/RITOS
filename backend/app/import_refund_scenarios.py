"""Import refund-workflow test data for the demo customer (customer@ritos.local): one claim per refund stage,
plus two fresh orders the customer can claim from the portal.

    python -m app.import_refund_scenarios          (from backend/, against DATABASE_URL)

Insert-only and idempotent: it never deletes or overwrites a record. Each scenario is keyed by its order
(TXN-RS-xx); a scenario whose order already exists is skipped. Claims are filed and moved forward through the same
API functions the desk uses (claim intake, approval, second approval, SANDBOX payout), so every record is
consistent with what the application itself writes. The SANDBOX gateway moves no real money.

Requires the base seed (users, return policies): `python -m app.seed`.
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select

from .database import SessionLocal, init_db
from .models import OrderItem, Product, Ticket, Transaction, User
from .schemas import CS1DecisionIn, RefundDecision, TicketCreate

# (key, product name, category, brand, amount INR, days since purchase, claim reason, stage to reach)
# Stages: ORDER_ONLY (no claim yet), FILED (claim filed, nothing decided), PROPOSED, APPROVED, PAID, PAY_FAILED,
#         PAY_UNKNOWN, PAYOUT_REJECTED, CLAIM_REJECTED
SCENARIOS = [
    ("01", "Aluminium Laptop Stand", "GENERAL", "Portronics", 1899, 2, "CHANGED_MIND", "FILED"),
    ("02", "Electric Standing Desk", "GENERAL", "Featherlite", 12499, 3, "CHANGED_MIND", "FILED"),  # >5,000: supervisor
    ("03", "Trail Running Shoes (UK 9)", "APPAREL", "Stride", 2799, 5, "WRONG_SIZE", "PROPOSED"),
    ("04", "Smart LED Desk Lamp", "GENERAL", "Wipro", 2499, 4, "CHANGED_MIND", "APPROVED"),
    ("05", "Wireless Ergonomic Mouse", "GENERAL", "Logitech", 1299, 6, "CHANGED_MIND", "PAID"),
    ("06", "Cork Yoga Mat", "GENERAL", "Decathlon", 1499, 3, "CHANGED_MIND", "PAY_FAILED"),
    ("07", "Insulated Water Bottle", "GENERAL", "Milton", 899, 4, "CHANGED_MIND", "PAY_UNKNOWN"),
    ("08", "Canvas Travel Backpack", "APPAREL", "Wildcraft", 2199, 7, "WRONG_SIZE", "PAYOUT_REJECTED"),
    ("09", "Adjustable Phone Stand", "GENERAL", "Portronics", 699, 3, "CHANGED_MIND", "CLAIM_REJECTED"),
    ("10", "True Wireless Earbuds", "ELECTRONICS", "boAt", 3299, 5, "PRODUCT_DEFECTIVE", "FILED"),
    ("11", "Electric Toothbrush", "HYGIENE", "Oral-B", 2199, 4, None, "ORDER_ONLY"),
    ("12", "Cotton Crew T-Shirt", "APPAREL", "Bewakoof", 1199, 1, None, "ORDER_ONLY"),
]
STAFF = {"proposer": "cs1@ritos.local", "approver": "finance@ritos.local", "executor": "refunds@ritos.local",
         "customer": "customer@ritos.local"}


def _users(db) -> dict:
    found = {k: db.scalar(select(User).where(User.email == e)) for k, e in STAFF.items()}
    missing = [STAFF[k] for k, u in found.items() if not u]
    if missing:
        raise SystemExit(f"Missing users {missing}: run `python -m app.seed` first.")
    return found


def _create_order(db, customer: User, key: str, name: str, category: str, brand: str, amount: int, days: int) -> str:
    txid, sku = f"TXN-RS-{key}", f"RS-{key}-{category[:4]}"
    if not db.get(Product, sku):
        db.add(Product(sku=sku, name=name, category=category, brand=brand, model=name, price_minor=amount * 100, currency="INR"))
    db.add(Transaction(id=txid, customer_id=customer.id, order_id=f"ORD-RS-{key}", amount=amount, currency="INR",
                       payment_status="SUCCESSFUL", refunded_amount=0, provider_reference=f"DEMO-{txid}",
                       created_at=datetime.now(timezone.utc) - timedelta(days=days)))
    db.flush()
    db.add(OrderItem(transaction_id=txid, product_sku=sku, amount=amount))
    db.commit()
    return txid


def _advance(db, ticket_id: str, stage: str, u: dict) -> str:
    """Move a filed claim to the wanted stage through the API functions. Returns what happened."""
    from .api import approve_refund, cs1_direct_refund, cs1_manual_decide, execute_refund, reject_refund
    if stage == "FILED":
        return "filed"
    if stage == "CLAIM_REJECTED":
        cs1_manual_decide(ticket_id, CS1DecisionIn(decision="CANCEL", reason="Courier tracking shows the parcel was "
                          "returned unopened to the warehouse; no refund due."), db, u["proposer"])
        return "claim rejected by the Approval Desk"
    refund_id = cs1_direct_refund(ticket_id, db, u["proposer"])["refund"]["id"]
    if stage == "PROPOSED":
        return "approved by the Approval Desk, waiting for second approval"
    if stage == "PAYOUT_REJECTED":
        reject_refund(refund_id, RefundDecision(reason="The order was already replaced with a new item; a refund "
                      "would pay twice."), db, u["approver"])
        return "payout rejected at second approval"
    approve_refund(refund_id, RefundDecision(reason="Checked against the order and payment records."), db, u["approver"])
    if stage == "APPROVED":
        return "approved twice, ready to pay"
    key = {"PAID": f"rs-exec-{refund_id}", "PAY_FAILED": f"rs-exec-sandbox_fail-{refund_id}",
           "PAY_UNKNOWN": f"rs-exec-sandbox_timeout-{refund_id}"}[stage]
    try:
        res = execute_refund(refund_id, key, db, u["executor"])
        return f"payout {res['status']} ({res.get('provider_reference')})"
    except HTTPException as exc:  # the sandbox decline scenario: nothing is paid
        return f"payout declined ({exc.detail})"


def main() -> None:
    init_db()
    from .api import create_ticket
    created, skipped = [], []
    with SessionLocal() as db:
        u = _users(db)
        for key, name, category, brand, amount, days, reason, stage in SCENARIOS:
            if db.get(Transaction, f"TXN-RS-{key}"):
                skipped.append(f"TXN-RS-{key}")
                continue
            txid = _create_order(db, u["customer"], key, name, category, brand, amount, days)
            if stage == "ORDER_ONLY":
                created.append(f"{txid} {name}: order only (claim it from the portal)")
                continue
            claim = create_ticket(TicketCreate(transaction_id=txid, reason=reason), db, u["customer"])
            t = db.get(Ticket, claim["id"])
            outcome = _advance(db, t.id, stage, u)
            db.refresh(t)
            created.append(f"{txid} {t.ticket_number} {name} ({t.assigned_desk}, {t.status}/{t.refund_status}): {outcome}")
    print(f"Imported {len(created)} scenario(s), skipped {len(skipped)} already present.")
    for line in created:
        print("  +", line)
    if skipped:
        print("  already present:", ", ".join(skipped))


if __name__ == "__main__":
    main()
