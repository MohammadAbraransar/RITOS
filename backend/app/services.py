import re, uuid, hashlib
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import select, func
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

def calculate_priority(category: str, description: str, created_at=None):
    text = description.lower()
    if category == "UNAUTHORIZED_PAYMENT" or any(x in text for x in ["fraud","unauthorized","not me","stolen card"]): return "P1"
    if any(x in text for x in ["overdue","weeks ago","month ago","months ago"]): return "P2"
    if category in ("MISSING_DOCUMENTATION","REFUND_STATUS_INQUIRY"): return "P4"
    return "P3"

def find_duplicate(db: Session, customer_id: str, transaction_id: str, category: str, description: str, item_name: str | None = None, order_id: str | None = None):
    # Strict 3-point composite matching:
    # A claim is ONLY flagged duplicate if ALL THREE match:
    # 1. Exact transaction_id
    # 2. Exact order_id (if present)
    # 3. Exact item_name / purchased product model
    active = [TicketStatus.NEW.value, TicketStatus.TRIAGED.value, TicketStatus.IN_REVIEW.value,
              TicketStatus.AWAITING_INFORMATION.value, TicketStatus.ESCALATED.value, TicketStatus.REOPENED.value, TicketStatus.RESOLVED.value]
    query = select(Ticket).where(
        Ticket.customer_id == customer_id,
        Ticket.transaction_id == transaction_id,
        Ticket.status.in_(active)
    )
    if order_id and order_id.strip():
        query = query.where(Ticket.order_id == order_id.strip())
    if item_name and item_name.strip():
        norm_item = item_name.strip().lower()
        query = query.where(func.lower(func.trim(Ticket.item_name)) == norm_item)
    else:
        normalized = lambda s: re.sub(r"[^a-z0-9]", "", s.lower()) if s else ""
        existing = db.scalars(query.order_by(Ticket.created_at.desc())).all()
        for ticket in existing:
            if normalized(ticket.description) == normalized(description):
                return ticket
        return None

    return db.scalar(query.order_by(Ticket.created_at.desc()))

def record_event(db: Session, ticket_id: str, actor_id: str|None, event_type: str, details: dict):
    db.add(TicketEvent(ticket_id=ticket_id, actor_id=actor_id, event_type=event_type, details=details))
def audit(db: Session, actor_id: str|None, action: str, entity_type: str, entity_id: str, details: dict|None=None):
    db.add(AuditLog(actor_id=actor_id, action=action, entity_type=entity_type, entity_id=entity_id, details=details or {}))
def refund_key(ticket_id: str, amount, currency: str):
    raw = f"ritos-refund:{ticket_id}:{Decimal(str(amount)).quantize(Decimal('0.01'))}:{currency}"
    return hashlib.sha256(raw.encode()).hexdigest()

PRODUCT_POLICIES = {
    "ELECTRONICS": {
        "return_window_days": 7,
        "requires_serial": True,
        "policy_summary": "7-day replacement or refund for verified hardware or delivery defect."
    },
    "APPAREL": {
        "return_window_days": 14,
        "requires_tags": True,
        "policy_summary": "14-day return window for unworn items with original tags intact."
    },
    "PERISHABLE": {
        "return_window_days": 0,
        "policy_summary": "Final sale. Non-returnable unless package damaged or wrong item delivered."
    },
    "HYGIENE": {
        "return_window_days": 0,
        "policy_summary": "Non-returnable once opened for health and hygiene safety standards."
    },
    "DIGITAL": {
        "return_window_days": 0,
        "policy_summary": "Digital software and keys are non-refundable once delivered."
    },
    "GENERAL": {
        "return_window_days": 14,
        "policy_summary": "Standard 14-day eCommerce satisfaction guarantee."
    }
}

DAMAGE_TERMS = ["damaged", "broken", "cracked", "defective", "not working", "wrong product", "wrong item", "torn", "faulty", "stopped working"]
# Electronics claims need a photo/serial check for any functional defect, not only physical damage.
ELECTRONICS_DEFECT_TERMS = DAMAGE_TERMS + ["defect", "erratic", "overheat", "dead pixel", "no sound", "won't charge", "not charging"]

