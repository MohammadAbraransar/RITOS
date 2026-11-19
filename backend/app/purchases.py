"""What a customer may claim from the self-service portal, decided only from trusted records.

One source of truth for both the purchase list the portal shows and claim intake (POST /tickets):
product, category and purchase date come from the ledger order (Transaction + OrderItem + Product), the refundable
amount from what was paid less what is already refunded or being refunded, and eligibility from the configured
return policy (policy_agent). Nothing here reads a value the customer typed.
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from .agents.claim_reason_agent import STORE_REASON_MAP
from .agents.decision_agent import EVIDENCE_REASONS
from .agents.policy_agent import evaluate_policy_eligibility, get_effective_policy
from .models import OrderItem, Product, RefundRequest, RefundStatus, Ticket, TicketStatus, Transaction

# Reasons the portal offers. Keys are the structured reasons the claim-reason agent already understands
# (claim_reason_agent.STORE_REASON_MAP); the label is what the customer sees and what the claim text starts with.
CLAIM_REASONS: Dict[str, str] = {
    "PRODUCT_DEFECTIVE": "The item is defective or doesn't work",
    "PRODUCT_DAMAGED": "The item arrived damaged",
    "WRONG_PRODUCT": "I received the wrong item",
    "MISSING_ITEM": "Parts or items are missing",
    "NOT_AS_DESCRIBED": "The item is not as described",
    "WRONG_SIZE": "The item doesn't fit",
    "CHANGED_MIND": "I changed my mind",
    "OTHER": "Something else",
}
# Reasons that need the customer's own words, because the reason alone says nothing
DETAILS_REQUIRED = {"OTHER"}
# Problems with the item itself: the only claims a merchant defect exception can cover (same set the pipeline uses)
ITEM_PROBLEM_REASONS = {k for k in CLAIM_REASONS if STORE_REASON_MAP.get(k) in EVIDENCE_REASONS}

# Refunds that still hold part of the transaction's balance (same set propose_refund() counts)
ACTIVE_REFUND = [RefundStatus.PENDING_APPROVAL.value, RefundStatus.APPROVED.value, RefundStatus.PROCESSING.value,
                 RefundStatus.RECONCILIATION_REQUIRED.value]

# Eligibility states. CLAIMABLE ones may be submitted; the rest are shown with the reason they cannot be.
ELIGIBLE, ITEM_PROBLEM_ONLY, NEEDS_REVIEW = "ELIGIBLE", "ITEM_PROBLEM_ONLY", "NEEDS_REVIEW"
NOT_REFUNDABLE, EXPIRED, REFUNDED, ALREADY_CLAIMED, UNAVAILABLE = (
    "NOT_REFUNDABLE", "EXPIRED", "REFUNDED", "ALREADY_CLAIMED", "UNAVAILABLE")
CLAIMABLE = {ELIGIBLE, ITEM_PROBLEM_ONLY, NEEDS_REVIEW}


def _aware(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _money(v) -> Decimal:
    return Decimal(str(v or 0)).quantize(Decimal("0.01"))


def remaining_balance(db: Session, tx: Transaction) -> Decimal:
    """Paid minus refunded minus refunds already moving through approval/payment."""
    pending = db.scalars(select(RefundRequest.amount).where(
        RefundRequest.transaction_id == tx.id, RefundRequest.status.in_(ACTIVE_REFUND))).all()
    return _money(tx.amount) - _money(tx.refunded_amount) - sum((_money(p) for p in pending), Decimal("0"))


def _existing_claim(tickets: Iterable[Ticket], tx: Transaction, item: OrderItem, product: Optional[Product]) -> Optional[Ticket]:
    """An earlier claim for this exact item that was not turned down (a rejected one is judged again by the
    duplicate check in the pipeline)."""
    for t in tickets:
        if t.transaction_id != tx.id or t.status == TicketStatus.REJECTED.value:
            continue
        ev = t.classification_evidence or {}
        if ev.get("order_item_id") == item.id or (not ev.get("order_item_id") and product and t.item_name == product.name):
            return t
    return None


def assess_purchase(db: Session, tx: Transaction, item: OrderItem, product: Optional[Product],
                    customer_tickets: Iterable[Ticket], now: Optional[datetime] = None) -> Dict[str, Any]:
    """Eligibility of one purchased item, from trusted records only."""
    now = now or datetime.now(timezone.utc)
    purchased_at = _aware(tx.created_at)
    refundable = min(_money(item.amount), max(remaining_balance(db, tx), Decimal("0")))
    out: Dict[str, Any] = {"refundable_amount": float(refundable), "return_window_days": None, "days_elapsed": None,
                           "window_ends_at": None, "existing_claim": None, "reason_code": None}

    def result(status: str, message: str, **extra):
        return {**out, **extra, "status": status, "claimable": status in CLAIMABLE, "message": message}

    if not product:
        return result(UNAVAILABLE, "We can't show this product's details right now. Please contact support to claim it.")
    claim = _existing_claim(customer_tickets, tx, item, product)
    if claim:
        out["existing_claim"] = {"id": claim.id, "ticket_number": claim.ticket_number}
        if claim.refund_status == RefundStatus.REFUNDED.value:
            return result(REFUNDED, f"This item has already been refunded ({claim.ticket_number}).")
        return result(ALREADY_CLAIMED, f"You already have a refund request for this item ({claim.ticket_number}).")
    if refundable <= 0:
        return result(REFUNDED, "This item has already been refunded.")

    policy = get_effective_policy(db, product.category)
    decision = evaluate_policy_eligibility(policy, purchased_at, as_of=now)
    window = policy.get("return_window_days")
    out.update(return_window_days=window, days_elapsed=decision.get("days_elapsed"), reason_code=decision["reason_code"])
    if window:
        out["window_ends_at"] = (purchased_at + timedelta(days=window)).isoformat()
    exceptions = bool(policy.get("allow_damaged_exceptions"))
    code = decision["reason_code"]

    if code == "POLICY_FINAL_SALE":
        if exceptions:
            return result(ITEM_PROBLEM_ONLY, "Final sale item: you can only request a refund if there is a problem "
                                             "with the item itself, such as damage or a defect. A photo is required.")
        return result(NOT_REFUNDABLE, "Products in this category are not eligible for refunds under our refund policy.")
    if code == "POLICY_WINDOW_EXPIRED":
        if exceptions:
            return result(ITEM_PROBLEM_ONLY, "The return period has ended. You can still request a refund if there is "
                                             "a problem with the item itself, such as damage or a defect. A photo is required.")
        return result(EXPIRED, "This purchase is outside the eligible refund period.")
    if code in ("POLICY_MISSING", "POLICY_DATE_UNKNOWN"):
        return result(NEEDS_REVIEW, "You can request a refund. A member of our team will review it.")
    if (tx.payment_status or "").upper() != "SUCCESSFUL":
        return result(NEEDS_REVIEW, "Payment for this order is still being confirmed, so a member of our team will review your request.")
    return result(ELIGIBLE, "Eligible for a refund.")


def product_view(product: Optional[Product]) -> Optional[Dict[str, Any]]:
    if not product:
        return None
    # The catalog has no customer-facing product images yet (reference images are for evidence checks only).
    return {"sku": product.sku, "name": product.name, "category": product.category, "brand": product.brand or None,
            "image_url": None}


def customer_tickets(db: Session, customer_id: str) -> List[Ticket]:
    return list(db.scalars(select(Ticket).where(Ticket.customer_id == customer_id)))


def list_purchases(db: Session, customer_id: str) -> List[Dict[str, Any]]:
    """One entry per purchased item, newest first. Orders without item records are listed as unavailable."""
    now = datetime.now(timezone.utc)
    txs = db.scalars(select(Transaction).where(Transaction.customer_id == customer_id)
                     .order_by(Transaction.created_at.desc())).all()
    tickets = customer_tickets(db, customer_id)
    items_by_tx: Dict[str, List[OrderItem]] = {}
    if txs:
        for it in db.scalars(select(OrderItem).where(OrderItem.transaction_id.in_([t.id for t in txs]))
                             .order_by(OrderItem.created_at)):
            items_by_tx.setdefault(it.transaction_id, []).append(it)
    skus = {it.product_sku for items in items_by_tx.values() for it in items}
    products = {p.sku: p for p in db.scalars(select(Product).where(Product.sku.in_(skus)))} if skus else {}

    out: List[Dict[str, Any]] = []
    for tx in txs:
        base = {"transaction_id": tx.id, "order_id": tx.order_id, "currency": tx.currency,
                "purchased_at": _aware(tx.created_at).isoformat()}
        items = items_by_tx.get(tx.id) or []
        if not items:
            out.append({**base, "purchase_id": None, "product": None, "quantity": None, "amount": float(_money(tx.amount)),
                        "eligibility": {"status": UNAVAILABLE, "claimable": False, "refundable_amount": 0.0,
                                        "message": "We can't show the products in this order right now. "
                                                   "Please contact support to claim it.",
                                        "return_window_days": None, "days_elapsed": None, "window_ends_at": None,
                                        "existing_claim": None, "reason_code": None}})
            continue
        for it in items:
            product = products.get(it.product_sku)
            out.append({**base, "purchase_id": it.id, "product": product_view(product), "quantity": it.quantity,
                        "amount": float(_money(it.amount)),
                        "eligibility": assess_purchase(db, tx, it, product, tickets, now)})
    return out
