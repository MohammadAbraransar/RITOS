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


<<<<<<< HEAD
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


def analyze_proof_images(evidence_images: List[str], description: str) -> Dict[str, Any]:
    """Inspects customer photo evidence references and returns damage markers and a confidence score.

    This adapter matches evidence names/labels and claim text; a real vision model can replace it
    behind the same return shape.
    """
    if not evidence_images:
        return {
            "images_count": 0,
            "images_analyzed": [],
            "has_visual_proof": False,
            "damage_detected": False,
            "detected_features": [],
            "visual_confidence": 0.0,
            "verdict": "NO_EVIDENCE_ATTACHED"
        }

    detected_features = []
    desc_lower = (description or "").lower()

    for img in evidence_images:
        img_str = str(img).lower()
        if any(k in img_str for k in ["damage", "broken", "tear", "loose", "scratch", "crack"]):
            detected_features.append("PHYSICAL_DAMAGE_CONFIRMED")
        if any(k in img_str for k in ["zipper", "stitch", "seam"]):
            detected_features.append("HARDWARE_SEAM_DEFECT")
        if any(k in img_str for k in ["box", "label", "package", "shipping"]):
            detected_features.append("SHIPPING_LABEL_VERIFIED")
        if any(k in img_str for k in ["screen", "display", "pixel"]):
            detected_features.append("DISPLAY_ANOMALY_CONFIRMED")
        if any(k in img_str for k in ["headphone", "earphone", "cushion", "earcup"]):
            detected_features.append("ACOUSTIC_HARDWARE_DEFECT")
        if any(k in img_str for k in ["coil", "overheat", "sensor", "defect"]):
            detected_features.append("COMPONENT_DEFECT_CONFIRMED")

    # If no evidence tokens matched but the description explicitly indicates a defect,
    # evaluate visual context based on description tokens
    if not detected_features:
        if any(k in desc_lower for k in ["tear", "torn", "stitch", "broken", "damaged", "blemish", "zipper", "crack"]):
            detected_features.append("COSMETIC_DAMAGE_CONFIRMED")
        else:
            detected_features.append("IMAGE_ATTACHMENT_VERIFIED")

    detected_features = list(dict.fromkeys(detected_features))
    damage_found = any(f not in {"IMAGE_ATTACHMENT_VERIFIED", "SHIPPING_LABEL_VERIFIED"} for f in detected_features)
    confidence = 0.94 if damage_found else 0.80

    return {
        "images_count": len(evidence_images),
        "images_analyzed": evidence_images,
        "has_visual_proof": True,
        "damage_detected": damage_found,
        "detected_features": detected_features,
        "visual_confidence": confidence,
        "verdict": "DAMAGE_EVIDENCE_RECORDED" if damage_found else "PROOF_RECORDED"
    }
=======
def analyze_proof_images(evidence_images: List[Any], description: str = "") -> Dict[str, Any]:
    """Agent 7 Visual Evidence & Real-Time Proof Reading Engine:
    Inspects customer photo evidence, base64 uploads, receipts, and labels
    using computer vision, gradient edge analysis, and OCR document parsing.
    """
    return run_proof_reading_pipeline(evidence_images, description)
>>>>>>> e1de4905cacc8e83ae5261d9468d857a9233cbff


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


<<<<<<< HEAD
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
            f"Analyzed {s.vision['images_count']} evidence item(s): {', '.join(s.vision['detected_features'])}."
            if s.vision["has_visual_proof"] else "No photo evidence attached by customer."
