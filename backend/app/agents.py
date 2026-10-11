"""RITOS's deterministic-first automation agents and central orchestrator.

Financial facts come from the database/provider adapter and policy rules. Optional
LLM providers may enrich text understanding but never authorize money movement.
"""
from __future__ import annotations
from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import select
from .models import Ticket, Transaction, TicketEvent, AuditLog, TicketStatus
from .services import classify, calculate_priority, find_duplicate, verify_transaction, ROUTES

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

    active = [TicketStatus.NEW.value, TicketStatus.TRIAGED.value, TicketStatus.IN_REVIEW.value,
              TicketStatus.AWAITING_INFORMATION.value, TicketStatus.ESCALATED.value, TicketStatus.REOPENED.value]
    duplicate = db.scalar(select(Ticket).where(
        Ticket.id != ticket.id, Ticket.customer_id == ticket.customer_id,
        Ticket.transaction_id == ticket.transaction_id,
        Ticket.status.in_(active)).order_by(Ticket.created_at.desc()))
    if duplicate and not ticket.duplicate_of_id:
        ticket.duplicate_of_id = duplicate.id

    risk_signals = []
    if ticket.category == "UNAUTHORIZED_PAYMENT":
        risk_signals.append({"signal":"UNAUTHORIZED_PAYMENT_REPORT","severity":"HIGH"})
    if verification["status"] in {"CUSTOMER_MISMATCH", "AMOUNT_MISMATCH", "TRANSACTION_NOT_FOUND", "MANUAL_VERIFICATION_REQUIRED"}:
        risk_signals.append({"signal":"TRANSACTION_VERIFICATION_EXCEPTION","severity":"HIGH"})
    if ticket.duplicate_of_id:
        risk_signals.append({"signal":"POSSIBLE_DUPLICATE_TICKET","severity":"MEDIUM"})

    # Policy engine is intentionally conservative: only marks eligible for consideration;
    # it never issues an approval. Payment execution remains behind the approval endpoint.
    tx = verification["transaction"]
    eligible = bool(tx and verification["status"] == "VERIFIED" and not risk_signals
                   and Decimal(str(tx.amount)) > Decimal(str(tx.refunded_amount)))
    decision = "HUMAN_REVIEW_REQUIRED"
    reason = "Trusted evidence is incomplete, a risk signal exists, or policy approval is required."
    if eligible:
        decision = "ELIGIBLE_FOR_AUTHORIZED_REFUND_REVIEW"
        reason = "Verified transaction and no current risk flags; required authorization still applies."
    elif verification["status"] == "ALREADY_REFUNDED":
        decision, reason = "NO_DUPLICATE_REFUND", "Transaction is already fully refunded."

    result = {
        "orchestrator": ORCHESTRATOR["id"], "agents_run": [a["id"] for a in AGENTS[:6]],
        "ticket_id": ticket.id, "classification": {"category":ticket.category,"confidence":float(ticket.confidence),"evidence":classification["evidence"]},
        "transaction_verification": verification["status"], "duplicate_ticket_id":ticket.duplicate_of_id,
        "risk_level":"HIGH" if any(s["severity"]=="HIGH" for s in risk_signals) else ("MEDIUM" if risk_signals else "LOW"),
        "risk_signals":risk_signals, "eligibility_candidate":eligible, "decision":decision,"reason":reason,
        "priority":ticket.priority,"queue":ticket.queue,"executed_refund":False,
        "evaluated_at":datetime.now(timezone.utc).isoformat(),
    }
    db.add(TicketEvent(ticket_id=ticket.id, actor_id=actor_id, event_type="AUTOMATION_PIPELINE_COMPLETED", details=result))
    db.add(AuditLog(actor_id=actor_id, action="AUTOMATION_PIPELINE_COMPLETED", entity_type="ticket", entity_id=ticket.id, details={"decision":decision,"risk_level":result["risk_level"],"verification":verification["status"]}))
    db.flush()
    return result
