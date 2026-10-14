"""ShopFlow (store) integration.

Inbound:  store outbox events -> handle_event() -> intake / execution / human-decision handlers.
Context:  the store's /api/ritos/refund-tickets/{id}/context is the source of truth for order,
          payment, policy and customer facts. If the store has no such ticket (the storefront's
          demo claim cards), the authenticated event payload is used instead and no callbacks are sent.
Outbound: status / decision / notification calls are queued in the RITOS outbox (outbox.py).
"""
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, Dict, Any
import httpx
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import settings
from .models import Ticket, Transaction, TicketStatus, User, InboundEvent, Role
from .orchestrator import run_workflow, record_human_decision, AUTO_APPROVE, AUTO_REJECT, AWAIT_PROOF, AWAIT_APPROVAL
from .outbox import enqueue
from . import evidence_store
from .services import record_event, audit

logger = logging.getLogger("ritos.shopflow")
SOURCE = "SHOPFLOW"


def get_auth_headers() -> Dict[str, str]:
    return {"Authorization": f"Bearer {settings.ritos_api_key}", "Content-Type": "application/json"}


class StoreUnavailable(RuntimeError):
    """The store could not answer right now; the webhook returns 503 so the store's outbox retries."""


class UnknownStoreTicket(LookupError):
    """The store has no such ticket and demo claims are disabled: nothing is invented, the event is refused."""


def fetch_shopflow_context(ticket_id: str) -> Optional[Dict[str, Any]]:
    """Fetch the complete claim context dossier from the store.

    Returns None only when the store says the ticket does not exist (404: storefront demo claims).
    Raises StoreUnavailable on timeouts, connection errors and server errors, so a slow store is
    retried instead of being mistaken for a demo claim.
    """
    url = f"{settings.shopflow_base_url}/api/ritos/refund-tickets/{ticket_id}/context"
    try:
        with httpx.Client(timeout=settings.store_request_timeout_seconds) as client:
            resp = client.get(url, headers=get_auth_headers())
    except httpx.HTTPError as e:
        raise StoreUnavailable(f"ShopFlow context request failed: {e}") from e
    if resp.status_code == 200:
        return resp.json()
    if resp.status_code == 404:
        logger.info("ShopFlow has no ticket %s; using the event payload", ticket_id)
        return None
    raise StoreUnavailable(f"ShopFlow context for {ticket_id} returned HTTP {resp.status_code}")


def check_shopflow_health() -> Dict[str, Any]:
    url = f"{settings.shopflow_base_url}/api/health"
    try:
        with httpx.Client(timeout=settings.store_health_timeout_seconds) as client:
            resp = client.get(url)
            data = {}
            try:
                data = resp.json()
            except Exception:
                pass
            return {
                "connected": resp.is_success,
                "server_online": True,
                "database_online": data.get("database") == "connected",
                "status_code": resp.status_code,
                "data": data,
                "base_url": settings.shopflow_base_url
            }
    except Exception as e:
        return {"connected": False, "server_online": False, "database_online": False,
                "error": str(e), "base_url": settings.shopflow_base_url}


def _minor_to_inr(value) -> Decimal:
    return (Decimal(int(value or 0)) / Decimal(100)).quantize(Decimal("0.01"))


