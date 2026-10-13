"""Agent 6: Deterministic decision and desk-routing arbiter (spec sections 4 / Agent 6, 11).

Same persisted inputs + same RULE_VERSION => same routing. Precedence:
1. Ledger integrity      no payout without a verified transaction and refundable balance
2. Policy eligibility    authoritative policy rule (window, final sale, merchant defect exception)
3. Contradictions        material conflicts between the claim and recorded facts
4. Evidence              product identity and defect evidence where the claim type needs them
5. Risk and amount       supervisory review flags and the automatic settlement limit

CS-1 auto-approval only when every check passes. CS-2 gets a reason, the evidence still needed, a reviewer
checklist and the permitted actions. CS-3 is used only when an authoritative rule establishes ineligibility;
uncertainty (ambiguous photo, failed provider, suspicion) never becomes a final denial.
"""
from __future__ import annotations
from dataclasses import dataclass, field, asdict
from decimal import Decimal
from typing import Any, Dict, List, Optional

RULE_VERSION = "routing-rules-1.0"

# Claim types whose eligibility depends on what the evidence shows
EVIDENCE_REASONS = {"PHYSICAL_DAMAGE", "DEFECTIVE_PRODUCT", "LOOSE_STITCHING_SEAM_FAILURE",
                    "WRONG_PRODUCT_RECEIVED", "MISSING_ITEM_OR_PARTS", "MATERIALLY_DIFFERENT_DESCRIPTION"}
# Payment disputes are reconciled against provider records, never paid out a second time automatically.
PAYMENT_ISSUE_CATEGORIES = {"REFUND_NOT_RECEIVED", "DUPLICATE_PAYMENT", "PAYMENT_ORDER_FAILED", "INCORRECT_REFUND_AMOUNT",
                            "REFUND_FAILED", "REFUND_REVERSED", "REFUND_STATUS_INQUIRY", "UNAUTHORIZED_PAYMENT"}
LEDGER_REVIEW = {"CUSTOMER_MISMATCH", "AMOUNT_MISMATCH", "CURRENCY_MISMATCH", "INSUFFICIENT_REFUNDABLE_BALANCE",
                 "PAYMENT_PENDING", "MANUAL_VERIFICATION_REQUIRED"}
UNRESOLVED_EVIDENCE = {"inconclusive", "not_assessable", "processing_failed"}
# A parcel that may still arrive is not refunded automatically: the carrier must confirm it is lost or returned.
NON_DELIVERY_REASONS = {"ITEM_NOT_RECEIVED"}


@dataclass
class DecisionInputs:
    ledger_status: str
    is_duplicate: bool
    policy_eligible: Optional[bool]
    policy_reason_code: str
    policy_reason: str
    claim_reason: str
    contradictions: List[str]
    evidence_required: bool
    evidence_count: int
    identity_status: str
    defect_status: str
    evidence_next_step: str
    risk_tier: str
    requires_supervisory_review: bool
    risk_signals: List[str]
    claimed_amount: Decimal
    auto_approve_limit: Decimal
    near_duplicate_photos: bool = False
    operational_category: str = "OTHER"
    delivery_loss_confirmed: bool = False  # carrier record says lost / failed / returned to sender


@dataclass
class Decision:
    assigned_desk: str
    decision_bucket: str
    next_action: str
    decision: str
    reason: str
    reason_codes: List[str]
    required_evidence: List[str] = field(default_factory=list)
    reviewer_checklist: List[str] = field(default_factory=list)
    permitted_actions: List[str] = field(default_factory=list)
    final: bool = False
    rule_version: str = RULE_VERSION

    def as_dict(self) -> Dict[str, Any]:
        return asdict(self)


REVIEW_ACTIONS = ["APPROVE_PROOF", "REQUEST_PROOF", "DENY", "ESCALATE"]


def _review(reason: str, codes: List[str], next_action: str = "MANUAL_REVIEW", evidence=None, checklist=None,
            bucket: str = "EXCEPTIONAL_PROOF_NEEDED") -> Decision:
    return Decision("CS_2", bucket, next_action, "HUMAN_REVIEW_REQUIRED", reason, codes,
                    required_evidence=evidence or [], reviewer_checklist=checklist or [], permitted_actions=REVIEW_ACTIONS)


