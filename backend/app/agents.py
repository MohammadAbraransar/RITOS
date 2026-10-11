"""RITOS's deterministic-first automation agents and central orchestrator.

Financial facts come from the database/provider adapter and policy rules. Optional
LLM providers may enrich text understanding but never authorize money movement.
"""
from __future__ import annotations
from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import select, or_, func
from .models import Ticket, Transaction, TicketEvent, AuditLog, TicketStatus
from .services import (
    classify, calculate_priority, find_duplicate, verify_transaction, ROUTES,
    evaluate_three_buckets, generate_customer_message_draft
)

AGENTS = [
    {"id":"transaction_data_fetcher","name":"Transaction Data Fetcher","mode":"deterministic","purpose":"Fetch and validate trusted transaction/order/refund facts."},
    {"id":"duplicate_intelligence","name":"Duplicate Intelligence","mode":"rules+matching","purpose":"Separate repeated tickets from duplicate payment evidence."},
    {"id":"issue_classifier","name":"Issue Classification","mode":"rules+optional-NLP","purpose":"Classify issue with evidence and confidence."},
    {"id":"risk_assessment","name":"Risk & Fraud Signals","mode":"rules+optional-ML","purpose":"Flag risk indicators; never declare fraud from text alone."},
    {"id":"eligibility_policy","name":"Refund Eligibility & Policy","mode":"deterministic","purpose":"Evaluate configured policy against verified facts."},
    {"id":"routing_sla","name":"Routing & SLA","mode":"deterministic","purpose":"Route tickets and compute priority/SLA handling."},
    {"id":"refund_execution","name":"Refund Execution","mode":"provider-adapter","purpose":"Execute only authorized, idempotent refund operations."},
    {"id":"reconciliation_communication","name":"Reconciliation & Communication","mode":"provider-events+templates","purpose":"Reconcile provider state and send accurate status updates."},
]
ORCHESTRATOR = {"id":"central_orchestrator","name":"Central Workflow Orchestrator","purpose":"Coordinate agents, persist decisions, and route exceptions."}


