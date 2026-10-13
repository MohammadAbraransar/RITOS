"""Agent 2: Product category and return-policy enforcement.

Policy source precedence (recorded on every decision):
1. STORE_SNAPSHOT: the policy the store attached to the claim (source of truth for store orders)
2. RITOS_POLICY: latest active `return_policies` row for the category, then for GENERAL
3. NONE: no policy configured -> eligibility cannot be decided automatically

Defect exceptions come only from the merchant's configured policy (`allow_damaged_exceptions`) and only for a
*verified* defect. No statutory rule is assumed: jurisdiction rules need a maintained legal ruleset (not configured).
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import ReturnPolicy

RULE_VERSION = "policy-rules-1.0"


def get_effective_policy(db: Session, category: Optional[str], store_facts: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    cat = (category or "GENERAL").upper()
    facts = store_facts or {}
    if facts.get("return_window_days") is not None:
        return {
            "source": "STORE_SNAPSHOT",
            "policy_id": f"store:{facts.get('policy_version') or 'unversioned'}",
            "policy_version": facts.get("policy_version"),
            "category": cat,
            "return_window_days": int(facts["return_window_days"]),
            # Only if the store's policy grants it; never assumed.
            "allow_damaged_exceptions": bool(facts.get("defect_exception_allowed")),
            "policy_summary": f"Store policy v{facts.get('policy_version')}: {int(facts['return_window_days'])}-day return window.",
        }
    for candidate in (cat, "GENERAL"):
        row = db.scalar(select(ReturnPolicy).where(ReturnPolicy.category == candidate, ReturnPolicy.active.is_(True))
                        .order_by(ReturnPolicy.policy_version.desc()))
        if row:
            return {
                "source": "RITOS_POLICY",
                "policy_id": row.id,
                "policy_version": row.policy_version,
                "category": row.category,
                "return_window_days": row.return_window_days,
                "allow_damaged_exceptions": row.allow_damaged_exceptions,
                "requires_serial": row.requires_serial,
                "requires_tags": row.requires_tags,
                "policy_summary": row.policy_summary,
            }
    return {"source": "NONE", "policy_id": None, "policy_version": None, "category": cat,
            "return_window_days": None, "allow_damaged_exceptions": False,
            "policy_summary": f"No return policy configured for {cat}."}


def evaluate_policy_eligibility(
    policy: Dict[str, Any],
    anchor_date: Optional[datetime],
    store_facts: Optional[Dict[str, Any]] = None,
    defect_verified: bool = False,
    defect_claimed: bool = False,
    as_of: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Deterministic eligibility. `eligible` is True, False, or None (cannot be decided automatically).

    `as_of` is the evaluation time; the same inputs and `as_of` always give the same result.
    """
    facts = store_facts or {}
    now = as_of or datetime.now(timezone.utc)
    window = policy.get("return_window_days")
    base = {"policy": policy, "rule_version": RULE_VERSION, "days_elapsed": None, "exception_applied": None}

    if policy["source"] == "NONE":
        return {**base, "eligible": None, "within_window": None, "reason_code": "POLICY_MISSING",
                "reason": policy["policy_summary"] + " Manual policy review required."}

    # Elapsed days: the store computes them from the delivery date when it can.
    if facts.get("within_return_window") is not None:
        within = bool(facts["within_return_window"])
        days = facts.get("days_since_delivery")
    elif anchor_date is None:
        return {**base, "eligible": None, "within_window": None, "reason_code": "POLICY_DATE_UNKNOWN",
                "reason": "No delivery or purchase date on record; the return window cannot be checked automatically."}
    else:
        anchor = anchor_date if anchor_date.tzinfo else anchor_date.replace(tzinfo=timezone.utc)
        days = max(0, int((now - anchor).total_seconds() // 86400))
        within = window is not None and window > 0 and days <= window
    base["days_elapsed"] = days

    if window == 0:
        if defect_verified and policy.get("allow_damaged_exceptions"):
            return {**base, "eligible": True, "within_window": False, "reason_code": "POLICY_DEFECT_EXCEPTION",
                    "exception_applied": "MERCHANT_DEFECT_EXCEPTION",
                    "reason": f"{policy['category']} is final sale, but the merchant policy accepts verified defects."}
        if defect_claimed and policy.get("allow_damaged_exceptions"):
            return {**base, "eligible": None, "within_window": False, "reason_code": "POLICY_DEFECT_UNVERIFIED",
                    "reason": f"{policy['category']} is final sale; the claimed defect must be verified before the exception applies."}
        return {**base, "eligible": False, "within_window": False, "reason_code": "POLICY_FINAL_SALE",
                "reason": f"{policy['category']} is final sale and non-returnable under {policy['source']} policy."}

    if within:
        return {**base, "eligible": True, "within_window": True, "reason_code": "POLICY_WITHIN_WINDOW",
                "reason": f"Within the {window}-day return window ({days} days elapsed)."}

    if defect_verified and policy.get("allow_damaged_exceptions"):
        return {**base, "eligible": True, "within_window": False, "reason_code": "POLICY_DEFECT_EXCEPTION",
                "exception_applied": "MERCHANT_DEFECT_EXCEPTION",
                "reason": f"Outside the {window}-day window ({days} days), but the merchant policy accepts verified defects."}
    if defect_claimed and policy.get("allow_damaged_exceptions"):
        return {**base, "eligible": None, "within_window": False, "reason_code": "POLICY_DEFECT_UNVERIFIED",
                "reason": f"Outside the {window}-day window ({days} days); a defect exception needs the defect verified first."}
    return {**base, "eligible": False, "within_window": False, "reason_code": "POLICY_WINDOW_EXPIRED",
            "reason": f"Claim filed past the {window}-day return policy window ({days} days elapsed)."}