def policy_for(item_category: str | None, store_facts: dict | None = None) -> dict:
    """Effective policy: the store's own policy snapshot wins over RITOS's built-in category table."""
    item_cat = (item_category or "GENERAL").upper()
    policy = dict(PRODUCT_POLICIES.get(item_cat, PRODUCT_POLICIES["GENERAL"]))
    if store_facts and store_facts.get("return_window_days") is not None:
        policy["return_window_days"] = int(store_facts["return_window_days"])
        policy["policy_summary"] = f"Store policy v{store_facts.get('policy_version', 1)}: {policy['return_window_days']}-day return window."
        policy["source"] = "STORE"
    else:
        policy["source"] = "RITOS_DEFAULT"
    return policy

def evaluate_three_buckets(
    verification_status: str,
    category: str,
    description: str,
    item_category: str = "GENERAL",
    purchase_date=None,
    duplicate_ticket_id: str | None = None,
    claimed_amount: float = 0.0,
    tx_amount: float = 0.0,
    store_facts: dict | None = None,
    proof_verified: bool = False
) -> dict:
    item_cat = (item_category or "GENERAL").upper()
    policy = policy_for(item_cat, store_facts)
    window_days = policy["return_window_days"]
    desc_lower = description.lower()
    facts = store_facts or {}

    # 1. Check for Hard Non-Refundable Disqualifiers (Bucket 3: CS-3)
    if duplicate_ticket_id:
        return {
            "decision_bucket": "NON_REFUNDABLE",
            "assigned_desk": "CS_3",
            "policy_reason": f"Duplicate claim rejected: An active or resolved claim (#{duplicate_ticket_id[:12]}) already exists with identical transaction ID, order ID, and product model.",
            "proof_required": None,
            "eligible": False
        }

    if verification_status == "TRANSACTION_NOT_FOUND":
        return {
            "decision_bucket": "NON_REFUNDABLE",
            "assigned_desk": "CS_3",
            "policy_reason": "Transaction reference was not found in payment gateway records.",
            "proof_required": None,
            "eligible": False
        }

    if verification_status == "ALREADY_REFUNDED":
        return {
            "decision_bucket": "NON_REFUNDABLE",
            "assigned_desk": "CS_3",
            "policy_reason": "Transaction has already been fully refunded in ledger.",
            "proof_required": None,
            "eligible": False
        }

    # Policy window check: the store computes it from the delivery date when it can.
    if facts.get("within_return_window") is False:
        elapsed = facts.get("days_since_delivery")
        return {
            "decision_bucket": "NON_REFUNDABLE",
            "assigned_desk": "CS_3",
            "policy_reason": f"Claim filed past the {window_days}-day return policy window ({elapsed} days since delivery).",
            "proof_required": None,
            "eligible": False
        }
    if "within_return_window" not in facts and purchase_date and window_days > 0:
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        p_date = purchase_date if purchase_date.tzinfo else purchase_date.replace(tzinfo=timezone.utc)
        days_passed = (now - p_date).days
        if days_passed > window_days:
            return {
                "decision_bucket": "NON_REFUNDABLE",
                "assigned_desk": "CS_3",
                "policy_reason": f"Claim filed past the {window_days}-day return policy window ({days_passed} days elapsed).",
                "proof_required": None,
                "eligible": False
            }

    # Non-returnable product category check (unless delivery defect claimed)
    delivery_defect = any(w in desc_lower for w in ["damaged", "broken", "wrong item", "leaked", "spoiled", "expired"])
    if window_days == 0 and not delivery_defect:
        return {
            "decision_bucket": "NON_REFUNDABLE",
            "assigned_desk": "CS_3",
            "policy_reason": f"{item_cat} category is classified as final sale and non-returnable under store policy.",
            "proof_required": None,
            "eligible": False
        }

    # 2. Check for Exceptions and Missing Proof (Bucket 2: CS-2)
    needs_proof = False
    proof_items = []
    exception_reasons = []

    if verification_status in {"AMOUNT_MISMATCH", "CUSTOMER_MISMATCH", "MANUAL_VERIFICATION_REQUIRED"}:
        needs_proof = True
        exception_reasons.append(f"Ledger check exception: {verification_status.replace('_', ' ')}")
        proof_items.append("BANK_STATEMENT_PROOF")

    for conflict in facts.get("claim_data_conflicts") or []:
        needs_proof = True
        exception_reasons.append(f"Store data conflict: {conflict}")
    if facts.get("requested_exceeds_remaining"):
        needs_proof = True
        exception_reasons.append("Requested amount exceeds the remaining refundable balance")

    # Photo/serial proof: the store's evidence rules decide when present, otherwise the claim text does.
    if "evidence_required" in facts:
        proof_needed = bool(facts["evidence_required"]) and int(facts.get("evidence_count") or 0) == 0
    else:
        terms = ELECTRONICS_DEFECT_TERMS if policy.get("requires_serial") else DAMAGE_TERMS
        proof_needed = any(w in desc_lower for w in terms) and not proof_verified
    if proof_needed:
        needs_proof = True
        exception_reasons.append("Item reported damaged, defective or mismatched; photo proof required")
        proof_items.extend(["PHOTO_OF_ITEM", "SHIPPING_LABEL_PHOTO"])

    if category in {"MISSING_DOCUMENTATION", "INCORRECT_REFUND_AMOUNT"}:
        needs_proof = True
        exception_reasons.append(f"Issue category '{category}' requires case verification")
        proof_items.append("RECEIPT_OR_INVOICE")

    if needs_proof:
        return {
            "decision_bucket": "EXCEPTIONAL_PROOF_NEEDED",
            "assigned_desk": "CS_2",
            "policy_reason": " · ".join(exception_reasons) or "Discrepancy detected; verification required.",
            "proof_required": ",".join(list(dict.fromkeys(proof_items))),
            "eligible": False
        }

    # 3. Valid Genuine Claim (Bucket 1: CS-1)
    if verification_status == "VERIFIED":
        return {
            "decision_bucket": "GENUINE_REFUNDABLE",
            "assigned_desk": "CS_1",
            "policy_reason": f"Verified ledger payment, within {window_days}-day policy window, valid claim reason.",
            "proof_required": None,
            "eligible": True
        }

    # Default fallback
    return {
        "decision_bucket": "EXCEPTIONAL_PROOF_NEEDED",
        "assigned_desk": "CS_2",
        "policy_reason": f"Pending manual verification ({verification_status})",
        "proof_required": "PROOF_OF_PURCHASE",
        "eligible": False
    }

