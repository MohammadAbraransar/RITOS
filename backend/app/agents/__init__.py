"""RITOS nine-specialist refund adjudication pipeline (tanush.txt section 4).

Execution order follows data dependencies; every step is persisted as a WorkflowStep by orchestrator.py:

  1. Agent 1  Ledger ground truth (+ duplicate-claim check)
  2. Agent 5  Carrier / logistics verification
  3. Agent 3  Claim intent and contradiction analysis      (needs logistics)
  4. Agent 7  Product identity (7A) + defect evidence (7B)  (needs the claim)
  5. Agent 2  Return-policy enforcement                     (needs whether the defect was verified)
  6. Agent 4  Historical risk and velocity
  7. Agent 6  Deterministic decision and desk routing       (the only step that routes)
  8. Agent 9  Human review coordination
  9. Agent 8  Customer communication

Deterministic code owns money, dates, thresholds and routing; the vision provider only contributes recorded
assessments. Same persisted inputs + rule versions => same routing.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Callable, Dict, List
import logging

import httpx
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Ticket, Transaction, TicketStatus, EvidenceLifecycle, Product, ProductReferenceImage
from ..services import classify, calculate_priority, ROUTES, refund_key
from ..proof_reader import run_proof_reading_pipeline, verify_product_identity_and_defect
from .. import evidence_store

from .ledger_agent import verify_ledger_ground_truth
from .logistics_agent import verify_shipment_logistics
from .claim_reason_agent import classify_claim_reason, analyze_contradictions
from .product_identity_agent import summarize_identity
from .defect_verification_agent import summarize_defect
from .policy_agent import get_effective_policy, evaluate_policy_eligibility
from .risk_agent import evaluate_customer_risk
from .decision_agent import DecisionInputs, arbitrate, EVIDENCE_REASONS
from .review_agent import coordinate_review
from .communication_agent import draft_customer_resolution_message, customer_state_for

logger = logging.getLogger("ritos.agents")

AGENTS = [
    {"id": "ledger_ground_truth", "name": "Agent 1 · Ledger Ground Truth", "mode": "deterministic",
     "purpose": "Verify the transaction, customer, currency and refundable balance; detect duplicate claims."},
    {"id": "logistics_verification", "name": "Agent 5 · Carrier & Logistics", "mode": "carrier-adapter",
     "purpose": "Delivery milestones and proof of delivery, labelled by source (carrier or store record)."},
    {"id": "claim_analysis", "name": "Agent 3 · Claim Intent & Contradictions", "mode": "rules",
     "purpose": "Map the claim to the controlled taxonomy and find conflicts with recorded facts."},
    {"id": "evidence_verification", "name": "Agent 7 · Product Identity & Defect Evidence", "mode": "image-quality+vision-provider",
     "purpose": "Check photos show the purchased product (7A) and the claimed defect (7B); never assume either."},
    {"id": "policy_enforcement", "name": "Agent 2 · Return Policy", "mode": "versioned-policy",
     "purpose": "Apply the store or RITOS policy version, window and merchant defect exceptions."},
    {"id": "risk_assessment", "name": "Agent 4 · Risk & Velocity", "mode": "versioned-rules",
     "purpose": "30/90/365-day claim velocity, account age and amount thresholds as review signals."},
    {"id": "decision_arbiter", "name": "Agent 6 · Decision & Routing Arbiter", "mode": "deterministic",
     "purpose": "Route to CS-1 / CS-2 / CS-3 by fixed precedence with machine-readable reason codes."},
    {"id": "review_coordination", "name": "Agent 9 · Human Review Coordinator", "mode": "deterministic",
     "purpose": "Assign a reviewer, SLA, checklist, required evidence and permitted actions."},
    {"id": "customer_communication", "name": "Agent 8 · Customer Communication", "mode": "templates",
     "purpose": "Tell the customer exactly how far the case has progressed."},
]

# Carrier outcomes that confirm a parcel will not arrive
LOSS_STATUSES = {"LOST", "DELIVERY_FAILED", "RETURNED_TO_SENDER"}

ORCHESTRATOR = {
    "id": "central_orchestrator",
    "name": "Central Workflow Orchestrator",
    "purpose": "Run the nine specialists in dependency order, persist each step, apply the arbiter's routing, and pause for humans.",
}


@dataclass
class PipelineState:
    db: Session
    ticket: Ticket
    actor_id: str | None = None
    evidence: Dict[str, Any] = field(default_factory=dict)
    verification: Dict[str, Any] = field(default_factory=dict)  # ledger result (kept name for orchestrator)
    tx: Transaction | None = None
    duplicate: Ticket | None = None
    logistics: Dict[str, Any] = field(default_factory=dict)
    claim: Dict[str, Any] = field(default_factory=dict)
    classification: Dict[str, Any] = field(default_factory=dict)
    vision: Dict[str, Any] = field(default_factory=dict)
    identity: Dict[str, Any] = field(default_factory=dict)
    defect: Dict[str, Any] = field(default_factory=dict)
    policy: Dict[str, Any] = field(default_factory=dict)
    risk: Dict[str, Any] = field(default_factory=dict)
    decision: Dict[str, Any] = field(default_factory=dict)
    review: Dict[str, Any] = field(default_factory=dict)
    evidence_rows: List[Any] = field(default_factory=list)
    idempotency_key: str = ""
    # One clock reading per run: every date rule in the run is evaluated against it, and it is recorded.
    evaluated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def store_facts(self) -> Dict[str, Any]:
        return self.evidence.get("store_facts") or {}


def analyze_proof_images(evidence_images: List[Any], description: str = "") -> Dict[str, Any]:
    """Backward-compatible helper used by older callers."""
    return run_proof_reading_pipeline(evidence_images, description)


# ---------------------------------------------------------------------------
# Agent 1: Ledger ground truth + duplicate claims
# ---------------------------------------------------------------------------
def ledger_ground_truth(s: PipelineState) -> dict:
    t = s.ticket
    ledger = verify_ledger_ground_truth(s.db, t.transaction_id, t.customer_id, t.claimed_amount, t.currency)
    s.tx = ledger["transaction"]
    s.verification = {"status": ledger["status"], "transaction": s.tx}
    t.payment_verification = ledger["status"]
    if s.tx:
        t.refund_status = s.tx.payment_status

    open_or_resolved = [TicketStatus.NEW.value, TicketStatus.TRIAGED.value, TicketStatus.IN_REVIEW.value,
                        TicketStatus.AWAITING_INFORMATION.value, TicketStatus.ESCALATED.value,
                        TicketStatus.REOPENED.value, TicketStatus.RESOLVED.value]
    conditions = [Ticket.id != t.id, Ticket.transaction_id == t.transaction_id,
                  Ticket.status.in_(open_or_resolved), Ticket.created_at <= t.created_at]
    if t.order_id and t.order_id.strip():
        conditions.append(Ticket.order_id == t.order_id.strip())
    if t.item_name and t.item_name.strip():
        conditions.append(func.lower(func.trim(Ticket.item_name)) == t.item_name.strip().lower())
    s.duplicate = s.db.scalar(select(Ticket).where(*conditions).order_by(Ticket.created_at.desc()))
    t.duplicate_of_id = s.duplicate.id if s.duplicate else None

    return {
        "verification_status": ledger["status"],
        "transaction_id": t.transaction_id,
        "claimed_amount": float(t.claimed_amount),
        "ledger_amount": float(s.tx.amount) if s.tx else None,
        "available_balance": ledger.get("available_balance"),
        "pending_reservations": ledger.get("pending_reservations"),
        "currency": t.currency,
        "is_duplicate": bool(s.duplicate),
        "duplicate_of": s.duplicate.ticket_number if s.duplicate else None,
        "findings": ledger["findings"] + (f" Duplicate of #{s.duplicate.ticket_number}." if s.duplicate else ""),
    }


# ---------------------------------------------------------------------------
# Agent 5: Logistics
# ---------------------------------------------------------------------------
def logistics_verification(s: PipelineState) -> dict:
    s.logistics = verify_shipment_logistics(s.db, s.ticket.order_id, s.store_facts)
    return dict(s.logistics)


# ---------------------------------------------------------------------------
# Agent 3: Claim intent + contradictions (also keeps the operational category/priority/queue)
# ---------------------------------------------------------------------------
def claim_analysis(s: PipelineState) -> dict:
    t = s.ticket
    ops = classify(t.description)
    if t.category == "UNAUTHORIZED_PAYMENT":
        ops["category"] = "UNAUTHORIZED_PAYMENT"
    s.classification = ops
    t.category, t.confidence, t.recommended_action = ops["category"], ops["confidence"], ops["recommended_action"]
    t.priority = calculate_priority(t.category, t.description)
    t.queue = ROUTES.get(t.category, "Manual Triage")

    s.claim = classify_claim_reason(t.description, s.store_facts.get("reason"))
    contradictions = analyze_contradictions(
        claimed_reason=s.claim["controlled_reason"],
        product_category=t.item_category or "GENERAL",
        carrier_status=s.logistics.get("status"),
        evidence_features=[],
        signed_delivery=bool(s.logistics.get("signed_delivery")),
    )
    s.claim["contradictions"] = contradictions
    return {
        "controlled_reason": s.claim["controlled_reason"],
        "reason_source": s.claim["source"],
        "matched_terms": s.claim["matched_terms"],
        "text_disagrees_with_selected_reason": s.claim["text_disagrees"],
        "contradictions": contradictions,
        "operational_category": t.category,
        "priority": t.priority,
        "queue": t.queue,
        "findings": f"Claim classified as {s.claim['controlled_reason']} ({s.claim['source'].replace('_', ' ').lower()})"
                    + (f"; {len(contradictions)} contradiction(s)." if contradictions else "."),
    }


# ---------------------------------------------------------------------------
# Agent 7: Product identity + defect evidence
# ---------------------------------------------------------------------------
def _reference_images(s: PipelineState) -> List[str]:
    """Catalog photos of the purchased product: RITOS catalog files, else the store's product image (cached)."""
    from ..vision import get_vision_provider
    if get_vision_provider() is None:
        return []  # nothing would use them
    refs: List[str] = []
    sku = s.store_facts.get("sku")
    product = s.db.get(Product, sku) if sku else None
    if product:
        for ref in s.db.scalars(select(ProductReferenceImage).where(ProductReferenceImage.product_sku == product.sku)):
            if Path(ref.image_url).is_file():
                refs.append(ref.image_url)
    product_id = s.store_facts.get("product_id")
    if not refs and product_id:
        cache = evidence_store._root() / "reference" / f"{product_id}.jpg"
        if not cache.exists():
            try:
                resp = httpx.get(f"{settings.shopflow_base_url}/images/products/{product_id}.jpg",
                                 timeout=settings.evidence_fetch_timeout_seconds)
                if resp.status_code == 200:
                    cache.parent.mkdir(parents=True, exist_ok=True)
                    cache.write_bytes(resp.content)
            except httpx.HTTPError as exc:
                logger.info("Reference image for %s unavailable: %s", product_id, exc)
        if cache.exists():
            refs.append(str(cache))
    return refs


