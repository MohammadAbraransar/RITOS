"""RITOS's deterministic-first specialist agents.

Each agent is a step function that reads and updates a shared PipelineState and returns its
trace record. Financial facts come from the ledger/store context and policy rules; the
orchestrator (orchestrator.py) runs the agents in order, persists every step, and applies the
decision gate. Classifier confidence and risk flags are advisory only.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Callable, Dict, List
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from .models import Ticket, Transaction, TicketStatus
from .services import (
    classify, calculate_priority, verify_transaction, ROUTES,
    evaluate_three_buckets, generate_customer_message_draft, refund_key, policy_for
)
from .proof_reader import run_proof_reading_pipeline

AGENTS = [
    {
        "id": "transaction_data_fetcher",
        "name": "Transaction Data Fetcher",
        "mode": "deterministic",
        "purpose": "Fetch and validate trusted transaction/order/refund facts from financial ledger."
    },
    {
        "id": "duplicate_intelligence",
        "name": "Duplicate Intelligence",
        "mode": "rules+composite-matching",
        "purpose": "Detect repeated claims for identical product model in the same transaction."
    },
    {
        "id": "issue_classifier",
        "name": "Issue Classification",
        "mode": "rules+NLP",
        "purpose": "Classify customer complaint into standardized operational categories with confidence."
    },
    {
        "id": "visual_evidence",
        "name": "Visual Evidence & Proof Extraction Adapter",
        "mode": "evidence-rules+provider-adapter",
        "purpose": "Inspect attached photo evidence, record damage markers, and generate the refund idempotency hash."
    },
    {
        "id": "risk_assessment",
        "name": "Risk & Fraud Signals",
        "mode": "multi-factor-scoring",
        "purpose": "Evaluate velocity, transaction consistency, and claim anomalies."
    },
    {
        "id": "eligibility_policy",
        "name": "Refund Eligibility & Policy",
        "mode": "deterministic-policy",
        "purpose": "Evaluate the store's return policy, window and evidence rules for the claimed item."
    },
    {
        "id": "routing_sla",
        "name": "Routing & SLA Agent",
        "mode": "deterministic-rules",
        "purpose": "Route tickets to CS-1 (Auto), CS-2 (Exception/Proof), or CS-3 (Denial)."
    },
    {
        "id": "reconciliation_communication",
        "name": "Reconciliation & Communication",
        "mode": "templates+events",
        "purpose": "Auto-draft customer resolution notices and synchronize live timeline updates."
    },
]

ORCHESTRATOR = {
    "id": "central_orchestrator",
    "name": "Central Workflow Orchestrator",
    "purpose": "Coordinate 8 agents, persist each step, apply the decision gate, and pause for human-in-the-loop exceptions."
}


@dataclass
class PipelineState:
    db: Session
    ticket: Ticket
    actor_id: str | None = None
    evidence: Dict[str, Any] = field(default_factory=dict)
    verification: Dict[str, Any] = field(default_factory=dict)
    tx: Transaction | None = None
    duplicate: Ticket | None = None
    classification: Dict[str, Any] = field(default_factory=dict)
    vision: Dict[str, Any] = field(default_factory=dict)
    risk: Dict[str, Any] = field(default_factory=dict)
    buckets: Dict[str, Any] = field(default_factory=dict)
    idempotency_key: str = ""

    @property
    def store_facts(self) -> Dict[str, Any]:
        return self.evidence.get("store_facts") or {}


def analyze_proof_images(evidence_images: List[Any], description: str = "") -> Dict[str, Any]:
    """Visual Evidence & Real-Time Proof Reading Engine (proof_reader.py): inspects photo evidence,
    base64 uploads, receipts and labels with image statistics, edge analysis and document parsing."""
    return run_proof_reading_pipeline(evidence_images, description)


# ---------------------------------------------------------------------------
# AGENT 1: Transaction Data Fetcher
# ---------------------------------------------------------------------------
def transaction_data_fetcher(s: PipelineState) -> dict:
    t = s.ticket
    s.verification = verify_transaction(s.db, t.transaction_id, t.customer_id, t.claimed_amount, t.currency)
    t.payment_verification = s.verification["status"]
    s.tx = s.verification["transaction"]
    if s.tx:
        t.refund_status = s.tx.payment_status
    tx_amt = float(s.tx.amount) if s.tx else 0.0
    return {
        "verification_status": s.verification["status"],
        "transaction_id": t.transaction_id,
        "claimed_amount": float(t.claimed_amount),
        "ledger_amount": tx_amt,
        "currency": t.currency,
        "payment_status": s.tx.payment_status if s.tx else "NOT_FOUND",
        "provider_ref": s.tx.provider_reference if s.tx else None,
        "findings": f"Ledger verification result: {s.verification['status']} (Amount: {t.currency} {tx_amt:.2f})"
    }


# ---------------------------------------------------------------------------
# AGENT 2: Duplicate Intelligence (strict 3-point composite check)
# A claim is ONLY a duplicate if transaction_id, order_id and item_name all match.
# ---------------------------------------------------------------------------
def duplicate_intelligence(s: PipelineState) -> dict:
    t = s.ticket
    prior_statuses = [
        TicketStatus.NEW.value, TicketStatus.TRIAGED.value, TicketStatus.IN_REVIEW.value,
        TicketStatus.AWAITING_INFORMATION.value, TicketStatus.ESCALATED.value,
        TicketStatus.REOPENED.value, TicketStatus.RESOLVED.value
    ]
    conditions = [
        Ticket.id != t.id,
        Ticket.transaction_id == t.transaction_id,
        Ticket.status.in_(prior_statuses),
        Ticket.created_at <= t.created_at,
    ]
    if t.order_id and t.order_id.strip():
        conditions.append(Ticket.order_id == t.order_id.strip())
    if t.item_name and t.item_name.strip():
        conditions.append(func.lower(func.trim(Ticket.item_name)) == t.item_name.strip().lower())

    s.duplicate = s.db.scalar(select(Ticket).where(*conditions).order_by(Ticket.created_at.desc()))
    t.duplicate_of_id = s.duplicate.id if s.duplicate else None
    return {
        "is_duplicate": bool(s.duplicate),
        "duplicate_of_id": s.duplicate.id if s.duplicate else None,
        "composite_match_key": f"{t.order_id or t.transaction_id}::{t.item_name}",
        "findings": (
            f"Flagged duplicate claim: matches existing ticket #{s.duplicate.ticket_number} for same product model."
            if s.duplicate else "Verified unique claim: no prior active claim exists for this order + product item."
        )
    }


# ---------------------------------------------------------------------------
# AGENT 3: Issue Classification
# ---------------------------------------------------------------------------
def issue_classifier(s: PipelineState) -> dict:
    t = s.ticket
    classification = classify(t.description)
    if t.category == "UNAUTHORIZED_PAYMENT" and classification["category"] != "UNAUTHORIZED_PAYMENT":
        classification["category"] = "UNAUTHORIZED_PAYMENT"
        classification["confidence"] = max(classification["confidence"], float(t.confidence or 0))
        classification["evidence"] = ["Existing security-sensitive category retained"]
    s.classification = classification

    t.category = classification["category"]
    t.confidence = classification["confidence"]
    t.recommended_action = classification["recommended_action"]
    t.priority = calculate_priority(t.category, t.description)
    t.queue = ROUTES.get(t.category, "Manual Triage")

    desc_lower = (t.description or "").lower()
    sentiment = "NEGATIVE" if any(w in desc_lower for w in ["bad", "terrible", "awful", "scam", "defect", "broken", "unusable"]) else "NEUTRAL"
    return {
        "category": t.category,
        "confidence": float(t.confidence),
        "sentiment": sentiment,
        "matched_tokens": classification["evidence"],
        "recommended_action": t.recommended_action,
        "findings": f"Classified issue as {t.category} ({float(t.confidence)*100:.1f}% confidence)."
    }


# ---------------------------------------------------------------------------
# AGENT 4: Visual Evidence & Proof Extraction (runs before policy so proof can satisfy it)
# ---------------------------------------------------------------------------
def visual_evidence(s: PipelineState) -> dict:
    t = s.ticket
    images = list(s.evidence.get("evidence_images") or [])
    s.vision = analyze_proof_images(images, t.description)
    s.idempotency_key = refund_key(t.id, t.claimed_amount, t.currency)
    return {
        "images_count": s.vision["images_count"],
        "damage_detected": s.vision["damage_detected"],
        "detected_features": s.vision["detected_features"],
        "visual_confidence": s.vision["visual_confidence"],
        "idempotency_key": s.idempotency_key,
        "findings": (
            s.vision.get("proof_reading_summary")
            or f"Analyzed {s.vision['images_count']} evidence item(s): {', '.join(s.vision['detected_features'])}."
            if s.vision["has_visual_proof"] else "No photo evidence attached by customer."
        )
    }


# ---------------------------------------------------------------------------
# AGENT 5: Risk & Fraud Signals
# ---------------------------------------------------------------------------
def risk_assessment(s: PipelineState) -> dict:
    t = s.ticket
    score = 10
    signals = []

    if t.category == "UNAUTHORIZED_PAYMENT":
        score += 50
        signals.append({"signal": "UNAUTHORIZED_PAYMENT_REPORT", "severity": "HIGH", "score_delta": 50})
    if s.verification["status"] in {"CUSTOMER_MISMATCH", "AMOUNT_MISMATCH", "TRANSACTION_NOT_FOUND", "MANUAL_VERIFICATION_REQUIRED"}:
        score += 35
        signals.append({"signal": "TRANSACTION_VERIFICATION_EXCEPTION", "severity": "HIGH", "score_delta": 35})
    if t.duplicate_of_id:
        score += 25
        signals.append({"signal": "POSSIBLE_DUPLICATE_TICKET", "severity": "MEDIUM", "score_delta": 25})

    # Velocity: the store's own 30-day count when available, else RITOS's ticket history for 30 days.
    store_count = s.store_facts.get("refund_tickets_30d")
    if store_count is not None:
        prior_claims = max(0, int(store_count) - 1)
    else:
        since = datetime.now(timezone.utc) - timedelta(days=30)
        prior_claims = s.db.scalar(select(func.count(Ticket.id)).where(
            Ticket.customer_id == t.customer_id, Ticket.id != t.id, Ticket.created_at >= since
        )) or 0
    if prior_claims >= 3:
        score += 20
        signals.append({"signal": "HIGH_RETURN_VELOCITY_30D", "severity": "MEDIUM", "score_delta": 20, "count": prior_claims})

    account_age = s.store_facts.get("account_age_days")
    if account_age is not None and int(account_age) < 7:
        score += 15
        signals.append({"signal": "NEW_ACCOUNT", "severity": "LOW", "score_delta": 15, "account_age_days": account_age})

    tier = "HIGH" if score >= 60 else ("MEDIUM" if score >= 30 else "LOW")
    s.risk = {"score": score, "tier": tier, "signals": signals}
    return {
        "risk_score": score,
        "risk_tier": tier,
        "risk_signals": signals,
        "passed_anti_fraud": score < 60,
        "findings": f"Multi-factor risk score: {score}/100 ({tier} tier). {len(signals)} risk flag(s)."
    }


# ---------------------------------------------------------------------------
# AGENT 6: Refund Eligibility & Policy Engine
# ---------------------------------------------------------------------------
def eligibility_policy(s: PipelineState) -> dict:
    t = s.ticket
    s.buckets = evaluate_three_buckets(
        verification_status=s.verification["status"],
        category=t.category,
        description=t.description,
        item_category=t.item_category or "GENERAL",
        purchase_date=t.purchase_date,
        duplicate_ticket_id=t.duplicate_of_id,
        claimed_amount=float(t.claimed_amount),
        tx_amount=float(s.tx.amount) if s.tx else 0.0,
        store_facts=s.store_facts or None,
        proof_verified=bool(s.vision.get("damage_detected")),
    )
    t.decision_bucket = s.buckets["decision_bucket"]
    t.assigned_desk = s.buckets["assigned_desk"]
    t.policy_evaluation_reason = s.buckets["policy_reason"]
    t.proof_required = s.buckets["proof_required"]
    if s.vision.get("damage_detected"):
        t.proof_status = "PROOF_VERIFIED"
    elif t.proof_required:
        t.proof_status = "PROOF_REQUESTED"

    policy = policy_for(t.item_category, s.store_facts or None)
    return {
        "item_category": (t.item_category or "GENERAL").upper(),
        "policy_source": policy["source"],
        "return_window_days": policy["return_window_days"],
        "policy_summary": policy["policy_summary"],
        "decision_bucket": t.decision_bucket,
        "proof_status": t.proof_status,
        "policy_reason": t.policy_evaluation_reason,
        "findings": t.policy_evaluation_reason
    }


# ---------------------------------------------------------------------------
# AGENT 7: Routing & SLA
# ---------------------------------------------------------------------------
def routing_sla(s: PipelineState) -> dict:
    t = s.ticket
    sla_hours = 4 if t.priority == "P1" else (12 if t.priority == "P2" else 24)
    return {
        "assigned_desk": t.assigned_desk,
        "queue": t.queue,
        "priority": t.priority,
        "sla_target_hours": sla_hours,
        "findings": f"Assigned to {t.assigned_desk} desk ({t.queue}) under {t.priority} SLA ({sla_hours}h target)."
    }


# ---------------------------------------------------------------------------
# AGENT 8: Reconciliation & Customer Communication
# ---------------------------------------------------------------------------
def reconciliation_communication(s: PipelineState) -> dict:
    t = s.ticket
    t.customer_message_draft = generate_customer_message_draft(
        customer_name=t.customer_name,
        order_id=t.order_id,
        item_name=t.item_name,
        claimed_amount=float(t.claimed_amount),
        currency=t.currency,
        decision_bucket=t.decision_bucket,
        reason=t.policy_evaluation_reason,
        proof_required=t.proof_required
    )
    return {
        "customer_message_draft": t.customer_message_draft,
        "findings": "Generated personalized customer communication draft."
    }


STEP_FUNCTIONS: Dict[str, Callable[[PipelineState], dict]] = {
    "transaction_data_fetcher": transaction_data_fetcher,
    "duplicate_intelligence": duplicate_intelligence,
    "issue_classifier": issue_classifier,
    "visual_evidence": visual_evidence,
    "risk_assessment": risk_assessment,
    "eligibility_policy": eligibility_policy,
    "routing_sla": routing_sla,
    "reconciliation_communication": reconciliation_communication,
}


def is_eligible(s: PipelineState) -> bool:
    return bool(
        s.tx and s.verification.get("status") == "VERIFIED" and not s.risk.get("signals")
        and Decimal(str(s.tx.amount)) > Decimal(str(s.tx.refunded_amount))
        and s.ticket.decision_bucket == "GENUINE_REFUNDABLE"
    )


def build_routing_steps(s: PipelineState) -> dict:
    """3-step routing decision tree shown in the desk UI flowchart (ledger -> policy window -> risk & evidence)."""
    t = s.ticket
    status = s.verification.get("status")
    step_1_failed = (
        "Ghost reference not in payment gateway" if status == "TRANSACTION_NOT_FOUND"
        else "Already refunded (prevent duplicate loss)" if status == "ALREADY_REFUNDED"
        else "Duplicate claim rejected: exact match on transaction ID, order ID, and product model" if t.duplicate_of_id
        else None
    )
    reason = t.policy_evaluation_reason or ""
    step_2 = "WITHIN_WINDOW"
    if t.decision_bucket == "NON_REFUNDABLE" and "return policy window" in reason:
        step_2 = "EXPIRED"
    elif t.decision_bucket == "NON_REFUNDABLE" and "final sale" in reason.lower():
        step_2 = "FINAL_SALE"
    policy = policy_for(t.item_category, s.store_facts or None)
    risk = s.risk or {"tier": "UNKNOWN", "score": None}
    if t.proof_status == "PROOF_VERIFIED" and t.assigned_desk == "CS_1":
        step_3_summary = "Verified physical proof; zero risk flags"
    elif t.assigned_desk == "CS_1":
        step_3_summary = "All clear: genuine claim within window, zero risk"
    elif t.proof_status == "PROOF_REQUESTED":
        step_3_summary = "Missing / required photo proof"
    else:
        step_3_summary = f"Risk signals active: {risk['tier']} tier ({risk['score']}/100)"
    return {
        "step_1": {"title": "Step 1: Ledger Verification", "status": "FAILED" if step_1_failed else "PASSED",
                   "summary": f"Ledger: {status} | Tx: {t.transaction_id}", "failed_reason": step_1_failed},
        "step_2": {"title": "Step 2: Policy Window", "status": step_2,
                   "summary": f"Policy window: {policy['return_window_days']} days ({(t.item_category or 'GENERAL').upper()})",
                   "category": (t.item_category or "GENERAL").upper(), "return_window_days": policy["return_window_days"]},
        "step_3": {"title": "Step 3: Risk & Evidence Check",
                   "status": "ALL_CLEAR" if t.assigned_desk == "CS_1" else ("FLAGGED" if t.assigned_desk == "CS_2" else "REJECTED"),
                   "summary": step_3_summary, "proof_status": t.proof_status,
                   "risk_score": risk["score"], "risk_tier": risk["tier"]},
        "assigned_desk": t.assigned_desk,
        "decision_bucket": t.decision_bucket,
        "policy_reason": t.policy_evaluation_reason,
    }


def run_ticket_pipeline(db: Session, ticket: Ticket, actor_id: str | None = None) -> dict:
    """Execute the full 8-agent workflow on a persisted ticket (kept for existing callers)."""
    from .orchestrator import run_workflow
    return run_workflow(db, ticket, trigger="MANUAL", actor_id=actor_id)