def generate_customer_message_draft(
    customer_name: str | None,
    order_id: str | None,
    item_name: str | None,
    claimed_amount: float,
    currency: str,
    decision_bucket: str,
    reason: str,
    proof_required: str | None = None
) -> str:
    name = (customer_name or "Valued Customer").strip()
    order = order_id or "your recent order"
    item = f" ({item_name})" if item_name else ""
    formatted_amt = f"{currency} {claimed_amount:,.2f}"

    if decision_bucket == "GENUINE_REFUNDABLE":
        return (
            f"Dear {name}, your refund request for order {order}{item} ({formatted_amt}) has been "
            f"verified and approved under our store policy. Our Customer Service team is processing your "
            f"refund to your original payment method. Please allow 3-5 business days for settlement."
        )

    if decision_bucket == "EXCEPTIONAL_PROOF_NEEDED":
        proof_str = proof_required.replace("_", " ").lower() if proof_required else "clear photos of the delivered item and package label"
        return (
            f"Dear {name}, regarding your refund inquiry for order {order}{item}: To help us resolve your case "
            f"promptly, our team needs additional verification ({reason}). Please reply with {proof_str}. "
            f"Once received, we will expedite your resolution."
        )

    # NON_REFUNDABLE
    return (
        f"Dear {name}, thank you for contacting customer support regarding order {order}{item}. "
        f"After automated verification against our store refund policy, this request is ineligible for a cash refund "
        f"due to: {reason}. If you believe this is in error, please reply with your invoice for review."
    )

