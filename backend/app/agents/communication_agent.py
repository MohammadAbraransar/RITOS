"""Agent 8: Customer resolution and governance communicator.

Messages state exactly how far the case has progressed. An internal approval is never described as a refund,
and settlement timelines are quoted only when configured (REFUND_SETTLEMENT_DAYS), never invented.
"""
from __future__ import annotations
from typing import List, Optional

from ..config import settings

# Case states the customer can be told about (spec Agent 8)
APPROVED_PENDING_SETTLEMENT = "APPROVED_PENDING_SETTLEMENT"
AWAITING_APPROVAL = "AWAITING_APPROVAL"
EVIDENCE_REQUIRED = "EVIDENCE_REQUIRED"
IDENTITY_VERIFICATION_REQUIRED = "IDENTITY_VERIFICATION_REQUIRED"
MANUAL_INSPECTION_PENDING = "MANUAL_INSPECTION_PENDING"
REJECTED = "REJECTED"
SETTLEMENT_INITIATED = "SETTLEMENT_INITIATED"
SETTLEMENT_CONFIRMED = "SETTLEMENT_CONFIRMED"
SETTLEMENT_FAILED = "SETTLEMENT_FAILED"


def customer_state_for(next_action: str, reason_codes: List[str]) -> str:
    """Map the arbiter's outcome to what the customer may be told."""
    if next_action == "AUTO_APPROVE":
        return APPROVED_PENDING_SETTLEMENT
    if next_action == "AUTO_REJECT":
        return REJECTED
    if "EVIDENCE_IDENTITY_MISMATCH" in reason_codes:
        return IDENTITY_VERIFICATION_REQUIRED
    if next_action == "AWAIT_PROOF":
        return EVIDENCE_REQUIRED
    if next_action == "AWAIT_APPROVAL":
        return AWAITING_APPROVAL
    return MANUAL_INSPECTION_PENDING


def draft_customer_resolution_message(
    customer_name: Optional[str],
    order_id: Optional[str],
    item_name: Optional[str],
    claimed_amount: float,
    currency: str,
    lifecycle_status: str,
    reason: Optional[str] = None,
    proof_required: Optional[str] = None,
    provider_confirmation: Optional[str] = None,
) -> str:
    name = (customer_name or "Customer").strip()
    subject = f"order {order_id}" if order_id else "your order"
    item = f" ({item_name})" if item_name else ""
    amount = f"{currency} {claimed_amount:,.2f}"
    timeline = (f" Your bank usually shows it within {settings.refund_settlement_days} business days."
                if settings.refund_settlement_days else "")

    texts = {
        APPROVED_PENDING_SETTLEMENT:
            f"Your refund of {amount} for {subject}{item} has been approved. The payment has not been sent yet; "
            f"we will confirm as soon as it is initiated.",
        AWAITING_APPROVAL:
            f"Your refund request of {amount} for {subject}{item} has passed our checks and is waiting for approval by our team. "
            f"No refund has been issued yet.",
        EVIDENCE_REQUIRED:
            f"To continue with your request for {subject}{item}, please upload: "
            f"{proof_required or 'a full photo of the product and a close-up of the problem'}.",
        IDENTITY_VERIFICATION_REQUIRED:
            f"We could not confirm that the photos show the item from {subject}{item}. Please send a photo of the "
            f"product's label, model number or serial number.",
        MANUAL_INSPECTION_PENDING:
            f"Your request for {subject}{item} is being reviewed by our team. We will update you once a reviewer has checked it.",
        REJECTED:
            f"We are unable to approve a refund for {subject}{item}: {reason or 'it is not eligible under the return policy'}. "
            f"If you think this is wrong, reply with any additional evidence to request an independent review.",
        SETTLEMENT_INITIATED:
            f"Your refund of {amount} for {subject}{item} has been sent to the payment provider.{timeline}",
        SETTLEMENT_CONFIRMED:
            f"The payment provider has confirmed your refund of {amount} for {subject}{item}"
            f"{f' ({provider_confirmation})' if provider_confirmation else ''}.{timeline}",
        SETTLEMENT_FAILED:
            f"Your approved refund of {amount} for {subject}{item} could not be completed by the payment provider yet. "
            f"Our finance team is checking it; you do not need to do anything.",
    }
    return f"Dear {name}, " + texts.get(lifecycle_status, texts[MANUAL_INSPECTION_PENDING])