def evidence_verification(s: PipelineState) -> dict:
    t = s.ticket
    s.evidence_rows = [r for r in evidence_store.ticket_evidence(s.db, t)]
    images: List[Any] = [b for b in (evidence_store.read_bytes(r) for r in s.evidence_rows) if b]
    if not s.evidence_rows:
        images = list(s.evidence.get("evidence_images") or [])  # legacy references (often filenames only)
    product = {"sku": s.store_facts.get("sku") or t.item_name, "name": t.item_name,
               "category": t.item_category, "model": s.store_facts.get("product_name") or t.item_name}
    structured = verify_product_identity_and_defect(images, t.description, product, reference_images=_reference_images(s))
    s.vision = {"structured": structured, "images_count": len(s.evidence_rows) or len(images)}
    s.identity = summarize_identity(structured, product)
    s.defect = summarize_defect(structured)
    s.idempotency_key = refund_key(t.id, t.claimed_amount, t.currency)

    lifecycle = {"verified": EvidenceLifecycle.DEFECT_CHECKED.value, "mismatch": EvidenceLifecycle.AWAITING_CUSTOMER.value,
                 "inconclusive": EvidenceLifecycle.AWAITING_REVIEW.value, "not_assessable": EvidenceLifecycle.AWAITING_REVIEW.value,
                 "processing_failed": EvidenceLifecycle.PROCESSING_FAILED.value}[structured["verification_status"]]
    evidence_store.set_lifecycle(s.evidence_rows, lifecycle, {k: v for k, v in structured.items() if k != "evidence_quality"})
    return {
        "images_count": s.vision["images_count"],
        "identity": s.identity,
        "defect": s.defect,
        "verification_status": structured["verification_status"],
        "model_version": structured["model_version"],
        "pipeline_version": structured["pipeline_version"],
        "idempotency_key": s.idempotency_key,
        "findings": f"7A: {s.identity['findings']} 7B: {s.defect['findings']}",
    }