def _parse_dt(value) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _fields_from_context(ctx: Dict[str, Any]) -> Dict[str, Any]:
    tk, cust, order, product = ctx.get("ticket", {}), ctx.get("customer", {}), ctx.get("order", {}), ctx.get("product", {})
    txn, policy, facts, ledger = ctx.get("transaction", {}), ctx.get("refund_policy", {}), ctx.get("derived_facts", {}), ctx.get("refund_ledger", {})
    # A missing payment status is unknown (a person verifies it), never assumed paid.
    payment_status = str(txn.get("payment_status") or "UNKNOWN").upper()
    reason = str(tk.get("reason") or "").replace("_", " ").lower()
    return {
        "customer_id": cust.get("customer_id") or "shopflow_guest",
        "customer_name": cust.get("name"),
        "customer_email": cust.get("email"),
        "customer_phone": cust.get("phone"),
        "order_id": order.get("order_id"),
        "item_name": product.get("name") or "ShopFlow Product",
        "item_category": str(product.get("category") or "GENERAL").upper(),
        "claimed_amount": _minor_to_inr(tk.get("requested_amount_minor")),
        "currency": str(tk.get("currency") or settings.default_currency).upper(),
        "description": " — ".join(x for x in [reason, tk.get("description")] if x) or "ShopFlow refund request",
        "purchase_date": _parse_dt(order.get("delivered_at")) or _parse_dt(order.get("ordered_at")),
        "evidence_images": [ev.get("filename") for ev in ctx.get("evidence", []) if ev.get("filename")],
        "transaction": {
            "id": txn.get("transaction_id"),
            "amount": _minor_to_inr(ledger.get("transaction_amount_minor") or txn.get("amount_minor")),
            "refunded": _minor_to_inr(ledger.get("already_refunded_minor")),
            "status": "SUCCESSFUL" if payment_status in {"PAID", "CAPTURED", "SUCCESS", "SUCCESSFUL", "PARTIALLY_REFUNDED", "REFUNDED"}
                      else ("PENDING" if payment_status == "PENDING" else payment_status),
            "reference": txn.get("payment_id"),
        },
        "store_facts": {
            "reason": tk.get("reason"),
            "requested_action": tk.get("requested_action"),
            "within_return_window": facts.get("within_return_window"),
            "days_since_delivery": facts.get("days_since_delivery"),
            "return_window_days": policy.get("return_window_days"),
            "policy_version": policy.get("policy_version"),
            "evidence_required": bool(facts.get("evidence_required")),
            "evidence_count": int(facts.get("evidence_count") or 0),
            "claim_data_conflicts": list(facts.get("claim_data_conflicts") or []),
            "requested_exceeds_remaining": bool(facts.get("requested_exceeds_remaining")),
            "above_high_value_threshold": bool(facts.get("above_high_value_threshold")),
            "remaining_refundable_minor": ledger.get("remaining_refundable_minor"),
            "refund_tickets_30d": cust.get("refund_tickets_30d"),
            "refund_tickets_90d": cust.get("refund_tickets_90d"),
            "refund_tickets_lifetime": cust.get("refund_tickets_lifetime"),
            "product_id": product.get("product_id"),
            "sku": product.get("sku"),
            "product_name": product.get("name"),
            "delivery_status": order.get("delivery_status"),
            "delivered_at": order.get("delivered_at"),
            "account_age_days": cust.get("account_age_days"),
        },
    }


def _fields_from_payload(ticket_id: str, p: Dict[str, Any]) -> Dict[str, Any]:
    """Demo claims that don't exist in the store DB: trust the authenticated server-to-server payload."""
    order_id = p.get("order_id") or f"ORD-SF-{ticket_id[-6:]}"
    amount = Decimal(str(p.get("claimed_amount") or 0)).quantize(Decimal("0.01"))
    if amount <= 0 and p.get("claimed_amount_minor"):
        amount = _minor_to_inr(p["claimed_amount_minor"])
    return {
        "customer_id": p.get("customer_id") or "shopflow_guest",
        "customer_name": p.get("customer_name"),
        "customer_email": p.get("customer_email"),
        "customer_phone": p.get("customer_phone"),
        "order_id": order_id,
        "item_name": p.get("item_name") or "ShopFlow Product",
        "item_category": str(p.get("item_category") or "GENERAL").upper(),
        "claimed_amount": amount,
        "currency": str(p.get("currency") or settings.default_currency).upper(),
        "description": p.get("description") or f"ShopFlow return request for {order_id}",
        "purchase_date": _parse_dt(p.get("purchase_date")),
        "evidence_images": list(p.get("evidence_images") or []),
        "transaction": {"id": p.get("transaction_id") or f"TXN-{order_id}", "amount": None, "refunded": Decimal("0.00"),
                        "status": "SUCCESSFUL", "reference": f"SHOPFLOW-DEMO-{order_id}"},
        # Only the customer's selected reason is known for demo claims; policy and dates come from RITOS.
        "store_facts": {"reason": p.get("category")} if p.get("category") else None,
    }


def fetch_store_evidence(url: Optional[str]) -> Optional[bytes]:
    """Download one evidence file from the store (authenticated). None if unavailable: the photo then stays
    a reference and is reported not_assessable instead of being guessed."""
    if not url:
        return None
    try:
        with httpx.Client(timeout=settings.evidence_fetch_timeout_seconds) as client:
            resp = client.get(url, headers=get_auth_headers())
        return resp.content if resp.status_code == 200 else None
    except httpx.HTTPError as exc:
        logger.info("Evidence download failed for %s: %s", url, exc)
        return None


def _system_user_id(db: Session) -> Optional[str]:
    u = db.scalar(select(User).where(User.role == Role.ADMIN.value))
    return u.id if u else None


