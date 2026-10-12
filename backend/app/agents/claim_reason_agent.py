"""Agent 3: Customer Claim Intent and Contradiction Analysis.

Analyzes:
- Normalized taxonomy of refund claim reasons
- Material contradictions against logistics, product type, and visual evidence
- Flagging for verification rather than false fraud accusation
"""
from __future__ import annotations
import re
from typing import Any, Dict, List, Optional

CONTROLLED_CLAIM_REASONS = [
    "DEFECTIVE_PRODUCT",
    "PHYSICAL_DAMAGE",
    "LOOSE_STITCHING_SEAM_FAILURE",
    "WRONG_PRODUCT_RECEIVED",
    "MATERIALLY_DIFFERENT_DESCRIPTION",
    "MISSING_ITEM_OR_PARTS",
    "ITEM_NOT_RECEIVED",
    "INCORRECT_SIZE_OR_FIT",
    "LATE_DELIVERY",
    "CHANGED_MIND",
    "DIGITAL_ACCESS_OR_ACTIVATION",
    "UNAUTHORIZED_PAYMENT",
    "DUPLICATE_PAYMENT",
    "OTHER"
]


# The reason the customer selected in the store maps directly onto the controlled taxonomy.
STORE_REASON_MAP = {
    "PRODUCT_DAMAGED": "PHYSICAL_DAMAGE",
    "PRODUCT_DEFECTIVE": "DEFECTIVE_PRODUCT",
    "DEFECTIVE_PRODUCT": "DEFECTIVE_PRODUCT",      # storefront demo naming
    "PHYSICAL_DAMAGE": "PHYSICAL_DAMAGE",
    "WRONG_PRODUCT": "WRONG_PRODUCT_RECEIVED",
    "MISSING_ITEM": "MISSING_ITEM_OR_PARTS",
    "NOT_AS_DESCRIBED": "MATERIALLY_DIFFERENT_DESCRIPTION",
    "DUPLICATE_CHARGE": "DUPLICATE_PAYMENT",
    "ORDER_NEVER_ARRIVED": "ITEM_NOT_RECEIVED",
    "LATE_DELIVERY": "LATE_DELIVERY",
    "CHANGED_MIND": "CHANGED_MIND",
    "INCORRECT_QUANTITY": "MISSING_ITEM_OR_PARTS",
    "BILLING_ISSUE": "OTHER",
    "OTHER": "OTHER",
}

# Phrase rules for free text, in priority order (first match wins on ties).
TEXT_RULES = [
    ("UNAUTHORIZED_PAYMENT", ["unauthorized", "didn't make", "did not make", "stolen card", "not me"]),
    ("DUPLICATE_PAYMENT", ["charged twice", "double charge", "duplicate payment", "charged two times"]),
    ("LOOSE_STITCHING_SEAM_FAILURE", ["loose stitching", "stitch", "seam", "unravel", "thread coming"]),
    ("WRONG_PRODUCT_RECEIVED", ["wrong product", "wrong item", "sent wrong", "different item", "wrong colour", "wrong color"]),
    ("MISSING_ITEM_OR_PARTS", ["missing item", "missing part", "accessory missing", "incomplete package", "missing"]),
    ("ITEM_NOT_RECEIVED", ["not received", "didn't receive", "never arrived", "never delivered"]),
    ("PHYSICAL_DAMAGE", ["damaged", "broken", "cracked", "shattered", "dent", "smashed", "torn", "tear"]),
    ("DEFECTIVE_PRODUCT", ["defective", "not working", "won't turn on", "faulty", "stopped working", "doesn't charge", "overheat", "erratic", "malfunction"]),
    ("INCORRECT_SIZE_OR_FIT", ["too big", "too small", "doesn't fit", "wrong size"]),
    ("LATE_DELIVERY", ["late", "delayed", "overdue"]),
    ("DIGITAL_ACCESS_OR_ACTIVATION", ["activation", "license key", "can't log in", "access code"]),
    ("CHANGED_MIND", ["changed mind", "changed my mind", "don't want", "no longer need", "not like"]),
]
PHYSICAL_DEFECT_REASONS = {"PHYSICAL_DAMAGE", "DEFECTIVE_PRODUCT", "LOOSE_STITCHING_SEAM_FAILURE", "MISSING_ITEM_OR_PARTS"}


def classify_claim_reason(description: str, store_reason: Optional[str] = None) -> Dict[str, Any]:
    """Map a claim to the controlled taxonomy. The customer's selected store reason wins; the text refines it.

    Rule-based: the result says which rule and which words matched instead of inventing a confidence.
    """
    text = (description or "").lower()
    text_reason, matched = None, []
    for reason, phrases in TEXT_RULES:
        hits = [p for p in phrases if p in text]
        if hits:
            text_reason, matched = reason, hits
            break

    selected = STORE_REASON_MAP.get((store_reason or "").upper())
    if selected:
        # e.g. store "PRODUCT_DEFECTIVE" + text "loose stitching" -> the more specific seam-failure category
        refined = text_reason if (text_reason and selected in PHYSICAL_DEFECT_REASONS and text_reason in PHYSICAL_DEFECT_REASONS) else None
        return {"controlled_reason": refined or selected, "source": "STORE_SELECTED_REASON",
                "store_reason": store_reason, "matched_terms": matched if refined else [],
                "text_disagrees": bool(text_reason and text_reason != selected and not refined)}
    if text_reason:
        return {"controlled_reason": text_reason, "source": "TEXT_RULES", "store_reason": None,
                "matched_terms": matched, "text_disagrees": False}
    return {"controlled_reason": "OTHER", "source": "NO_RULE_MATCHED", "store_reason": None,
            "matched_terms": [], "text_disagrees": False}


def analyze_contradictions(
    claimed_reason: str,
    product_category: str,
    carrier_status: Optional[str] = None,
    evidence_features: Optional[List[str]] = None,
    signed_delivery: bool = False
) -> List[str]:
    """Detect material contradictions between customer claims and verified facts."""
    contradictions = []
    features = [f.lower() for f in (evidence_features or [])]
    reason = claimed_reason.upper()
    cat = (product_category or "GENERAL").upper()

    # Contradiction 1: Item Not Received vs Signed Proof of Delivery
    if reason == "ITEM_NOT_RECEIVED" and (signed_delivery or carrier_status == "DELIVERED"):
        contradictions.append(
            "Customer claims non-delivery, but verified logistics record shows signed proof of delivery."
        )

    # Contradiction 2: Physical Damage on a pure digital product
    if cat == "DIGITAL" and reason in ["PHYSICAL_DAMAGE", "LOOSE_STITCHING_SEAM_FAILURE", "MISSING_ITEM_OR_PARTS"]:
        contradictions.append(
            f"Customer claims physical defect ({reason}) for a digital software product."
        )

    # Contradiction 3: Loose stitching claim, but evidence shows intact packaging or no seam
    if reason == "LOOSE_STITCHING_SEAM_FAILURE" and any("unopened" in f or "clean" in f for f in features):
        contradictions.append(
            "Customer claims loose stitching, but submitted evidence shows unopened packaging."
        )

    return contradictions