def run_ticket_pipeline(db: Session, ticket: Ticket, actor_id: str | None = None) -> dict:
    """Re-evaluate a persisted ticket without executing a refund automatically."""
    classification = classify(ticket.description)
    # Preserve a high-impact unauthorized-payment label rather than downgrading it.
    if ticket.category == "UNAUTHORIZED_PAYMENT" and classification["category"] != "UNAUTHORIZED_PAYMENT":
        classification["category"] = "UNAUTHORIZED_PAYMENT"
        classification["confidence"] = max(classification["confidence"], float(ticket.confidence or 0))
        classification["evidence"] = ["Existing security-sensitive category retained"]
    ticket.category = classification["category"]
    ticket.confidence = classification["confidence"]
    ticket.recommended_action = classification["recommended_action"]
    ticket.priority = calculate_priority(ticket.category, ticket.description)
    ticket.queue = ROUTES.get(ticket.category, "Manual Triage")

    verification = verify_transaction(db, ticket.transaction_id, ticket.customer_id,
                                       ticket.claimed_amount, ticket.currency)
    ticket.payment_verification = verification["status"]
    if verification["transaction"]:
        ticket.refund_status = verification["transaction"].payment_status

    prior_statuses = [
        TicketStatus.NEW.value, TicketStatus.TRIAGED.value, TicketStatus.IN_REVIEW.value,
        TicketStatus.AWAITING_INFORMATION.value, TicketStatus.ESCALATED.value, 
        TicketStatus.REOPENED.value, TicketStatus.RESOLVED.value
    ]
    
    # Composite Duplicate Detection:
    # A claim is ONLY duplicate if BOTH:
    # 1. Same transaction_id or order_id
    # 2. Same purchased item_name / product model!
    duplicate_query = select(Ticket).where(
        Ticket.id != ticket.id,
        or_(
            Ticket.transaction_id == ticket.transaction_id,
            (Ticket.order_id.isnot(None)) & (Ticket.order_id == ticket.order_id)
        ),
        Ticket.status.in_(prior_statuses)
    )
    if ticket.item_name and ticket.item_name.strip():
        norm_item = ticket.item_name.strip().lower()
        duplicate_query = duplicate_query.where(
            func.lower(func.trim(Ticket.item_name)) == norm_item
        )
    duplicate = db.scalar(duplicate_query.order_by(Ticket.created_at.desc()))
    if duplicate:
        ticket.duplicate_of_id = duplicate.id
    elif ticket.duplicate_of_id:
        ticket.duplicate_of_id = None

    risk_signals = []
    if ticket.category == "UNAUTHORIZED_PAYMENT":
        risk_signals.append({"signal":"UNAUTHORIZED_PAYMENT_REPORT","severity":"HIGH"})
    if verification["status"] in {"CUSTOMER_MISMATCH", "AMOUNT_MISMATCH", "TRANSACTION_NOT_FOUND", "MANUAL_VERIFICATION_REQUIRED"}:
        risk_signals.append({"signal":"TRANSACTION_VERIFICATION_EXCEPTION","severity":"HIGH"})
    if ticket.duplicate_of_id:
        risk_signals.append({"signal":"POSSIBLE_DUPLICATE_TICKET","severity":"MEDIUM"})

    tx = verification["transaction"]
    tx_amt = float(tx.amount) if tx else 0.0

    # 3-Bucket Decision & Auto-Drafting Engine
    three_buckets = evaluate_three_buckets(
        verification_status=verification["status"],
        category=ticket.category,
        description=ticket.description,
        item_category=getattr(ticket, "item_category", "GENERAL") or "GENERAL",
        purchase_date=getattr(ticket, "purchase_date", None),
        duplicate_ticket_id=ticket.duplicate_of_id,
        claimed_amount=float(ticket.claimed_amount),
        tx_amount=tx_amt
    )

    ticket.decision_bucket = three_buckets["decision_bucket"]
    ticket.assigned_desk = three_buckets["assigned_desk"]
    ticket.policy_evaluation_reason = three_buckets["policy_reason"]
    ticket.proof_required = three_buckets["proof_required"]

    ticket.customer_message_draft = generate_customer_message_draft(
        customer_name=getattr(ticket, "customer_name", None),
        order_id=ticket.order_id,
        item_name=getattr(ticket, "item_name", None),
        claimed_amount=float(ticket.claimed_amount),
        currency=ticket.currency,
        decision_bucket=ticket.decision_bucket,
        reason=ticket.policy_evaluation_reason,
        proof_required=ticket.proof_required
    )

    eligible = bool(tx and verification["status"] == "VERIFIED" and not risk_signals
                   and Decimal(str(tx.amount)) > Decimal(str(tx.refunded_amount))
                   and ticket.decision_bucket == "GENUINE_REFUNDABLE")

    decision = "HUMAN_REVIEW_REQUIRED"
    reason = ticket.policy_evaluation_reason or "Verification or risk check active."
    if eligible:
        decision = "ELIGIBLE_FOR_AUTHORIZED_REFUND_REVIEW"
        reason = "Verified transaction and policy compliant; ready for CS-1 execution or review."
    elif verification["status"] == "ALREADY_REFUNDED":
        decision, reason = "NO_DUPLICATE_REFUND", "Transaction is already fully refunded."

    result = {
        "orchestrator": ORCHESTRATOR["id"], "agents_run": [a["id"] for a in AGENTS[:6]],
        "ticket_id": ticket.id, "classification": {"category":ticket.category,"confidence":float(ticket.confidence),"evidence":classification["evidence"]},
        "transaction_verification": verification["status"], "duplicate_ticket_id":ticket.duplicate_of_id,
        "decision_bucket": ticket.decision_bucket,
        "assigned_desk": ticket.assigned_desk,
        "policy_evaluation_reason": ticket.policy_evaluation_reason,
        "customer_message_draft": ticket.customer_message_draft,
        "proof_required": ticket.proof_required,
        "risk_level":"HIGH" if any(s["severity"]=="HIGH" for s in risk_signals) else ("MEDIUM" if risk_signals else "LOW"),
        "risk_signals":risk_signals, "eligibility_candidate":eligible, "decision":decision,"reason":reason,
        "priority":ticket.priority,"queue":ticket.queue,"executed_refund":False,
        "evaluated_at":datetime.now(timezone.utc).isoformat(),
    }
    db.add(TicketEvent(ticket_id=ticket.id, actor_id=actor_id, event_type="AUTOMATION_PIPELINE_COMPLETED", details=result))
    db.add(AuditLog(actor_id=actor_id, action="AUTOMATION_PIPELINE_COMPLETED", entity_type="ticket", entity_id=ticket.id, details={"decision":decision,"bucket":ticket.decision_bucket,"desk":ticket.assigned_desk,"risk_level":result["risk_level"]}))
    db.flush()
    return result