# ---------------------------------------------------------------------------
# Agent 2: Policy
# ---------------------------------------------------------------------------
def policy_enforcement(s: PipelineState) -> dict:
    t = s.ticket
    policy = get_effective_policy(s.db, t.item_category, s.store_facts)
    verified = s.identity.get("identity_status") == "verified" and s.defect.get("defect_status") == "verified"
    # Intake sets purchase_date only from trusted sources (ledger capture or store order); never a customer's input.
    anchor_source = s.evidence.get("purchase_date_source") or ("TICKET_RECORD" if t.purchase_date else None)
    s.policy = evaluate_policy_eligibility(policy, t.purchase_date, s.store_facts, defect_verified=verified,
                                           defect_claimed=s.claim.get("controlled_reason") in EVIDENCE_REASONS,
                                           as_of=s.evaluated_at)
    return {
        "eligible": s.policy["eligible"],
        "reason_code": s.policy["reason_code"],
        "policy_source": policy["source"],
        "policy_id": policy["policy_id"],
        "policy_version": policy["policy_version"],
        "return_window_days": policy["return_window_days"],
        "days_elapsed": s.policy["days_elapsed"],
        "anchor_date": t.purchase_date.isoformat() if t.purchase_date else None,
        "anchor_source": anchor_source,
        "evaluated_at": s.evaluated_at.isoformat(),
        "exception_applied": s.policy["exception_applied"],
        "rule_version": s.policy["rule_version"],
        "findings": s.policy["reason"],
    }


