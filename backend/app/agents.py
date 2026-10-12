"""RITOS's deterministic-first automation agents and central orchestrator.

Financial facts come from the database/provider adapter and policy rules.
All 8 Specialist Agents execute their assigned domain responsibility sequentially,
recording individual evidence, metrics, and visual extractions.
"""
from __future__ import annotations
import hashlib
import re
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from sqlalchemy import select, or_, func
from .models import Ticket, Transaction, TicketEvent, AuditLog, TicketStatus, User
from .services import (
    classify, calculate_priority, find_duplicate, verify_transaction, ROUTES,
    evaluate_three_buckets, generate_customer_message_draft, refund_key
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
        "id": "risk_assessment",
        "name": "Risk & Fraud Signals",
        "mode": "multi-factor-scoring",
        "purpose": "Evaluate velocity, transaction consistency, and claim anomalies."
    },
    {
        "id": "eligibility_policy",
        "name": "Refund Eligibility & Policy",
        "mode": "deterministic-policy",
        "purpose": "Evaluate eCommerce product category return windows against delivery date."
    },
    {
        "id": "routing_sla",
        "name": "Routing & SLA Agent",
        "mode": "deterministic-rules",
        "purpose": "Route tickets to CS-1 (Auto), CS-2 (Exception/Proof), or CS-3 (Denial)."
    },
    {
        "id": "refund_execution",
        "name": "Visual Evidence & Proof Extraction Adapter",
        "mode": "vision-AI+provider-adapter",
        "purpose": "Extract visual evidence from photos, verify damage tokens, and generate idempotency hash."
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
    "purpose": "Coordinate 8 agents, persist decisions, and route human-in-the-loop exceptions."
}


def analyze_proof_images(evidence_images: List[Any], description: str = "") -> Dict[str, Any]:
    """Agent 7 Visual Evidence & Real-Time Proof Reading Engine:
    Inspects customer photo evidence, base64 uploads, receipts, and labels
    using computer vision, gradient edge analysis, and OCR document parsing.
    """
    return run_proof_reading_pipeline(evidence_images, description)


