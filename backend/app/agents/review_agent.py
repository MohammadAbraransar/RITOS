"""Agent 9: Human review and governance coordinator.

For every case that needs a person: picks the reviewer queue from the arbiter's outcome, assigns the
least-loaded active reviewer with the right role, sets an SLA due time, and carries the arbiter's checklist,
required evidence and permitted actions. Human review never bypasses ledger checks, limits, authorization
or idempotency: those are enforced again by the action endpoints and finance.py.
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Ticket, TicketStatus, User, Role

def _roles(raw: str) -> list:
    return [r.strip() for r in raw.split(",") if r.strip()]


# Which roles may be assigned work in each review queue (REVIEW_QUEUE_*_ROLES settings)
QUEUE_ROLES = {
    "CS_2": _roles(settings.review_queue_cs2_roles),
    "CS_3": _roles(settings.review_queue_cs3_roles),
    "SUPERVISOR": _roles(settings.review_queue_supervisor_roles),
}
OPEN_STATUSES = [TicketStatus.NEW.value, TicketStatus.TRIAGED.value, TicketStatus.IN_REVIEW.value,
                 TicketStatus.AWAITING_INFORMATION.value, TicketStatus.ESCALATED.value, TicketStatus.REOPENED.value]


def _least_loaded(db: Session, roles) -> Optional[User]:
    load = (select(Ticket.assigned_to_id, func.count(Ticket.id).label("n"))
            .where(Ticket.status.in_(OPEN_STATUSES)).group_by(Ticket.assigned_to_id).subquery())
    return db.scalar(select(User).outerjoin(load, load.c.assigned_to_id == User.id)
                     .where(User.role.in_(roles), User.active.is_(True))
                     .order_by(func.coalesce(load.c.n, 0), User.email))


def coordinate_review(db: Session, ticket: Ticket, decision: Dict[str, Any]) -> Dict[str, Any]:
    if decision["next_action"] in ("AUTO_APPROVE", "AUTO_REJECT"):
        return {"review_required": False, "findings": "No human review needed for this outcome."}

    queue = "SUPERVISOR" if decision["next_action"] == "AWAIT_APPROVAL" else decision["assigned_desk"]
    reviewer = _least_loaded(db, QUEUE_ROLES.get(queue, []))
    sla_hours = {"P1": settings.review_sla_hours_p1, "P2": settings.review_sla_hours_p2}.get(ticket.priority, settings.review_sla_hours_default)
    due = datetime.now(timezone.utc) + timedelta(hours=sla_hours)
    if reviewer:
        ticket.assigned_to_id = reviewer.id
    return {
        "review_required": True,
        "queue": queue,
        "assigned_reviewer_id": reviewer.id if reviewer else None,
        "assigned_reviewer": reviewer.email if reviewer else None,
        "assigned_reviewer_name": reviewer.full_name if reviewer else None,
        "assigned_reviewer_role": reviewer.role if reviewer else None,
        # Why it went to this queue: what the ticket is waiting for (the desk turns this into plain words)
        "waiting_for": decision["next_action"],
        "sla_hours": sla_hours,
        "due_at": due.isoformat(),
        "required_evidence": decision.get("required_evidence", []),
        "reviewer_checklist": decision.get("reviewer_checklist", []),
        "permitted_actions": decision.get("permitted_actions", []),
        "separation_of_duties": "The reviewer who proposes a refund cannot approve or execute it.",
        "findings": (f"Assigned to {reviewer.email} in the {queue} queue, due within {sla_hours}h."
                     if reviewer else f"Queued for {queue}; no active reviewer with the required role."),
    }
