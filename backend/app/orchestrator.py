"""Central workflow orchestrator.

    intake ──► 8 specialist agents (each persisted as a WorkflowStep) ──► decision gate
                                                                         │
        AUTO_APPROVE ◄── CS-1, verified, no risk signals, under limit ───┤
        AWAIT_APPROVAL ◄── CS-1 but above limit / risk signals ──────────┤  run status WAITING_HUMAN
        AWAIT_PROOF ◄── CS-2 exception or missing proof ─────────────────┤  run status WAITING_HUMAN
        AUTO_REJECT ◄── CS-3 hard policy disqualifier ───────────────────┘

A human decision on a waiting ticket is recorded as its own run (trigger HUMAN_DECISION) that
closes the waiting run. Integrations (shopflow.py) turn the outcome into store callbacks.
"""
from __future__ import annotations
import time
from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.orm import Session
from .agents import AGENTS, ORCHESTRATOR, STEP_FUNCTIONS, PipelineState, is_eligible
from .config import settings
from .models import Ticket, TicketEvent, AuditLog, TicketStatus, WorkflowRun, WorkflowStep

AUTO_APPROVE = "AUTO_APPROVE"
AWAIT_APPROVAL = "AWAIT_APPROVAL"
AWAIT_PROOF = "AWAIT_PROOF"
AUTO_REJECT = "AUTO_REJECT"
MANUAL_REVIEW = "MANUAL_REVIEW"
WAITING_ACTIONS = {AWAIT_APPROVAL, AWAIT_PROOF, MANUAL_REVIEW}


def _now():
    return datetime.now(timezone.utc)


def decision_gate(s: PipelineState) -> tuple[str, str]:
    """Pick the next action from the agents' findings. Money only moves on AUTO_APPROVE."""
    t = s.ticket
    if t.decision_bucket == "NON_REFUNDABLE":
        return AUTO_REJECT, t.policy_evaluation_reason or "Hard policy disqualifier."
    if t.decision_bucket == "EXCEPTIONAL_PROOF_NEEDED":
        return AWAIT_PROOF, t.policy_evaluation_reason or "Proof or verification required."
    if not is_eligible(s):
        return AWAIT_APPROVAL, "Policy-compliant claim with risk or ledger signals; human approval required."
    limit = Decimal(str(settings.auto_approve_max_inr))
    if Decimal(str(t.claimed_amount)) > limit or s.store_facts.get("above_high_value_threshold"):
        return AWAIT_APPROVAL, f"Amount above the {t.currency} {limit:,.2f} auto-approval limit; human approval required."
    return AUTO_APPROVE, "Verified, policy-compliant, low-risk claim within the auto-approval limit."


def _close_waiting_runs(db: Session, ticket_id: str, new_status: str):
    for run in db.scalars(select(WorkflowRun).where(WorkflowRun.ticket_id == ticket_id, WorkflowRun.status == "WAITING_HUMAN")):
        run.status = new_status
        run.finished_at = _now()