def arbitrate(i: DecisionInputs) -> Decision:
    # 1. Ledger integrity
    if i.is_duplicate:
        return Decision("CS_3", "NON_REFUNDABLE", "AUTO_REJECT", "NO_DUPLICATE_REFUND",
                        "Duplicate claim: an earlier claim exists for the same transaction, order and product.",
                        ["LEDGER_DUPLICATE_CLAIM"], final=True)
    if i.ledger_status == "ALREADY_REFUNDED":
        return Decision("CS_3", "NON_REFUNDABLE", "AUTO_REJECT", "NO_DUPLICATE_REFUND",
                        "The transaction has already been fully refunded.", ["LEDGER_ALREADY_REFUNDED"], final=True)
    if i.ledger_status == "TRANSACTION_NOT_FOUND":
        # Absence from our ledger may be a data gap: investigate, never auto-deny or auto-pay.
        return Decision("CS_3", "NON_REFUNDABLE", "MANUAL_REVIEW", "HUMAN_REVIEW_REQUIRED",
                        "Transaction reference not found in the ledger; investigation required before any decision.",
                        ["LEDGER_TRANSACTION_NOT_FOUND"],
                        reviewer_checklist=["Search the payment gateway for the reference", "Confirm the order and customer"],
                        permitted_actions=["DENY", "ESCALATE"])
    if i.ledger_status in LEDGER_REVIEW:
        return _review(f"Ledger check needs a person: {i.ledger_status.replace('_', ' ').lower()}.",
                       [f"LEDGER_{i.ledger_status}"],
                       checklist=["Reconcile the claimed amount with the captured payment and pending refunds"])
    if i.ledger_status != "VERIFIED":
        return _review(f"Unrecognised ledger status {i.ledger_status}.", ["LEDGER_UNKNOWN_STATUS"])

    if i.operational_category in PAYMENT_ISSUE_CATEGORIES:
        return _review(f"Payment issue ({i.operational_category.replace('_', ' ').lower()}) must be reconciled with the payment provider.",
                       ["PAYMENT_ISSUE_RECONCILIATION"],
                       checklist=["Check the provider's records for the original charge and any refund reference",
                                  "Never issue a second refund before the first one's state is known"])

    # 2. Policy eligibility
    if i.policy_eligible is False:
        return Decision("CS_3", "NON_REFUNDABLE", "AUTO_REJECT", "REJECTED_BY_POLICY", i.policy_reason,
                        [i.policy_reason_code], final=True)
    if i.policy_eligible is None:
        return _review(i.policy_reason, [i.policy_reason_code],
                       next_action="AWAIT_PROOF" if i.policy_reason_code == "POLICY_DEFECT_UNVERIFIED" else "MANUAL_REVIEW",
                       evidence=["Close-up photo of the defect"] if i.policy_reason_code == "POLICY_DEFECT_UNVERIFIED" else [],
                       checklist=["Confirm the applicable policy and dates"])

    # 3. Contradictions (a reason to verify, not proof of fraud)
    if i.contradictions:
        return _review("Claim conflicts with recorded facts: " + "; ".join(i.contradictions),
                       ["CLAIM_CONTRADICTION"], checklist=["Compare the claim with carrier, order and photo records"])

    # 3b. Non-delivery needs the carrier's outcome before any refund
    if i.claim_reason in NON_DELIVERY_REASONS and not i.delivery_loss_confirmed:
        return _review("Non-delivery claim: no carrier record yet confirms the parcel was lost or returned.",
                       ["LOGISTICS_UNVERIFIED"],
                       checklist=["Check the carrier's tracking for the parcel",
                                  "Refund only once it is confirmed lost, failed or returned to sender"])

    # 4. Evidence
    needs_evidence = i.evidence_required or i.claim_reason in EVIDENCE_REASONS
    if needs_evidence:
        if i.evidence_count == 0:
            return _review("Photo evidence is required for this claim type.", ["EVIDENCE_MISSING"], next_action="AWAIT_PROOF",
                           evidence=["Full photo of the product", "Close-up of the claimed defect", "Product label or model number"])
        if i.identity_status == "mismatch":
            return _review("Photos may show a different product or variant than the one purchased.", ["EVIDENCE_IDENTITY_MISMATCH"],
                           next_action="AWAIT_PROOF", evidence=["Photo of the product label, model number or serial"],
                           checklist=["Compare the photo with the catalog images of the purchased SKU"])
        if i.defect_status == "mismatch":
            return _review("The claimed defect is not visible in the photos.", ["EVIDENCE_DEFECT_NOT_VISIBLE"],
                           next_action="AWAIT_PROOF", evidence=["Close-up of the exact defect area"])
        if i.identity_status in UNRESOLVED_EVIDENCE or i.defect_status in UNRESOLVED_EVIDENCE:
            codes = [f"EVIDENCE_IDENTITY_{i.identity_status.upper()}", f"EVIDENCE_DEFECT_{i.defect_status.upper()}"]
            return _review(f"Evidence needs human inspection: {i.evidence_next_step}", codes,
                           checklist=["Check the photos show the purchased product",
                                      "Check the claimed defect is visible in the claimed location",
                                      "Check for signs the photo was reused or edited"])
    if i.near_duplicate_photos:
        return _review("A submitted photo closely matches a photo from another claim.", ["EVIDENCE_NEAR_DUPLICATE"],
                       checklist=["Compare with the matching claim's photos"])

    # 5. Risk and amount
    if i.requires_supervisory_review or i.risk_tier == "HIGH":
        codes = ["RISK_SUPERVISORY_REVIEW"] + (["AMOUNT_ABOVE_AUTO_LIMIT"] if i.claimed_amount > i.auto_approve_limit else [])
        return _review("Risk signals require supervisory review: " + (", ".join(i.risk_signals) or i.risk_tier),
                       codes, next_action="AWAIT_APPROVAL", bucket="GENUINE_REFUNDABLE",
                       checklist=["Review claim history and velocity", "Approve or escalate within limits"])
    if i.claimed_amount > i.auto_approve_limit:
        return _review(f"Amount above the {i.auto_approve_limit:,.2f} automatic settlement limit.", ["AMOUNT_ABOVE_AUTO_LIMIT"],
                       next_action="AWAIT_APPROVAL", bucket="GENUINE_REFUNDABLE", checklist=["Supervisor approval within limits"])

    codes = ["LEDGER_VERIFIED", i.policy_reason_code]
    if needs_evidence:
        codes.append("EVIDENCE_VERIFIED")
    return Decision("CS_1", "GENUINE_REFUNDABLE", "AUTO_APPROVE", "ELIGIBLE_FOR_AUTHORIZED_REFUND_REVIEW",
                    "Verified transaction, policy-compliant, evidence sufficient where required, low risk, within the automatic limit.",
                    codes, final=True)


def arbitrate_decision_and_desk(**kwargs) -> Dict[str, Any]:
    """Dict-in/dict-out wrapper for API callers."""
    return arbitrate(DecisionInputs(**kwargs)).as_dict()