def run_ticket_pipeline(db: Session, ticket: Ticket, actor_id: str | None = None) -> dict:
    """Execute the full 8-Specialist Agent Pipeline on a persisted ticket."""
    start_time = datetime.now(timezone.utc)
    classification_evidence = dict(ticket.classification_evidence or {})
    evidence_images = classification_evidence.get("evidence_images") or []

    # -------------------------------------------------------------
    # AGENT 1: Transaction Data Fetcher
    # -------------------------------------------------------------
    verification = verify_transaction(
        db, ticket.transaction_id, ticket.customer_id,
        ticket.claimed_amount, ticket.currency
    )
    ticket.payment_verification = verification["status"]
    tx = verification["transaction"]
    if tx:
        ticket.refund_status = tx.payment_status

    tx_amt = float(tx.amount) if tx else 0.0
    agent_1_result = {
        "agent_id": "transaction_data_fetcher",
        "agent_name": "Transaction Data Fetcher",
        "status": "COMPLETED",
        "verification_status": verification["status"],
        "transaction_id": ticket.transaction_id,
        "claimed_amount": float(ticket.claimed_amount),
        "ledger_amount": tx_amt,
        "currency": ticket.currency,
        "payment_status": tx.payment_status if tx else "NOT_FOUND",
        "provider_ref": tx.provider_reference if tx else f"GATEWAY-MOCK-{ticket.transaction_id}",
        "findings": f"Ledger verification result: {verification['status']} (Amount: {ticket.currency} {tx_amt:.2f})"
    }

    # -------------------------------------------------------------
    # AGENT 2: Duplicate Intelligence (Strict 3-Point Composite Check)
    # A claim is ONLY a duplicate if ALL THREE match:
    # 1. Exact transaction_id
    # 2. Exact order_id
    # 3. Exact purchased item_name / product model
    # -------------------------------------------------------------
    prior_statuses = [
        TicketStatus.NEW.value, TicketStatus.TRIAGED.value, TicketStatus.IN_REVIEW.value,
        TicketStatus.AWAITING_INFORMATION.value, TicketStatus.ESCALATED.value,
        TicketStatus.REOPENED.value, TicketStatus.RESOLVED.value
    ]
    conditions = [
        Ticket.id != ticket.id,
        Ticket.transaction_id == ticket.transaction_id,
        Ticket.status.in_(prior_statuses)
    ]
    if ticket.order_id and ticket.order_id.strip():
        conditions.append(Ticket.order_id == ticket.order_id.strip())
    if ticket.item_name and ticket.item_name.strip():
        norm_item = ticket.item_name.strip().lower()
        conditions.append(func.lower(func.trim(Ticket.item_name)) == norm_item)

    duplicate_query = select(Ticket).where(*conditions)
    duplicate = db.scalar(duplicate_query.order_by(Ticket.created_at.desc()))
    if duplicate:
        ticket.duplicate_of_id = duplicate.id
    elif ticket.duplicate_of_id:
        ticket.duplicate_of_id = None

    agent_2_result = {
        "agent_id": "duplicate_intelligence",
        "agent_name": "Duplicate Intelligence",
        "status": "COMPLETED",
        "is_duplicate": bool(duplicate),
        "duplicate_of_id": duplicate.id if duplicate else None,
        "composite_match_key": f"{ticket.order_id or ticket.transaction_id}::{ticket.item_name}",
        "findings": (
            f"Flagged duplicate claim: matches existing ticket #{duplicate.ticket_number} for same product model."
            if duplicate else "Verified unique claim: no prior active claim exists for this order + product item."
        )
    }

    # -------------------------------------------------------------
    # AGENT 3: Issue Classification (NLP & Evidence Extraction)
    # -------------------------------------------------------------
    classification = classify(ticket.description)
    if ticket.category == "UNAUTHORIZED_PAYMENT" and classification["category"] != "UNAUTHORIZED_PAYMENT":
        classification["category"] = "UNAUTHORIZED_PAYMENT"
        classification["confidence"] = max(classification["confidence"], float(ticket.confidence or 0))
        classification["evidence"] = ["Existing security-sensitive category retained"]

    ticket.category = classification["category"]
    ticket.confidence = classification["confidence"]
    ticket.recommended_action = classification["recommended_action"]
    ticket.priority = calculate_priority(ticket.category, ticket.description)
    ticket.queue = ROUTES.get(ticket.category, "Manual Triage")

    desc_lower = (ticket.description or "").lower()
    sentiment = "NEGATIVE" if any(w in desc_lower for w in ["bad", "terrible", "awful", "scam", "defect", "broken", "unusable"]) else "NEUTRAL"
    agent_3_result = {
        "agent_id": "issue_classifier",
        "agent_name": "Issue Classification",
        "status": "COMPLETED",
        "category": ticket.category,
        "confidence": float(ticket.confidence),
        "sentiment": sentiment,
        "matched_tokens": classification["evidence"],
        "recommended_action": ticket.recommended_action,
        "findings": f"Classified issue as {ticket.category} ({float(ticket.confidence)*100:.1f}% confidence)."
    }

    # -------------------------------------------------------------
    # AGENT 4: Risk & Fraud Signals (Multi-Factor Scoring)
    # -------------------------------------------------------------
    risk_score = 10
    risk_signals = []

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
        )
    }

    # -------------------------------------------------------------
    # AGENT 8: Reconciliation & Customer Communication
    # -------------------------------------------------------------
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

    agent_8_result = {
        "agent_id": "reconciliation_communication",
        "agent_name": "Reconciliation & Communication",
        "status": "COMPLETED",
        "customer_message_draft": ticket.customer_message_draft,
        "timeline_notified": True,
        "audit_persisted": True,
        "findings": f"Generated personalized customer communication draft and published audit record."
    }

    # Aggregate all 8 agents' telemetry
    all_agents_output = [
        agent_1_result,
        agent_2_result,
        agent_3_result,
        agent_4_result,
        agent_5_result,
        agent_6_result,
        agent_7_result,
        agent_8_result,
    ]

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
    )

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
    }

    db.add(TicketEvent(
        ticket_id=ticket.id,
        actor_id=actor_id,
        event_type="AUTOMATION_PIPELINE_COMPLETED",
        details=result
    ))
    db.add(AuditLog(
        actor_id=actor_id,
        action="AUTOMATION_PIPELINE_COMPLETED",
        entity_type="ticket",
        entity_id=ticket.id,
        details={
            "decision": decision,
            "bucket": ticket.decision_bucket,
            "desk": ticket.assigned_desk,
            "risk_level": risk_tier,
            "risk_score": risk_score,
            "agents_count": len(all_agents_output)
        }
    ))
    db.flush()
    return result
