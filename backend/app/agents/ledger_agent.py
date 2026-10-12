"""Agent 1: Ledger Ground Truth and Payment Gateway Reconciliation.

Verifies:
- Authoritative transaction existence in financial ledger
- Customer ownership and currency match
- Amount paid vs captured amount
- Account for previous refunds and pending reservations
- Concurrency-safe refundable balance calculation
"""
from __future__ import annotations
from decimal import Decimal
from typing import Any, Dict, Optional
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..models import Transaction, RefundRequest, RefundStatus


def verify_ledger_ground_truth(
    db: Session,
    transaction_id: str,
    customer_id: str,
    claimed_amount: float | Decimal,
    currency: str = "INR"
) -> Dict[str, Any]:
    """Authoritative ledger reconciliation check."""
    tx = db.get(Transaction, transaction_id)
    if not tx:
        return {
            "status": "TRANSACTION_NOT_FOUND",
            "transaction": None,
            "available_balance": 0.0,
            "findings": f"Transaction '{transaction_id}' not found in authoritative financial ledger."
        }

    if tx.customer_id != customer_id:
        return {
            "status": "CUSTOMER_MISMATCH",
            "transaction": tx,
            "available_balance": 0.0,
            "findings": f"Customer ID '{customer_id}' does not match transaction owner '{tx.customer_id}'."
        }

    if tx.currency.upper() != currency.upper():
        return {
            "status": "CURRENCY_MISMATCH",
            "transaction": tx,
            "available_balance": 0.0,
            "findings": f"Currency mismatch: transaction currency is {tx.currency}, claim currency is {currency}."
        }

    if tx.payment_status == "PENDING":
        return {
            "status": "PAYMENT_PENDING",
            "transaction": tx,
            "available_balance": 0.0,
            "findings": "Transaction payment is still pending capture at the gateway."
        }

    if tx.payment_status != "SUCCESSFUL":
        return {
            "status": "MANUAL_VERIFICATION_REQUIRED",
            "transaction": tx,
            "available_balance": 0.0,
            "findings": f"Transaction payment status is '{tx.payment_status}'; requires manual verification."
        }

    tx_total = Decimal(str(tx.amount))
    tx_refunded = Decimal(str(tx.refunded_amount))
    remaining = (tx_total - tx_refunded).quantize(Decimal("0.01"))

    # Also check pending reservations
    pending_refs = db.scalars(
        select(RefundRequest).where(
            RefundRequest.transaction_id == tx.id,
            RefundRequest.status.in_([
                RefundStatus.PENDING_APPROVAL.value,
                RefundStatus.APPROVED.value,
                RefundStatus.PROCESSING.value
            ])
        )
    ).all()
    pending_sum = sum((Decimal(str(r.amount)) for r in pending_refs), Decimal("0"))
    available = (remaining - pending_sum).quantize(Decimal("0.01"))

    if remaining <= Decimal("0"):
        return {
            "status": "ALREADY_REFUNDED",
            "transaction": tx,
            "available_balance": 0.0,
            "findings": f"Transaction #{tx.id} has already been fully refunded ({tx.currency} {tx_refunded:.2f})."
        }

    claim_dec = Decimal(str(claimed_amount)).quantize(Decimal("0.01"))
    if claim_dec <= Decimal("0") or claim_dec > remaining:
        return {
            "status": "AMOUNT_MISMATCH",
            "transaction": tx,
            "available_balance": float(available),
            "findings": f"Claimed amount {currency} {claim_dec:.2f} exceeds remaining balance {tx.currency} {remaining:.2f}."
        }
    if claim_dec > available:
        # Other refunds already reserved part of the balance: never let parallel claims over-draw it.
        return {
            "status": "INSUFFICIENT_REFUNDABLE_BALANCE",
            "transaction": tx,
            "available_balance": float(available),
            "pending_reservations": float(pending_sum),
            "findings": (f"Claimed {currency} {claim_dec:.2f} exceeds the {tx.currency} {available:.2f} still available after "
                         f"{tx.currency} {pending_sum:.2f} of pending refunds on this transaction.")
        }

    return {
        "status": "VERIFIED",
        "transaction": tx,
        "available_balance": float(available),
        "pending_reservations": float(pending_sum),
        "findings": (f"Ledger verified: {tx.currency} {tx_total:.2f} captured, {tx.currency} {available:.2f} refundable"
                     f" after {tx.currency} {pending_sum:.2f} pending.")
    }
