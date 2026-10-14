"""Payout authorization policy: the single source of truth for who may act on a refund.

Four-eyes rule: the person who proposes a payout cannot approve it, and neither of them can execute it.
Which roles may perform each action comes from settings (PAYOUT_*_ROLES). The API endpoints enforce this policy
and the desk reads the same policy (via /auth/me and refund rows), so the screen never offers an action the
server would refuse.
"""
from __future__ import annotations
from typing import Dict, List, Optional, Set

from .config import settings
from .models import Role, RefundRequest, RefundStatus, User
from fastapi import HTTPException

from .security import require_roles

PROPOSE, APPROVE, EXECUTE, RECONCILE = "propose", "approve", "execute", "reconcile"
# Approving a claim RITOS routed for supervisor approval (AWAIT_APPROVAL: above the automatic limit or risk-flagged)
PROPOSE_SUPERVISED = "propose_supervised"


def _parse(setting_name: str) -> Set[str]:
    raw = getattr(settings, setting_name)
    roles = {r.strip() for r in raw.split(",") if r.strip()}
    unknown = roles - {r.value for r in Role}
    if unknown:
        raise RuntimeError(f"{setting_name.upper()} has unknown roles {sorted(unknown)}; valid: {sorted(r.value for r in Role)}")
    if not roles:
        raise RuntimeError(f"{setting_name.upper()} must name at least one role")
    return roles


PAYOUT_ROLES: Dict[str, Set[str]] = {
    PROPOSE: _parse("payout_proposer_roles"),
    PROPOSE_SUPERVISED: _parse("payout_supervisory_roles"),
    APPROVE: _parse("payout_approver_roles"),
    EXECUTE: _parse("payout_executor_roles"),
    RECONCILE: _parse("payout_reconciler_roles"),
}

# Refund workflow: which action a refund in each status is waiting for (domain state machine, not configuration)
NEXT_ACTION = {
    RefundStatus.PENDING_APPROVAL.value: APPROVE,
    RefundStatus.APPROVED.value: EXECUTE,
    RefundStatus.RECONCILIATION_REQUIRED.value: RECONCILE,
}


def require_payout(action: str):
    """FastAPI dependency: the caller's role must be allowed to perform this payout action."""
    return require_roles(*sorted(PAYOUT_ROLES[action]))


def proposal_action(ticket) -> str:
    """Which proposal permission a ticket needs: claims RITOS sent for approval need a supervisory role."""
    workflow = (ticket.classification_evidence or {}).get("workflow") or {}
    return PROPOSE_SUPERVISED if workflow.get("next_action") == "AWAIT_APPROVAL" else PROPOSE


def can_propose(user: User, ticket) -> bool:
    return user.role in PAYOUT_ROLES[proposal_action(ticket)]


def require_can_propose(user: User, ticket) -> None:
    """Raise 403 naming who may approve this claim's payout (used by every payout entry point)."""
    if not can_propose(user, ticket):
        roles = ", ".join(r.replace("_", " ") for r in sorted(PAYOUT_ROLES[proposal_action(ticket)]))
        raise HTTPException(403, f"This claim's payout must be approved by: {roles}")


def user_permissions(user: User) -> dict:
    """What this user's role may do, for the desk to decide which controls to show."""
    return {"payout": {action: user.role in roles for action, roles in PAYOUT_ROLES.items()},
            "payout_roles": {action: sorted(roles) for action, roles in PAYOUT_ROLES.items()}}


def excluded_users(r: RefundRequest, action: str) -> List[str]:
    """Four-eyes: people who already acted on this refund cannot perform the next step."""
    if action == APPROVE:
        return [r.requested_by_id]
    if action == EXECUTE:
        return [u for u in (r.requested_by_id, r.approved_by_id) if u]
    return []


def next_step(r: RefundRequest, user: User) -> Optional[dict]:
    """Structured description of what the refund is waiting for, and whether this user may do it."""
    action = NEXT_ACTION.get(r.status)
    if not action:
        return None
    excluded = excluded_users(r, action)
    return {"action": action, "roles": sorted(PAYOUT_ROLES[action]), "excluded_user_ids": excluded,
            "can_act": user.role in PAYOUT_ROLES[action] and user.id not in excluded}