# ---------------------------------------------------------------------------
# Agent 4: Risk
# ---------------------------------------------------------------------------
def risk_assessment(s: PipelineState) -> dict:
    t = s.ticket
    r = evaluate_customer_risk(s.db, t.customer_id, t.id, t.claimed_amount, t.category, s.store_facts or None,
                               as_of=s.evaluated_at)
    s.risk = {"score": r["risk_score"], "tier": r["risk_tier"], "signals": r["risk_signals"],
              "requires_supervisory_review": r["requires_supervisory_review"]}
    return {k: r[k] for k in ("risk_score", "risk_tier", "risk_signals", "claims_30d", "claims_90d", "claims_365d", "lifetime_orders", "refund_to_gmv_ratio",
                              "is_high_value", "requires_supervisory_review", "rule_version", "thresholds", "findings")}


# ---------------------------------------------------------------------------
# Agent 6: Decision arbiter (the only step that routes)
# ---------------------------------------------------------------------------
def decision_arbiter(s: PipelineState) -> dict:
    t = s.ticket
    structured = s.vision["structured"]
    inputs = DecisionInputs(
        ledger_status=s.verification["status"],
        is_duplicate=bool(s.duplicate),
        policy_eligible=s.policy["eligible"],
        policy_reason_code=s.policy["reason_code"],
        policy_reason=s.policy["reason"],
        claim_reason=s.claim["controlled_reason"],
        contradictions=s.claim.get("contradictions", []),
        evidence_required=bool(s.store_facts.get("evidence_required")),
        evidence_count=s.vision["images_count"],
        identity_status=s.identity["identity_status"],
        defect_status=s.defect["defect_status"],
        evidence_next_step=structured["recommended_next_step"],
        risk_tier=s.risk["tier"],
        requires_supervisory_review=bool(s.risk["requires_supervisory_review"]),
        risk_signals=[sig["signal"] for sig in s.risk["signals"]],
        claimed_amount=Decimal(str(t.claimed_amount)),
        auto_approve_limit=Decimal(str(settings.auto_approve_max_inr)),
        near_duplicate_photos=any("NEAR_DUPLICATE_OF_OTHER_CLAIM" in (r.tamper_flags or []) for r in s.evidence_rows),
        operational_category=t.category or "OTHER",
        delivery_loss_confirmed=s.logistics.get("source") == "CARRIER" and (
            s.logistics.get("status") in LOSS_STATUSES
            or any("lost" in str(e).lower() for e in s.logistics.get("carrier_exceptions") or [])),
    )
    d = arbitrate(inputs)
    s.decision = d.as_dict()
    t.decision_bucket, t.assigned_desk, t.policy_evaluation_reason = d.decision_bucket, d.assigned_desk, d.reason
    t.proof_required = ", ".join(d.required_evidence) or None
    if s.defect.get("defect_status") == "verified":
        t.proof_status = "PROOF_VERIFIED"
    elif d.next_action == "AWAIT_PROOF":
        t.proof_status = "PROOF_REQUESTED"
    elif d.assigned_desk == "CS_2":
        t.proof_status = "UNDER_REVIEW"
    else:
        t.proof_status = "NOT_REQUIRED"
    if d.final and s.evidence_rows:
        evidence_store.set_lifecycle(s.evidence_rows, EvidenceLifecycle.ADJUDICATED.value)
    inputs_record = {k: (str(v) if isinstance(v, Decimal) else v) for k, v in inputs.__dict__.items()}
    return {**s.decision, "inputs": inputs_record, "findings": f"{d.assigned_desk} · {d.next_action}: {d.reason}"}


