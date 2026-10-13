"""Agent 4: Historical Risk and Claim Velocity Engine.

Calculates:
- Trailing 30, 90, and 365-day claim velocity
- Lifetime refund-to-GMV ratio (ledger)
- High-value supervisory review requirements (e.g. claims > INR 5,000)
- Risk tiering (LOW, MEDIUM, HIGH)
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from ..config import settings
from ..models import Ticket, Transaction

# Versioned, deterministic scoring rules: a risk signal is an anomaly for review, never proof of fraud.
# Score weights belong to the rule version (change them => bump it); thresholds are tunable in settings.
RULE_VERSION = "risk-rules-1.0"
BASE_SCORE = 10
WEIGHT_HIGH_VALUE = 25
WEIGHT_UNAUTHORIZED_PAYMENT = 50
WEIGHT_HIGH_VELOCITY = 25
WEIGHT_REPEAT_CLAIMANT = 10
WEIGHT_NEW_ACCOUNT = 15
WEIGHT_HIGH_REFUND_RATIO = 20


def evaluate_customer_risk(
    db: Session,
    customer_id: str,
    current_ticket_id: str,
    claimed_amount: float | Decimal,
    category: str,
    store_facts: Optional[Dict[str, Any]] = None,
    as_of: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Calculate multi-factor risk, velocity, and supervisory requirements."""
    now = as_of or datetime.now(timezone.utc)
    t30 = now - timedelta(days=30)
    t90 = now - timedelta(days=90)
    t365 = now - timedelta(days=365)

    # 30-day velocity from store facts or local DB
    store_30 = (store_facts or {}).get("refund_tickets_30d")
    if store_30 is not None:
        claims_30d = max(0, int(store_30) - 1)
    else:
        claims_30d = db.scalar(
            select(func.count(Ticket.id)).where(
                Ticket.customer_id == customer_id,
                Ticket.id != current_ticket_id,
                Ticket.created_at >= t30
            )
        ) or 0

    def prior_claims(since):
        return db.scalar(select(func.count(Ticket.id)).where(
            Ticket.customer_id == customer_id, Ticket.id != current_ticket_id, Ticket.created_at >= since)) or 0

    store_90 = (store_facts or {}).get("refund_tickets_90d")
    claims_90d = max(0, int(store_90) - 1) if store_90 is not None else prior_claims(t90)
    store_365 = (store_facts or {}).get("refund_tickets_lifetime")
    claims_365d = prior_claims(t365) if store_365 is None else max(0, int(store_365) - 1)
    high_value_threshold = Decimal(str(settings.auto_approve_max_inr))
    velocity_high = settings.risk_high_velocity_claims_30d
    new_account_days = settings.risk_new_account_days

    score = BASE_SCORE
    signals = []

    # High-value claim check (e.g. > ₹5,000)
    claim_dec = Decimal(str(claimed_amount))
    is_high_value = claim_dec > high_value_threshold
    if is_high_value:
        score += WEIGHT_HIGH_VALUE
        signals.append({
            "signal": "HIGH_VALUE_CLAIM_THRESHOLD_EXCEEDED",
            "severity": "MEDIUM",
            "score_delta": WEIGHT_HIGH_VALUE,
            "threshold_inr": float(high_value_threshold),
            "amount": float(claim_dec)
        })

    # Unauthorized payment report
    if category == "UNAUTHORIZED_PAYMENT":
        score += WEIGHT_UNAUTHORIZED_PAYMENT
        signals.append({"signal": "UNAUTHORIZED_PAYMENT_REPORT", "severity": "HIGH", "score_delta": WEIGHT_UNAUTHORIZED_PAYMENT})

    # High return velocity
    if claims_30d >= velocity_high:
        score += WEIGHT_HIGH_VELOCITY
        signals.append({"signal": "HIGH_RETURN_VELOCITY_30D", "severity": "HIGH", "score_delta": WEIGHT_HIGH_VELOCITY, "count": claims_30d})
    elif claims_30d >= 1:
        score += WEIGHT_REPEAT_CLAIMANT
        signals.append({"signal": "REPEAT_CLAIMANT_30D", "severity": "LOW", "score_delta": WEIGHT_REPEAT_CLAIMANT, "count": claims_30d})

    # Lifetime refund-to-GMV ratio from the ledger; only meaningful once the customer has enough orders.
    orders, gmv, refunded = db.execute(
        select(func.count(Transaction.id), func.coalesce(func.sum(Transaction.amount), 0),
               func.coalesce(func.sum(Transaction.refunded_amount), 0))
        .where(Transaction.customer_id == customer_id)).one()
    gmv, refunded = Decimal(str(gmv)), Decimal(str(refunded))
    refund_ratio = float((refunded / gmv).quantize(Decimal("0.0001"))) if gmv > 0 else 0.0
    if orders >= settings.risk_refund_ratio_min_orders and refund_ratio >= settings.risk_refund_ratio_threshold:
        score += WEIGHT_HIGH_REFUND_RATIO
        signals.append({"signal": "HIGH_REFUND_TO_GMV_RATIO", "severity": "MEDIUM", "score_delta": WEIGHT_HIGH_REFUND_RATIO,
                        "ratio": refund_ratio, "orders": orders})

    account_age = (store_facts or {}).get("account_age_days")
    if account_age is not None and int(account_age) < new_account_days:
        score += WEIGHT_NEW_ACCOUNT
        signals.append({"signal": "NEW_CUSTOMER_ACCOUNT", "severity": "LOW", "score_delta": WEIGHT_NEW_ACCOUNT, "age_days": account_age})

    tier = "HIGH" if score >= settings.risk_tier_high_score else ("MEDIUM" if score >= settings.risk_tier_medium_score else "LOW")
    requires_supervisory_review = is_high_value or tier == "HIGH"

    return {
        "risk_score": min(100, score),
        "risk_tier": tier,
        "risk_signals": signals,
        "claims_30d": claims_30d,
        "claims_90d": claims_90d,
        "claims_365d": claims_365d,
        "lifetime_orders": orders,
        "refund_to_gmv_ratio": refund_ratio,
        "rule_version": RULE_VERSION,
        # Recorded so a decision can be replayed with the thresholds that were in force
        "thresholds": {"high_value_inr": float(high_value_threshold), "high_velocity_claims_30d": velocity_high,
                       "new_account_days": new_account_days,
                       "refund_ratio_threshold": settings.risk_refund_ratio_threshold,
                       "refund_ratio_min_orders": settings.risk_refund_ratio_min_orders,
                       "tier_high_score": settings.risk_tier_high_score,
                       "tier_medium_score": settings.risk_tier_medium_score},
        "is_high_value": is_high_value,
        "requires_supervisory_review": requires_supervisory_review,
        "findings": f"Multi-factor risk score: {min(100, score)}/100 ({tier} tier). {len(signals)} risk signal(s)."
    }