def is_store_linked(t: Ticket) -> bool:
    ev = t.classification_evidence or {}
    return ev.get("source") == SOURCE and bool(ev.get("store_linked"))


def fetch_store_data(ext_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Every store HTTP call an intake needs (claim context and photo bytes), made before any database work."""
    ctx = fetch_shopflow_context(ext_id)
    if not ctx:
        if not settings.demo_claims_enabled:
            raise UnknownStoreTicket(f"ShopFlow has no ticket {ext_id} (demo claims are disabled: DEMO_CLAIMS_ENABLED)")
        if not (payload.get("claimed_amount") or payload.get("claimed_amount_minor")):
            # A real store event carries no claim facts; never invent them.
            raise StoreUnavailable(f"No context for {ext_id} and the event carries no claim details")
    photos = []
    for ev in (ctx or {}).get("evidence", []):
        raw = fetch_store_evidence(ev.get("url"))
        if raw:
            photos.append((raw, ev.get("filename") or ev.get("evidence_id") or "evidence"))
    return {"ctx": ctx, "photos": photos}


def intake(db: Session, ext_id: str, payload: Dict[str, Any], event_id: Optional[str],
           store: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    store = store if store is not None else fetch_store_data(ext_id, payload)
    ctx = store["ctx"]
    f = _fields_from_context(ctx) if ctx else _fields_from_payload(ext_id, payload)

    # Ledger entry: mirrors the store's payment record (store-linked) or the authenticated payload (demo).
    txf = f["transaction"]
    tx = db.get(Transaction, txf["id"])
    if not tx:
        tx = Transaction(id=txf["id"], customer_id=f["customer_id"], order_id=f["order_id"],
                         amount=txf["amount"] if txf["amount"] is not None else f["claimed_amount"],
                         currency=f["currency"], payment_status=txf["status"], refunded_amount=txf["refunded"],
                         provider_reference=txf["reference"])
        db.add(tx)
    elif ctx:
        tx.refunded_amount = txf["refunded"]
        tx.payment_status = txf["status"]
    elif not db.scalar(select(Ticket).where(Ticket.transaction_id == tx.id, Ticket.item_name == f["item_name"])):
        # Demo payloads don't carry the order total: a new item on a known demo order adds its price.
        tx.amount = Decimal(str(tx.amount)) + f["claimed_amount"]
    db.flush()

    t = db.scalar(select(Ticket).where(Ticket.ticket_number == ext_id))
    if t and t.order_id != f["order_id"]:
        # The store reused this ticket number for a different order (e.g. its demo data was reset):
        # archive the old RITOS ticket under a suffixed number instead of merging two different claims.
        old_number = f"{ext_id}~{t.id[:6]}"[:24]
        record_event(db, t.id, None, "STORE_TICKET_NUMBER_REUSED", {"archived_as": old_number, "new_order_id": f["order_id"]})
        t.ticket_number = old_number
        db.flush()
        t = None
    trigger = "STORE_RESEND" if t else "INTAKE"
    evidence = {
        "source": SOURCE,
        "store_linked": bool(ctx),
        "shopflow_ticket_id": ext_id,
        "event_id": event_id,
        "evidence_images": f["evidence_images"],
        "store_facts": f["store_facts"],
        "purchase_date_source": "STORE_ORDER" if f["purchase_date"] else None,
    }
    if not t:
        t = Ticket(ticket_number=ext_id, customer_id=f["customer_id"], transaction_id=tx.id, status=TicketStatus.NEW.value)
        db.add(t)
    for key in ["order_id", "item_name", "item_category", "claimed_amount", "description", "purchase_date",
                "customer_name", "customer_email", "customer_phone"]:
        setattr(t, key, f[key])
    t.currency = f["currency"]
    t.classification_evidence = {**(t.classification_evidence or {}), **evidence}
    db.flush()

    # Real photo bytes from the store go into private evidence storage (validated, hashed, lifecycle-tracked).
    for raw, filename in store["photos"]:
        evidence_store.save_evidence(db, t, raw, filename, source="STORE")

    system_user_id = _system_user_id(db)
    result = run_workflow(db, t, trigger=trigger, actor_id=system_user_id)
    callbacks = apply_next_action(db, t, result)
    record_event(db, t.id, system_user_id, "SHOPFLOW_TICKET_PROCESSED",
                 {"event_id": event_id, "next_action": result["next_action"], "store_linked": bool(ctx)})
    audit(db, system_user_id, "SHOPFLOW_TICKET_PROCESSED", "ticket", t.id,
          {"shopflow_ticket_id": ext_id, "next_action": result["next_action"], "desk": t.assigned_desk})

    return {
        "ticket_id": ext_id,
        "ritos_ticket_id": t.id,
        "ritos_ticket_number": t.ticket_number,
        "store_linked": bool(ctx),
        "assigned_desk": t.assigned_desk,
        "decision_bucket": t.decision_bucket,
        "next_action": result["next_action"],
        "decision": _store_decision_for(result["next_action"]),
        "refund_amount_minor": int(Decimal(str(t.claimed_amount)) * 100),
        "policy_evaluation_reason": t.policy_evaluation_reason,
        "customer_message_draft": t.customer_message_draft,
        "proof_status": t.proof_status,
        "workflow_run_id": result["run_id"],
        "routing_steps": result.get("routing_steps"),
        "agents_trace": result["agents_trace"],
        "visual_evidence": result["visual_evidence"],
        "classification_evidence": t.classification_evidence,
        "callbacks": callbacks,
    }


def _store_decision_for(next_action: str) -> str:
    return {AUTO_APPROVE: "APPROVED", AUTO_REJECT: "REJECTED"}.get(next_action, "HUMAN_REVIEW")


def queue_decision(db: Session, t: Ticket, decision: str, reason: str, processed_by: str) -> Dict[str, Any]:
    approved = decision == "APPROVED"
    amount_minor = int(Decimal(str(t.claimed_amount)) * 100) if approved else 0
    wf = (t.classification_evidence or {}).get("workflow", {})
    payload = {
        "ticket_id": t.ticket_number,
        "decision": decision,
        "refund_percentage": 100 if approved else 0,
        "refund_amount_minor": amount_minor,
        "reason": reason[:1000],
        # Routing is decided by fixed rules (or a person), not by a probability, so the store's required score is 1.0.
        "confidence_score": 1.0,
        "processed_by": processed_by,
        "requires_human_review": False,
        "agent_trace": {
            "workflow_run_id": wf.get("run_id"),
            "assigned_desk": t.assigned_desk,
            "decision_bucket": t.decision_bucket,
            "payment_verification": t.payment_verification,
            "policy_reason": t.policy_evaluation_reason,
            "agents": [{"agent": a.get("agent_name"), "findings": a.get("findings")}
                       for a in (t.classification_evidence or {}).get("agents", [])],
        },
    }
    msg = enqueue(db, t.id, "DECISION", "/api/ritos/refund-decision", payload, f"ritos-decision-{t.id}")
    t.refund_status = "APPROVED" if approved else "REJECTED"
    if not approved:
        t.status = TicketStatus.REJECTED.value
    t.refund_decided_at = datetime.now(timezone.utc)
    return {"kind": "DECISION", "decision": decision, "outbox_id": msg.id}


def queue_review_hold(db: Session, t: Ticket, next_action: str) -> list:
    """Tell the store a person on the RITOS desk must decide (HUMAN_REVIEW) and notify the shopper of what is needed."""
    out = [{"kind": "STATUS", "outbox_id": enqueue(db, t.id, "STATUS", f"/api/ritos/refund-tickets/{t.ticket_number}/status",
                                                     {"status": "HUMAN_REVIEW"}, f"ritos-status-{t.id}").id}]
    if next_action == AWAIT_PROOF:
        title, body = "Photo proof needed", (t.customer_message_draft or "Please upload photos of the item and packaging.")
    elif next_action == AWAIT_APPROVAL:
        title, body = "Refund under review", "Your refund request passed automated checks and is with our team for final approval."
    else:
        # Manual review: automated checks did not clear the claim, so do not say they passed.
        title, body = "Refund under review", "Our team is reviewing your refund request and will update you here."
    msg = enqueue(db, t.id, "NOTIFICATION", "/api/ritos/notifications",
                  {"ticket_id": t.ticket_number, "title": title, "body": body[:1000], "channel": "IN_APP"},
                  f"ritos-notify-{t.id}-{next_action}")
    out.append({"kind": "NOTIFICATION", "outbox_id": msg.id})
    return out


def apply_next_action(db: Session, t: Ticket, result: Dict[str, Any]) -> list:
    if not is_store_linked(t):
        return [{"kind": "NONE", "note": "Demo claim not in store DB; decision kept in RITOS only."}]
    na = result["next_action"]
    if na == AUTO_APPROVE:
        return [queue_decision(db, t, "APPROVED", result["gate_reason"], "RITOS_ORCHESTRATOR")]
    if na == AUTO_REJECT:
        return [queue_decision(db, t, "REJECTED", t.policy_evaluation_reason or result["gate_reason"], "RITOS_ORCHESTRATOR")]
    return queue_review_hold(db, t, na)


def finalize_human_decision(db: Session, t: Ticket, decision: str, actor: User, reason: str) -> Dict[str, Any]:
    """A desk agent approved or rejected a waiting ticket: record it and tell the store."""
    record_human_decision(db, t, decision, actor.id, reason)
    if not is_store_linked(t):
        return {"store_callback": None}
    return {"store_callback": queue_decision(db, t, decision, f"{reason} (decided by {actor.email})", f"RITOS_HUMAN:{actor.email}")}


def _on_execution(db: Session, ext_id: str, payload: Dict[str, Any], success: bool) -> Dict[str, Any]:
    t = db.scalar(select(Ticket).where(Ticket.ticket_number == ext_id))
    if not t:
        return {"status": "IGNORED", "reason": "unknown ticket"}
    if success:
        amount = _minor_to_inr(payload.get("amount_minor"))
        tx = db.get(Transaction, t.transaction_id)
        if tx and t.refund_status != "REFUNDED":
            tx.refunded_amount = (Decimal(str(tx.refunded_amount)) + amount).quantize(Decimal("0.01"))
        t.refund_status = "REFUNDED"
        t.status = TicketStatus.RESOLVED.value
        record_event(db, t.id, None, "STORE_REFUND_EXECUTED", {"refund_id": payload.get("refund_id"), "amount": str(amount)})
    else:
        t.refund_status = "RECONCILIATION_REQUIRED"
        t.status = TicketStatus.ESCALATED.value
        record_event(db, t.id, None, "STORE_REFUND_FAILED", {"refund_id": payload.get("refund_id")})
    return {"status": "UPDATED", "ticket": t.ticket_number, "refund_status": t.refund_status}


def _on_store_human_decision(db: Session, ext_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    t = db.scalar(select(Ticket).where(Ticket.ticket_number == ext_id))
    if not t:
        return {"status": "IGNORED", "reason": "unknown ticket"}
    decision = str(payload.get("decision") or "")
    record_human_decision(db, t, decision, payload.get("analyst_id") or "store_analyst", "Decided in the store admin console")
    if decision == "REJECTED":
        t.status, t.refund_status = TicketStatus.REJECTED.value, "REJECTED"
    elif decision:
        t.refund_status = "APPROVED"
    return {"status": "UPDATED", "ticket": t.ticket_number, "decision": decision}


def handle_event(db: Session, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for store webhooks. Idempotent per event_id."""
    event_id = payload.get("event_id")
    event_type = payload.get("event_type") or "refund.ticket.created"
    ext_id = str(payload["ticket_id"])
    if event_id:
        prior = db.get(InboundEvent, event_id)
        if prior:
            return {**(prior.result or {}), "replayed": True}

    # New evidence on an existing store ticket re-runs the same intake (the store context now includes it).
    if event_type in ("refund.ticket.created", "refund.evidence.added"):
        # End the read-only transaction first: no pooled connection is held while the store is called.
        db.rollback()
        result = intake(db, ext_id, payload, event_id, fetch_store_data(ext_id, payload))
    elif event_type == "refund.execution.completed":
        result = _on_execution(db, ext_id, payload, success=True)
    elif event_type == "refund.execution.failed":
        result = _on_execution(db, ext_id, payload, success=False)
    elif event_type == "refund.human.decided":
        result = _on_store_human_decision(db, ext_id, payload)
    else:
        result = {"status": "ACKNOWLEDGED", "event_type": event_type}

    if event_id:
        summary = {k: v for k, v in result.items() if k not in {"agents_trace", "visual_evidence", "classification_evidence"}}
        db.add(InboundEvent(id=event_id, source=SOURCE, event_type=event_type, external_ticket_id=ext_id, result=summary))
    try:
        db.commit()
    except IntegrityError:
        # The same event was delivered concurrently and the other request committed first:
        # discard this attempt entirely and answer with the stored result.
        db.rollback()
        prior = db.get(InboundEvent, event_id) if event_id else None
        if not prior:
            raise
        return {**(prior.result or {}), "replayed": True}
    return result


# Backwards-compatible name used by the sync endpoint.
def process_shopflow_event(db: Session, ticket_id: str, event_id: Optional[str] = None,
                           fallback_payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = {**(fallback_payload or {}), "ticket_id": ticket_id, "event_id": event_id,
               "event_type": (fallback_payload or {}).get("event_type") or "refund.ticket.created"}
    return handle_event(db, payload)