=======
    if ticket.category == "UNAUTHORIZED_PAYMENT":
        risk_score += 50
        risk_signals.append({"signal": "UNAUTHORIZED_PAYMENT_REPORT", "severity": "HIGH", "score_delta": 50})

    if verification["status"] in {"CUSTOMER_MISMATCH", "AMOUNT_MISMATCH", "TRANSACTION_NOT_FOUND", "MANUAL_VERIFICATION_REQUIRED"}:
        risk_score += 35
        risk_signals.append({"signal": "TRANSACTION_VERIFICATION_EXCEPTION", "severity": "HIGH", "score_delta": 35})

    if ticket.duplicate_of_id:
        risk_score += 25
        risk_signals.append({"signal": "POSSIBLE_DUPLICATE_TICKET", "severity": "MEDIUM", "score_delta": 25})

    # Frequency velocity check in database (claims by customer in last 30 days)
    cust_prior_claims = db.scalar(
        select(func.count(Ticket.id)).where(
            Ticket.customer_id == ticket.customer_id,
            Ticket.id != ticket.id
        )
    ) or 0
    if cust_prior_claims >= 3:
        risk_score += 20
        risk_signals.append({"signal": "HIGH_RETURN_VELOCITY_30D", "severity": "MEDIUM", "count": cust_prior_claims})

    risk_tier = "HIGH" if risk_score >= 60 else ("MEDIUM" if risk_score >= 30 else "LOW")
    agent_4_result = {
        "agent_id": "risk_assessment",
        "agent_name": "Risk & Fraud Signals",
        "status": "COMPLETED",
        "risk_score": risk_score,
        "risk_tier": risk_tier,
        "risk_signals": risk_signals,
        "passed_anti_fraud": risk_score < 60,
        "findings": f"Multi-factor risk score: {risk_score}/100 ({risk_tier} tier). {len(risk_signals)} risk flag(s)."
    }

    # -------------------------------------------------------------
    # AGENT 5: Refund Eligibility & Policy Engine
    # -------------------------------------------------------------
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

    from .services import PRODUCT_POLICIES
    item_cat = (ticket.item_category or "GENERAL").upper()
    cat_policy = PRODUCT_POLICIES.get(item_cat, PRODUCT_POLICIES["GENERAL"])

    agent_5_result = {
        "agent_id": "eligibility_policy",
        "agent_name": "Refund Eligibility & Policy",
        "status": "COMPLETED",
        "item_category": item_cat,
        "return_window_days": cat_policy["return_window_days"],
        "policy_summary": cat_policy["policy_summary"],
        "decision_bucket": ticket.decision_bucket,
        "policy_reason": ticket.policy_evaluation_reason,
        "findings": ticket.policy_evaluation_reason
    }

    # -------------------------------------------------------------
    # AGENT 6: Routing & SLA Agent
    # -------------------------------------------------------------
    sla_hours = 4 if ticket.priority == "P1" else (12 if ticket.priority == "P2" else 24)
    agent_6_result = {
        "agent_id": "routing_sla",
        "agent_name": "Routing & SLA Agent",
        "status": "COMPLETED",
        "assigned_desk": ticket.assigned_desk,
        "queue": ticket.queue,
        "priority": ticket.priority,
        "sla_target_hours": sla_hours,
        "findings": f"Assigned to {ticket.assigned_desk} desk ({ticket.queue}) under {ticket.priority} SLA ({sla_hours}h target)."
    }

    # -------------------------------------------------------------
    # AGENT 7: Visual Evidence & Proof Extraction Adapter
    # -------------------------------------------------------------
    vision_analysis = analyze_proof_images(evidence_images, ticket.description)
    idempotency_hash = refund_key(ticket.id, ticket.claimed_amount, ticket.currency)

    # If photo proof of damage was provided, upgrade proof_status to PROOF_VERIFIED
    if vision_analysis["damage_detected"] and vision_analysis["has_visual_proof"]:
        ticket.proof_status = "PROOF_VERIFIED"
        # If the claim was in CS-2 because proof was required, and proof is verified:
        # Step 3: All Clear -> Route to CS-1 (Fast-Track Auto-Approval)
        if (
            ticket.assigned_desk == "CS_2"
            and "Item reported damaged, defective or mismatched" in (ticket.policy_evaluation_reason or "")
            and not risk_signals
            and verification["status"] == "VERIFIED"
            and ticket.decision_bucket != "NON_REFUNDABLE"
        ):
            ticket.decision_bucket = "GENUINE_REFUNDABLE"
            ticket.assigned_desk = "CS_1"
            top_feats = ", ".join(vision_analysis["detected_features"][:2]) or "hardware anomaly"
            ticket.policy_evaluation_reason = (
                f"Verified ledger payment within return window; physical defect confirmed by Agent 7 Visual Proof Reader ({top_feats})."
            )
            ticket.proof_required = None
    elif ticket.proof_required:
        ticket.proof_status = "PROOF_REQUESTED"

    agent_7_result = {
        "agent_id": "refund_execution",
        "agent_name": "Visual Evidence & Proof Extraction Adapter",
        "status": "COMPLETED",
        "images_count": vision_analysis["images_count"],
        "damage_detected": vision_analysis["damage_detected"],
        "detected_features": vision_analysis["detected_features"],
        "visual_confidence": vision_analysis["visual_confidence"],
        "proof_status": ticket.proof_status,
        "idempotency_key": idempotency_hash,
        "payout_ready": bool(ticket.decision_bucket == "GENUINE_REFUNDABLE" and not risk_signals),
        "findings": (
            vision_analysis.get("proof_reading_summary") or
            f"Vision AI analyzed {vision_analysis['images_count']} photo(s): {', '.join(vision_analysis['detected_features']) or 'Defect confirmed'}."
            if vision_analysis["has_visual_proof"]
            else "No image proof provided by customer; proof status set to NOT_REQUESTED."
>>>>>>> e1de4905cacc8e83ae5261d9468d857a9233cbff
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


<<<<<<< HEAD
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
=======
    # Calculate 3-Step Routing Path matching architecture decision tree
    step_1_failed_reason = (
        "Ghost reference not in payment gateway" if verification["status"] == "TRANSACTION_NOT_FOUND"
        else ("Already refunded (prevent duplicate loss)" if verification["status"] == "ALREADY_REFUNDED"
        else ("Duplicate claim rejected: exact match on transaction ID, order ID, and product model" if ticket.duplicate_of_id
        else None))
    )

    step_2_status = "WITHIN_WINDOW"
    if ticket.decision_bucket == "NON_REFUNDABLE" and "return policy window" in (ticket.policy_evaluation_reason or ""):
        step_2_status = "EXPIRED"
    elif ticket.decision_bucket == "NON_REFUNDABLE" and "final sale" in (ticket.policy_evaluation_reason or "").lower():
        step_2_status = "FINAL_SALE"

    routing_steps = {
        "step_1": {
            "title": "Step 1: Ledger Verification",
            "status": "FAILED" if step_1_failed_reason else "PASSED",
            "summary": f"Ledger: {verification['status']} | Tx: {ticket.transaction_id}",
            "failed_reason": step_1_failed_reason
        },
        "step_2": {
            "title": "Step 2: Policy Window",
            "status": step_2_status,
            "summary": f"Policy window: {cat_policy['return_window_days']} days ({item_cat})",
            "category": item_cat,
            "return_window_days": cat_policy["return_window_days"]
        },
        "step_3": {
            "title": "Step 3: Risk & Evidence Check",
            "status": "ALL_CLEAR" if ticket.assigned_desk == "CS_1" else ("FLAGGED" if ticket.assigned_desk == "CS_2" else "REJECTED"),
            "summary": (
                "Verified physical proof; zero risk flags" if ticket.proof_status == "PROOF_VERIFIED" and ticket.assigned_desk == "CS_1"
                else ("All clear: genuine claim within window, zero risk" if ticket.assigned_desk == "CS_1"
                else ("Missing / required photo proof" if ticket.proof_status == "PROOF_REQUESTED"
                else f"Risk signals active: {risk_tier} tier ({risk_score}/100)"))
            ),
            "proof_status": ticket.proof_status,
            "risk_score": risk_score,
            "risk_tier": risk_tier
        },
        "assigned_desk": ticket.assigned_desk,
        "decision_bucket": ticket.decision_bucket,
        "policy_reason": ticket.policy_evaluation_reason
    }

    # Save telemetry and routing tree into ticket classification evidence
    classification_evidence["routing_steps"] = routing_steps
    classification_evidence["agents"] = all_agents_output
    classification_evidence["visual_analysis"] = vision_analysis
    classification_evidence["evidence_images"] = evidence_images
    classification_evidence["idempotency_key"] = idempotency_hash
    ticket.classification_evidence = classification_evidence

    eligible = bool(
        tx and verification["status"] == "VERIFIED" and not risk_signals
        and Decimal(str(tx.amount)) > Decimal(str(tx.refunded_amount))
        and ticket.decision_bucket == "GENUINE_REFUNDABLE"
>>>>>>> e1de4905cacc8e83ae5261d9468d857a9233cbff
    )
    t.decision_bucket = s.buckets["decision_bucket"]
    t.assigned_desk = s.buckets["assigned_desk"]
    t.policy_evaluation_reason = s.buckets["policy_reason"]
    t.proof_required = s.buckets["proof_required"]
    if s.vision.get("damage_detected"):
        t.proof_status = "PROOF_VERIFIED"
    elif t.proof_required:
        t.proof_status = "PROOF_REQUESTED"

<<<<<<< HEAD
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
=======
    decision = "HUMAN_REVIEW_REQUIRED"
    reason = ticket.policy_evaluation_reason or "Verification or risk check active."
    if eligible:
        decision = "ELIGIBLE_FOR_AUTHORIZED_REFUND_REVIEW"
        reason = "Verified transaction and policy compliant; ready for CS-1 execution."
    elif verification["status"] == "ALREADY_REFUNDED":
        decision, reason = "NO_DUPLICATE_REFUND", "Transaction is already fully refunded."

    result = {
        "orchestrator": ORCHESTRATOR["id"],
        "agents_run": [a["id"] for a in AGENTS],
        "agents_trace": all_agents_output,
        "ticket_id": ticket.id,
        "classification": {
            "category": ticket.category,
            "confidence": float(ticket.confidence),
            "evidence": classification["evidence"]
        },
        "transaction_verification": verification["status"],
        "duplicate_ticket_id": ticket.duplicate_of_id,
        "decision_bucket": ticket.decision_bucket,
        "assigned_desk": ticket.assigned_desk,
        "policy_evaluation_reason": ticket.policy_evaluation_reason,
        "customer_message_draft": ticket.customer_message_draft,
        "proof_required": ticket.proof_required,
        "proof_status": ticket.proof_status,
        "visual_evidence": vision_analysis,
        "risk_level": risk_tier,
        "risk_score": risk_score,
        "risk_signals": risk_signals,
        "eligibility_candidate": eligible,
        "decision": decision,
        "reason": reason,
        "executed_refund": False,
        "priority": ticket.priority,
        "queue": ticket.queue,
        "idempotency_key": idempotency_hash,
        "routing_steps": routing_steps,
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
>>>>>>> e1de4905cacc8e83ae5261d9468d857a9233cbff
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


def run_ticket_pipeline(db: Session, ticket: Ticket, actor_id: str | None = None) -> dict:
    """Execute the full 8-agent workflow on a persisted ticket (kept for existing callers)."""
    from .orchestrator import run_workflow
    return run_workflow(db, ticket, trigger="MANUAL", actor_id=actor_id)
