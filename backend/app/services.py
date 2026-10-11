import re, uuid, hashlib
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import select
from .models import Ticket, Transaction, TicketEvent, AuditLog, RefundRequest, RefundStatus, TicketStatus

KEYWORDS = {
 "UNAUTHORIZED_PAYMENT": ["unauthorized", "didn't make", "did not make", "not me", "stolen card", "fraud"],
 "DUPLICATE_PAYMENT": ["charged twice", "double charge", "duplicate payment", "two charges", "charged two times"],
 "PAYMENT_ORDER_FAILED": ["order failed", "payment deducted", "money deducted", "order unsuccessful"],
 "REFUND_NOT_RECEIVED": ["refund not received", "not received refund", "refund hasn't arrived", "refund has not arrived", "still waiting", "refund pending"],
 "INCORRECT_REFUND_AMOUNT": ["wrong amount", "incorrect amount", "less refund", "partial refund", "short refund"],
 "CANCELLATION_REFUND": ["cancelled", "canceled", "cancellation"],
 "RETURN_ELIGIBILITY": ["return", "damaged", "defective", "wrong product", "eligibility"],
 "REFUND_FAILED": ["refund failed", "refund failure", "failed refund"],
 "REFUND_REVERSED": ["refund reversed", "reversed refund"],
 "REFUND_STATUS_INQUIRY": ["status of my refund", "refund status", "update on refund"],
 "MISSING_DOCUMENTATION": ["upload proof", "missing document", "receipt", "invoice"]
}
ROUTES = {
 "UNAUTHORIZED_PAYMENT":"Security and Fraud Review",
 "DUPLICATE_PAYMENT":"Payment Investigation",
 "PAYMENT_ORDER_FAILED":"Payment Reconciliation",
 "REFUND_NOT_RECEIVED":"Refund Operations",
 "INCORRECT_REFUND_AMOUNT":"Refund Operations",
 "CANCELLATION_REFUND":"Returns and Refunds",
 "RETURN_ELIGIBILITY":"Returns and Refunds",
 "REFUND_FAILED":"Refund Operations",
 "REFUND_REVERSED":"Payment Investigation",
 "REFUND_STATUS_INQUIRY":"Refund Operations",
 "MISSING_DOCUMENTATION":"Manual Triage",
 "OTHER":"Manual Triage"
}
ACTIONS = {
 "UNAUTHORIZED_PAYMENT":"Urgently verify the transaction and follow account-protection/dispute procedures.",
 "DUPLICATE_PAYMENT":"Verify each provider transaction; do not confuse duplicate tickets with duplicate charges.",
 "PAYMENT_ORDER_FAILED":"Reconcile trusted payment state against order state.",
 "REFUND_NOT_RECEIVED":"Verify provider refund reference and expected settlement timeframe.",
 "RETURN_ELIGIBILITY":"Check the applicable return policy, delivery/return status and evidence.",
 "MISSING_DOCUMENTATION":"Request the missing evidence before making an eligibility decision."
}
def classify(text: str):
    normalized = re.sub(r"\s+", " ", text.lower())
    scores = [(sum(1 for k in kws if k in normalized), category) for category,kws in KEYWORDS.items()]
    scores.sort(reverse=True)
    hits, category = scores[0] if scores else (0,"OTHER")
    if hits == 0: return {"category":"OTHER","confidence":0.42,"evidence":["No strong category phrase matched"],"recommended_action":"Manual review; ask for the exact transaction and desired outcome."}
    confidence = min(0.99, 0.68 + 0.1 * (hits-1))
    matched = [k for k in KEYWORDS[category] if k in normalized]
    return {"category":category,"confidence":round(confidence,2),"evidence":matched,
            "recommended_action":ACTIONS.get(category, "Verify transaction records and review the applicable policy.")}

def verify_transaction(db: Session, transaction_id: str, customer_id: str, amount, currency: str):
    tx = db.get(Transaction, transaction_id)
    if not tx: return {"status":"TRANSACTION_NOT_FOUND","transaction":None}
    if tx.customer_id != customer_id: return {"status":"CUSTOMER_MISMATCH","transaction":None}
    if tx.currency != currency.upper(): return {"status":"AMOUNT_MISMATCH","transaction":None}
    if Decimal(str(tx.amount)) != Decimal(str(amount)): return {"status":"AMOUNT_MISMATCH","transaction":tx}
    if tx.payment_status == "PENDING": return {"status":"PAYMENT_PENDING","transaction":tx}
    if tx.payment_status != "SUCCESSFUL": return {"status":"MANUAL_VERIFICATION_REQUIRED","transaction":tx}
    if Decimal(str(tx.refunded_amount)) >= Decimal(str(tx.amount)): return {"status":"ALREADY_REFUNDED","transaction":tx}
    return {"status":"VERIFIED","transaction":tx}

def calculate_priority(category: str, description: str, created_at=None):
    text = description.lower()
    if category == "UNAUTHORIZED_PAYMENT" or any(x in text for x in ["fraud","unauthorized","not me","stolen card"]): return "P1"
    if any(x in text for x in ["overdue","weeks ago","month ago","months ago"]): return "P2"
    if category in ("MISSING_DOCUMENTATION","REFUND_STATUS_INQUIRY"): return "P4"
    return "P3"

def find_duplicate(db: Session, customer_id: str, transaction_id: str, category: str, description: str):
    # Conservative matching: exact same customer + transaction + category, active canonical ticket.
    active = [TicketStatus.NEW.value, TicketStatus.TRIAGED.value, TicketStatus.IN_REVIEW.value,
              TicketStatus.AWAITING_INFORMATION.value, TicketStatus.ESCALATED.value, TicketStatus.REOPENED.value]
    # Exact transaction ID is a strong linkage signal even when issue categories differ.
    # Link the case for human review; never auto-close or auto-reject solely on this signal.
    existing = db.scalars(select(Ticket).where(Ticket.customer_id==customer_id,
       Ticket.transaction_id==transaction_id, Ticket.status.in_(active)).order_by(Ticket.created_at.desc())).all()
    normalized = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())
    for ticket in existing:
        if normalized(ticket.description) == normalized(description) or ticket.transaction_id == transaction_id:
            return ticket
    return None

def record_event(db: Session, ticket_id: str, actor_id: str|None, event_type: str, details: dict):
    db.add(TicketEvent(ticket_id=ticket_id, actor_id=actor_id, event_type=event_type, details=details))
def audit(db: Session, actor_id: str|None, action: str, entity_type: str, entity_id: str, details: dict|None=None):
    db.add(AuditLog(actor_id=actor_id, action=action, entity_type=entity_type, entity_id=entity_id, details=details or {}))
def refund_key(ticket_id: str, amount, currency: str):
    raw = f"ritos-refund:{ticket_id}:{Decimal(str(amount)).quantize(Decimal('0.01'))}:{currency}"
    return hashlib.sha256(raw.encode()).hexdigest()