def run_workflow(db: Session, ticket: Ticket, trigger: str = "MANUAL", actor_id: str | None = None) -> dict:
    """Run all 8 agents on a persisted ticket, persist each step, and apply the decision gate."""
    _close_waiting_runs(db, ticket.id, "SUPERSEDED")
    run = WorkflowRun(ticket_id=ticket.id, trigger=trigger, status="RUNNING", actor_id=actor_id)
    db.add(run)
    db.flush()

    state = PipelineState(db=db, ticket=ticket, actor_id=actor_id, evidence=dict(ticket.classification_evidence or {}))
    trace: list[dict] = []
    failed_step = None

    for seq, agent in enumerate(AGENTS, start=1):
        started = _now()
        clock = time.perf_counter()
        if failed_step:
            db.add(WorkflowStep(run_id=run.id, seq=seq, step_id=agent["id"], name=agent["name"], status="SKIPPED",
                                output={}, started_at=started, duration_ms=0))
            continue
        try:
            output = STEP_FUNCTIONS[agent["id"]](state)
            record = {"agent_id": agent["id"], "agent_name": agent["name"], "status": "COMPLETED", **output}
            status, error = "SUCCEEDED", None
        except Exception as exc:  # fail safe: a broken agent routes the ticket to a human, never to a refund
            failed_step = agent["id"]
            record = {"agent_id": agent["id"], "agent_name": agent["name"], "status": "FAILED",
                      "findings": f"Agent failed: {exc}"}
            status, error = "FAILED", f"{type(exc).__name__}: {exc}"
        duration = int((time.perf_counter() - clock) * 1000)
        record["duration_ms"] = duration
        trace.append(record)
        db.add(WorkflowStep(run_id=run.id, seq=seq, step_id=agent["id"], name=agent["name"], status=status,
                            output=record, error=error, started_at=started, duration_ms=duration))

    if failed_step:
        ticket.decision_bucket = "EXCEPTIONAL_PROOF_NEEDED"
        ticket.assigned_desk = "CS_2"
        ticket.policy_evaluation_reason = f"Automation step '{failed_step}' failed; routed to manual review."
        next_action, gate_reason = MANUAL_REVIEW, ticket.policy_evaluation_reason
    else:
        next_action, gate_reason = decision_gate(state)

    if next_action == AUTO_APPROVE:
        decision = "ELIGIBLE_FOR_AUTHORIZED_REFUND_REVIEW"
    elif state.verification.get("status") == "ALREADY_REFUNDED":
        decision = "NO_DUPLICATE_REFUND"
    elif next_action == AUTO_REJECT:
        decision = "REJECTED_BY_POLICY"
    else:
        decision = "HUMAN_REVIEW_REQUIRED"

    if ticket.status in {TicketStatus.NEW.value, TicketStatus.TRIAGED.value, TicketStatus.REOPENED.value}:
        ticket.status = TicketStatus.AWAITING_INFORMATION.value if next_action == AWAIT_PROOF else TicketStatus.TRIAGED.value

    run.next_action = next_action
    run.decision = decision
    run.status = "FAILED" if failed_step else ("WAITING_HUMAN" if next_action in WAITING_ACTIONS else "COMPLETED")
    run.error = f"Step {failed_step} failed" if failed_step else None
    run.finished_at = None if run.status == "WAITING_HUMAN" else _now()

    evidence = dict(state.evidence)
    evidence["agents"] = trace
    evidence["visual_analysis"] = state.vision
    evidence["idempotency_key"] = state.idempotency_key
    evidence["workflow"] = {"run_id": run.id, "trigger": trigger, "status": run.status,
                            "next_action": next_action, "gate_reason": gate_reason}
    ticket.classification_evidence = evidence

    risk = state.risk or {"tier": "UNKNOWN", "score": None, "signals": []}
    result = {
        "orchestrator": ORCHESTRATOR["id"],
        "run_id": run.id,
        "run_status": run.status,
        "trigger": trigger,
        "next_action": next_action,
        "gate_reason": gate_reason,
        "agents_run": [a["id"] for a in AGENTS],
        "agents_trace": trace,
        "ticket_id": ticket.id,
        "classification": {
            "category": ticket.category,
            "confidence": float(ticket.confidence or 0),
            "evidence": state.classification.get("evidence", []),
        },
        "transaction_verification": state.verification.get("status"),
        "duplicate_ticket_id": ticket.duplicate_of_id,
        "decision_bucket": ticket.decision_bucket,
        "assigned_desk": ticket.assigned_desk,
        "policy_evaluation_reason": ticket.policy_evaluation_reason,
        "customer_message_draft": ticket.customer_message_draft,
        "proof_required": ticket.proof_required,
        "proof_status": ticket.proof_status,
        "visual_evidence": state.vision,
        "risk_level": risk["tier"],
        "risk_score": risk["score"],
        "risk_signals": risk["signals"],
        "eligibility_candidate": next_action == AUTO_APPROVE,
        "decision": decision,
        "reason": gate_reason,
        "executed_refund": False,
        "priority": ticket.priority,
        "queue": ticket.queue,
        "idempotency_key": state.idempotency_key,
        "evaluated_at": _now().isoformat(),
    }

    db.add(TicketEvent(ticket_id=ticket.id, actor_id=actor_id, event_type="AUTOMATION_PIPELINE_COMPLETED", details=result))
    db.add(AuditLog(actor_id=actor_id, action="AUTOMATION_PIPELINE_COMPLETED", entity_type="ticket", entity_id=ticket.id,
                    details={"run_id": run.id, "trigger": trigger, "decision": decision, "next_action": next_action,
                             "bucket": ticket.decision_bucket, "desk": ticket.assigned_desk,
                             "risk_level": risk["tier"], "risk_score": risk["score"], "agents_count": len(trace)}))
    db.flush()
    return result


def record_human_decision(db: Session, ticket: Ticket, decision: str, actor_id: str, reason: str) -> WorkflowRun:
    """Resume a waiting ticket with a human decision (APPROVED / REJECTED / PROOF_ACCEPTED / PROOF_REQUESTED)."""
    _close_waiting_runs(db, ticket.id, "RESUMED")
    still_waiting = decision in {"PROOF_ACCEPTED", "PROOF_REQUESTED"}
    run = WorkflowRun(ticket_id=ticket.id, trigger="HUMAN_DECISION", actor_id=actor_id,
                      status="WAITING_HUMAN" if still_waiting else "COMPLETED",
                      next_action=AWAIT_APPROVAL if decision == "PROOF_ACCEPTED" else (AWAIT_PROOF if decision == "PROOF_REQUESTED" else None),
                      decision=decision, finished_at=None if still_waiting else _now())
    db.add(run)
    db.flush()
    db.add(WorkflowStep(run_id=run.id, seq=1, step_id="human_review", name="Human-in-the-loop Review", status="SUCCEEDED",
                        output={"decision": decision, "reason": reason, "actor_id": actor_id}, started_at=_now(), duration_ms=0))
    evidence = dict(ticket.classification_evidence or {})
    evidence["workflow"] = {"run_id": run.id, "trigger": "HUMAN_DECISION", "status": run.status,
                            "next_action": run.next_action, "gate_reason": reason}
    ticket.classification_evidence = evidence
    db.flush()
    return run


def workflow_view(run: WorkflowRun) -> dict:
    return {
        "id": run.id, "ticket_id": run.ticket_id, "trigger": run.trigger, "status": run.status,
        "next_action": run.next_action, "decision": run.decision, "actor_id": run.actor_id, "error": run.error,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "steps": [{"seq": st.seq, "step_id": st.step_id, "name": st.name, "status": st.status,
                   "duration_ms": st.duration_ms, "error": st.error,
                   "findings": (st.output or {}).get("findings")} for st in run.steps],
    }
