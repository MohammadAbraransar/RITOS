"""Agent 4: Historical Risk and Claim Velocity Engine.

Calculates:
- Trailing 30, 90, and 365-day claim velocity
- Lifetime refund-to-GMV ratios
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
RULE_VERSION = "risk-rules-1.0"


def evaluate_customer_risk(
    db: Session,
    customer_id: str,
    current_ticket_id: str,
    claimed_amount: float | Decimal,
    category: str,
    store_facts: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Calculate multi-factor risk, velocity, and supervisory requirements."""
    now = datetime.now(timezone.utc)
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

    score = 10
    signals = []

    # High-value claim check (e.g. > ₹5,000)
    claim_dec = Decimal(str(claimed_amount))
    is_high_value = claim_dec > high_value_threshold
    if is_high_value:
        score += 25
        signals.append({
            "signal": "HIGH_VALUE_CLAIM_THRESHOLD_EXCEEDED",
            "severity": "MEDIUM",
            "score_delta": 25,
            "threshold_inr": float(high_value_threshold),
            "amount": float(claim_dec)
        })

    # Unauthorized payment report
    if category == "UNAUTHORIZED_PAYMENT":
        score += 50
        signals.append({"signal": "UNAUTHORIZED_PAYMENT_REPORT", "severity": "HIGH", "score_delta": 50})

    # High return velocity
    if claims_30d >= 3:
        score += 25
        signals.append({"signal": "HIGH_RETURN_VELOCITY_30D", "severity": "HIGH", "score_delta": 25, "count": claims_30d})
    elif claims_30d >= 1:
        score += 10
        signals.append({"signal": "REPEAT_CLAIMANT_30D", "severity": "LOW", "score_delta": 10, "count": claims_30d})

    account_age = (store_facts or {}).get("account_age_days")
    if account_age is not None and int(account_age) < 7:
        score += 15
        signals.append({"signal": "NEW_CUSTOMER_ACCOUNT", "severity": "LOW", "score_delta": 15, "age_days": account_age})

    tier = "HIGH" if score >= 60 else ("MEDIUM" if score >= 30 else "LOW")
    requires_supervisory_review = is_high_value or tier == "HIGH"

    return {
        "risk_score": min(100, score),
        "risk_tier": tier,
        "risk_signals": signals,
        "claims_30d": claims_30d,
        "claims_90d": claims_90d,
        "claims_365d": claims_365d,
        "rule_version": RULE_VERSION,
        "is_high_value": is_high_value,
        "requires_supervisory_review": requires_supervisory_review,
        "findings": f"Multi-factor risk score: {min(100, score)}/100 ({tier} tier). {len(signals)} risk signal(s)."
    }