# ---------------------------------------------------------------------------
# Agent 9: Human review coordination
# ---------------------------------------------------------------------------
def review_coordination(s: PipelineState) -> dict:
    s.review = coordinate_review(s.db, s.ticket, s.decision)
    return dict(s.review)


# ---------------------------------------------------------------------------
# Agent 8: Customer communication
# ---------------------------------------------------------------------------
def customer_communication(s: PipelineState) -> dict:
    t = s.ticket
    state = customer_state_for(s.decision["next_action"], s.decision["reason_codes"])
    t.customer_message_draft = draft_customer_resolution_message(
        customer_name=t.customer_name, order_id=t.order_id, item_name=t.item_name,
        claimed_amount=float(t.claimed_amount), currency=t.currency, lifecycle_status=state,
        reason=s.decision["reason"], proof_required=t.proof_required)
    return {"customer_state": state, "customer_message_draft": t.customer_message_draft,
            "findings": f"Drafted '{state.replace('_', ' ').lower()}' message for the customer."}


STEP_FUNCTIONS: Dict[str, Callable[[PipelineState], dict]] = {
    "ledger_ground_truth": ledger_ground_truth,
    "logistics_verification": logistics_verification,
    "claim_analysis": claim_analysis,
    "evidence_verification": evidence_verification,
    "policy_enforcement": policy_enforcement,
    "risk_assessment": risk_assessment,
    "decision_arbiter": decision_arbiter,
    "review_coordination": review_coordination,
    "customer_communication": customer_communication,
}


def is_eligible(s: PipelineState) -> bool:
    return s.decision.get("next_action") == "AUTO_APPROVE"


def build_routing_steps(s: PipelineState) -> dict:
    """3-step flowchart for the desk UI, derived from the agents' recorded results."""
    t = s.ticket
    status = s.verification.get("status")
    codes = s.decision.get("reason_codes", [])
    ledger_failed = next((c for c in codes if c.startswith("LEDGER_") and c != "LEDGER_VERIFIED"), None)
    policy_code = s.policy.get("reason_code")
    risk = s.risk or {"tier": "UNKNOWN", "score": None}
    return {
        "step_1": {"title": "Step 1: Ledger Verification", "status": "FAILED" if ledger_failed else "PASSED",
                   "summary": f"Ledger: {status} | Tx: {t.transaction_id}", "failed_reason": ledger_failed},
        "step_2": {"title": "Step 2: Policy Window",
                   "status": {"POLICY_WINDOW_EXPIRED": "EXPIRED", "POLICY_FINAL_SALE": "FINAL_SALE"}.get(policy_code, "WITHIN_WINDOW" if s.policy.get("eligible") else "REVIEW"),
                   "summary": s.policy.get("reason"), "category": (t.item_category or "GENERAL").upper(),
                   "return_window_days": (s.policy.get("policy") or {}).get("return_window_days"),
                   "reason_code": policy_code},
        "step_3": {"title": "Step 3: Risk & Evidence Check",
                   "status": {"CS_1": "ALL_CLEAR", "CS_2": "FLAGGED"}.get(t.assigned_desk, "REJECTED"),
                   "summary": s.decision.get("reason"), "proof_status": t.proof_status,
                   "identity_status": s.identity.get("identity_status"), "defect_status": s.defect.get("defect_status"),
                   "risk_score": risk.get("score"), "risk_tier": risk.get("tier")},
        "assigned_desk": t.assigned_desk,
        "decision_bucket": t.decision_bucket,
        "reason_codes": codes,
        "rule_version": s.decision.get("rule_version"),
        "policy_reason": t.policy_evaluation_reason,
    }


def run_ticket_pipeline(db: Session, ticket: Ticket, actor_id: str | None = None) -> dict:
    from ..orchestrator import run_workflow
    return run_workflow(db, ticket, trigger="MANUAL", actor_id=actor_id)
