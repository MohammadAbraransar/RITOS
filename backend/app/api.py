from datetime import datetime, timezone
import hmac
from decimal import Decimal
from uuid import uuid4
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, Header, Request
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import select, func, desc
from .database import get_db
from .models import (
    User, Ticket, TicketComment, TicketEvent, Transaction, RefundRequest, RefundStatus, TicketStatus,
    AuditLog, Role, DecisionBucket, AssignedDesk, LedgerAccount, LedgerJournal, LedgerEntry,
    GatewaySettlementAttempt, Product, ProductVariant, ProductReferenceImage, EvidenceFile, ReturnPolicy,
    WorkflowRun, OutboxMessage
)
from .schemas import (
    LoginIn, TicketCreate, CommentCreate, TicketUpdate, RefundCreate, RefundDecision,
    CS1DecisionIn, ProofRequestIn, RejectionNoticeIn, EcommerceTicketIn,
    EvidenceUploadIn, EvidenceVerifyIn, SettlementExecuteIn
)
from .security import verify_password, create_access_token, get_current_user, require_roles
from .services import (
    classify, calculate_priority, find_duplicate,
    record_event, audit, refund_key, ROUTES, generate_customer_message_draft
)
from .agents import AGENTS, ORCHESTRATOR, run_ticket_pipeline
from .config import settings
from .orchestrator import run_workflow, record_human_decision, workflow_view
from .outbox import deliver_due, retry as retry_outbox, outbox_view, enqueue
from .shopflow import is_store_linked, finalize_human_decision, apply_next_action
from .finance import FinancialSettlementService, ensure_default_accounts, gateway_status
import base64
from . import evidence_store
from .vision import vision_status
from .proof_reader import verify_product_identity_and_defect, decode_image_data

router = APIRouter(prefix="/api/v1")

STAFF_ROLES = (Role.SUPPORT.value, Role.SUPERVISOR.value, Role.ADMIN.value, Role.REFUNDS.value, Role.RISK.value,
               Role.FINANCE.value, Role.CS_1.value, Role.CS_2.value, Role.CS_3.value)

def user_view(u: User):
    return {"id":u.id,"email":u.email,"full_name":u.full_name,"role":u.role}

def ticket_view(t: Ticket, include_private=False):
    comments = []
    for c in sorted(t.comments, key=lambda x:x.created_at):
        if not c.internal or include_private:
            comments.append({"id":c.id,"author_id":c.author_id,"body":c.body,"internal":c.internal,"created_at":c.created_at.isoformat()})
    return {"id":t.id,"ticket_number":t.ticket_number,"customer_id":t.customer_id,"transaction_id":t.transaction_id,
      "order_id":t.order_id,"claimed_amount":float(t.claimed_amount),"currency":t.currency,"description":t.description,
      "category":t.category,"confidence":float(t.confidence),"priority":t.priority,"queue":t.queue,"status":t.status,
      "payment_verification":t.payment_verification,"refund_status":t.refund_status,"duplicate_of_id":t.duplicate_of_id,
      "assigned_to_id":t.assigned_to_id,"recommended_action":t.recommended_action,"classification_evidence":t.classification_evidence,
      "decision_bucket":getattr(t,"decision_bucket","EXCEPTIONAL_PROOF_NEEDED"),
      "assigned_desk":getattr(t,"assigned_desk","CS_2"),
      "customer_name":getattr(t,"customer_name",None),
      "customer_phone":getattr(t,"customer_phone",None),
      "customer_email":getattr(t,"customer_email",None),
      "item_name":getattr(t,"item_name",None),
      "item_category":getattr(t,"item_category","GENERAL"),
      "purchase_date":t.purchase_date.isoformat() if getattr(t,"purchase_date",None) else None,
      "customer_message_draft":getattr(t,"customer_message_draft",None),
      "policy_evaluation_reason":getattr(t,"policy_evaluation_reason",None),
      "proof_required":getattr(t,"proof_required",None),
      "proof_status":getattr(t,"proof_status","NOT_REQUESTED"),
      "proof_request_sent_at":t.proof_request_sent_at.isoformat() if getattr(t,"proof_request_sent_at",None) else None,
      "rejection_notice_sent_at":t.rejection_notice_sent_at.isoformat() if getattr(t,"rejection_notice_sent_at",None) else None,
      "refund_decided_at":t.refund_decided_at.isoformat() if getattr(t,"refund_decided_at",None) else None,
      "created_at":t.created_at.isoformat(),"updated_at":t.updated_at.isoformat(),"comments":comments}

def store_decision(db: Session, ticket: Ticket, user: User, decision: str, reason: str) -> dict | None:
    """Human approve/reject on a store-linked ticket: the store executes the refund, RITOS records the decision."""
    if not is_store_linked(ticket):
        return None
    if ticket.refund_status in {"APPROVED", "REJECTED", "REFUNDED"}:
        raise HTTPException(409, f"Decision already sent to the store ({ticket.refund_status})")
    result = finalize_human_decision(db, ticket, decision, user, reason)
    if decision == "APPROVED":
        ticket.status = TicketStatus.IN_REVIEW.value
        ticket.refund_decided_by_id = user.id
    event = "STORE_REFUND_APPROVED_BY_AGENT" if decision == "APPROVED" else "STORE_REFUND_REJECTED_BY_AGENT"
    record_event(db, ticket.id, user.id, event, {"reason": reason})
    audit(db, user.id, event, "ticket", ticket.id, {"reason": reason})
    db.commit()
    db.refresh(ticket)
    return {"status": "DECISION_QUEUED_FOR_STORE", "decision": decision, **result, "ticket": ticket_view(ticket)}

def rerun_workflow(db: Session, ticket: Ticket, user: User, trigger: str = "MANUAL_RERUN") -> dict:
    result = run_workflow(db, ticket, trigger=trigger, actor_id=user.id)
    if is_store_linked(ticket) and ticket.refund_status not in {"APPROVED", "REJECTED", "REFUNDED"}:
        result["callbacks"] = apply_next_action(db, ticket, result)
    return result

def require_cs1_bucket(ticket: Ticket):
    if ticket.decision_bucket != "GENUINE_REFUNDABLE":
        raise HTTPException(409, f"Only CS-1 (GENUINE_REFUNDABLE) tickets can be refunded; this ticket is {ticket.decision_bucket}")

def visible_ticket_query(db, user):
    q = select(Ticket)
    if user.role == Role.CUSTOMER.value:
        q = q.where(Ticket.customer_id == user.id)
    elif user.role == Role.CS_1.value:
        q = q.where(Ticket.assigned_desk == AssignedDesk.CS_1.value)
    elif user.role == Role.CS_2.value:
        q = q.where(Ticket.assigned_desk == AssignedDesk.CS_2.value)
    elif user.role == Role.CS_3.value:
        q = q.where(Ticket.assigned_desk == AssignedDesk.CS_3.value)
    return q.order_by(desc(Ticket.created_at))

@router.post("/auth/login")
def login(payload: LoginIn, db: Session=Depends(get_db)):
    user=db.scalar(select(User).where(User.email==payload.email.lower().strip()))
    if not user or not user.active or not verify_password(payload.password,user.password_hash):
        raise HTTPException(401,"Incorrect email or password")
    audit(db,user.id,"LOGIN","user",user.id,{"role":user.role})
    db.commit()
    return {"access_token":create_access_token(user),"token_type":"bearer","user":user_view(user)}

@router.get("/auth/me")
def me(user: User=Depends(get_current_user)): return user_view(user)

@router.post("/auth/logout")
def logout(user: User=Depends(get_current_user)):
    # Stateless access tokens expire naturally; production should add a revocation/session store.
    return {"message":"Signed out on client. Access token expires automatically."}

@router.post("/tickets")
def create_ticket(payload: TicketCreate, db: Session=Depends(get_db), user: User=Depends(require_roles(Role.CUSTOMER.value))):
    currency=(payload.currency or settings.default_currency).upper()
    if currency not in settings.currencies: raise HTTPException(422,"Unsupported currency")
    # Ledger, ownership and duplicate checks are Agent 1's job; intake only reads the customer's own transaction.
    tx=db.get(Transaction,payload.transaction_id)
    own_tx=tx if tx and tx.customer_id==user.id else None
    triage=classify(payload.description)
    priority=calculate_priority(triage["category"],payload.description)
    t=Ticket(ticket_number=f"RIT-{datetime.now(timezone.utc):%y%m%d}-{uuid4().hex[:6].upper()}",
       customer_id=user.id,transaction_id=payload.transaction_id,order_id=payload.order_id,
       claimed_amount=payload.claimed_amount,currency=currency,description=payload.description,
       category=triage["category"],confidence=triage["confidence"],priority=priority,
       queue=ROUTES.get(triage["category"],"Manual Triage"),status=TicketStatus.TRIAGED.value,
       item_name=payload.item_name or (own_tx.order_id if own_tx else "Customer Item"),
       item_category=payload.item_category or "GENERAL",
       customer_name=user.full_name or "Portal Customer",
       customer_email=user.email,
       # The return window counts from the ledger's capture date, never from a date the customer types.
       purchase_date=own_tx.created_at if own_tx else None,
       payment_verification="PENDING_VERIFICATION",refund_status=(own_tx.payment_status if own_tx else "UNKNOWN"),
       recommended_action=triage["recommended_action"],
       classification_evidence={
           "matched_terms":triage["evidence"],
           "classifier":"rules-v1",
           "purchase_date_source":"LEDGER_CAPTURE" if own_tx else None,
           # Kept for reviewers only; policy never reads it.
           "customer_reported_purchase_date":payload.purchase_date,
           "evidence_images": payload.evidence_images or []
       })
    db.add(t); db.flush()
    record_event(db,t.id,user.id,"TICKET_CREATED",{"ticket_number":t.ticket_number})
    record_event(db,t.id,None,"TRIAGE_COMPLETED",{"category":t.category,"priority":t.priority,"queue":t.queue})
    audit(db,user.id,"TICKET_CREATED","ticket",t.id,{"ticket_number":t.ticket_number})
    automation_result = run_ticket_pipeline(db, t, None)
    db.commit(); db.refresh(t)
    response = ticket_view(t)
    response["automation"] = automation_result
    return response

@router.post("/integrations/ecommerce/tickets", status_code=202)
def ecommerce_ticket_webhook(payload: dict, x_ritos_webhook_secret: str | None = Header(default=None), db: Session=Depends(get_db)):
    """Authenticated server-to-server intake for an ecommerce platform.

    The ecommerce backend must call this endpoint; never expose the shared secret in browser code.
    A known customer email and a transaction already present in the trusted transaction source are required.
    """
    expected = settings.ecommerce_webhook_secret
    if not expected or expected.startswith("replace-") or not hmac.compare_digest(x_ritos_webhook_secret or "", expected):
        raise HTTPException(401, "Invalid ecommerce integration credential")
    required = ("customer_email", "transaction_id", "claimed_amount", "description")
    missing = [key for key in required if payload.get(key) in (None, "")]
    if missing:
        raise HTTPException(422, {"message":"Missing required fields", "fields":missing})
    email = str(payload["customer_email"]).strip().lower()
    customer = db.scalar(select(User).where(User.email == email, User.role == Role.CUSTOMER.value, User.active.is_(True)))
    if not customer:
        raise HTTPException(404, "Customer identity is not mapped; provision or map the customer before intake")
    try:
        amount = Decimal(str(payload["claimed_amount"]))
    except Exception:
        raise HTTPException(422, "claimed_amount must be a valid decimal amount")
    if not amount.is_finite() or amount <= 0:
        raise HTTPException(422, "claimed_amount must be greater than zero")
    currency = str(payload.get("currency") or settings.default_currency).upper()
    if currency not in settings.currencies:
        raise HTTPException(422, "Unsupported currency")
    transaction_id = str(payload["transaction_id"]).strip()
    tx = db.get(Transaction, transaction_id)
    if not tx:
        # Do not accept ecommerce-supplied payment facts as proof of payment.
        raise HTTPException(409, "Transaction is not available in the trusted transaction source")
    description = str(payload["description"]).strip()
    if len(description) < 8 or len(description) > 5000:
        raise HTTPException(422, "description must be between 8 and 5000 characters")
    own_tx = tx if tx.customer_id == customer.id else None
    triage = classify(description)
    priority = calculate_priority(triage["category"], description)
    t = Ticket(ticket_number=f"RIT-{datetime.now(timezone.utc):%y%m%d}-{uuid4().hex[:6].upper()}",
        customer_id=customer.id, transaction_id=transaction_id, order_id=payload.get("order_id"),
        claimed_amount=amount, currency=currency, description=description, category=triage["category"],
        confidence=triage["confidence"], priority=priority, queue=ROUTES.get(triage["category"], "Manual Triage"),
        status=TicketStatus.TRIAGED.value, payment_verification="PENDING_VERIFICATION",
        refund_status=(own_tx.payment_status if own_tx else "UNKNOWN"),
        purchase_date=own_tx.created_at if own_tx else None, recommended_action=triage["recommended_action"],
        classification_evidence={"matched_terms":triage["evidence"], "classifier":"rules-v1", "source":"ecommerce_webhook",
                                 "purchase_date_source":"LEDGER_CAPTURE" if own_tx else None})
    db.add(t); db.flush()
    record_event(db,t.id,None,"ECOMMERCE_TICKET_RECEIVED",{"source":"ecommerce_webhook"})
    audit(db,None,"ECOMMERCE_TICKET_RECEIVED","ticket",t.id,{"source":"ecommerce_webhook"})
    automation_result = run_ticket_pipeline(db,t,None)
    db.commit(); db.refresh(t)
    response = ticket_view(t)
    response["automation"] = automation_result
    return response


@router.get("/tickets")
def list_tickets(status: str|None=None, priority: str|None=None, queue: str|None=None,
                 q: str|None=None, page: int=Query(1,ge=1), page_size: int=Query(25,ge=1,le=100),
                 db: Session=Depends(get_db), user: User=Depends(get_current_user)):
    stmt=visible_ticket_query(db,user)
    if status: stmt=stmt.where(Ticket.status==status)
    if priority: stmt=stmt.where(Ticket.priority==priority)
    if queue: stmt=stmt.where(Ticket.queue==queue)
    if q:
        like=f"%{q}%"
        stmt=stmt.where((Ticket.ticket_number.ilike(like))|(Ticket.transaction_id.ilike(like))|(Ticket.description.ilike(like)))
    count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total = db.scalar(count_stmt) or 0
    rows = db.scalars(stmt.options(selectinload(Ticket.comments)).offset((page-1)*page_size).limit(page_size)).all()
    staff=user.role != Role.CUSTOMER.value
    return {"items":[ticket_view(t,include_private=staff) for t in rows],"total":total,"page":page,"page_size":page_size}

@router.get("/tickets/{ticket_id}")
def get_ticket(ticket_id: str, db: Session=Depends(get_db), user: User=Depends(get_current_user)):
    t=db.scalar(select(Ticket).where(Ticket.id==ticket_id).options(selectinload(Ticket.comments)))
    if not t: raise HTTPException(404,"Ticket not found")
    if user.role==Role.CUSTOMER.value and t.customer_id != user.id: raise HTTPException(404,"Ticket not found")
    return ticket_view(t,include_private=user.role != Role.CUSTOMER.value)

@router.patch("/tickets/{ticket_id}")
def update_ticket(ticket_id: str, payload: TicketUpdate, db: Session=Depends(get_db),
                  user: User=Depends(require_roles(Role.SUPPORT.value,Role.SUPERVISOR.value,Role.ADMIN.value,Role.REFUNDS.value,Role.RISK.value))):
    t=db.get(Ticket,ticket_id)
    if not t: raise HTTPException(404,"Ticket not found")
    data=payload.model_dump(exclude_unset=True)
    if "priority" in data and data["priority"] not in {"P1","P2","P3","P4"}: raise HTTPException(422,"Invalid priority")
    if "status" in data and data["status"] not in {s.value for s in TicketStatus}: raise HTTPException(422,"Invalid status")
    if t.category=="UNAUTHORIZED_PAYMENT" and data.get("priority") in {"P3","P4"}:
        raise HTTPException(409,"Security-critical ticket priority cannot be downgraded through this endpoint")
    old={k:getattr(t,k) for k in data}
    for k,v in data.items(): setattr(t,k,v)
    record_event(db,t.id,user.id,"TICKET_UPDATED",{"before":old,"after":data})
    audit(db,user.id,"TICKET_UPDATED","ticket",t.id,data)
    db.commit(); db.refresh(t)
    return ticket_view(t,include_private=True)

@router.post("/tickets/{ticket_id}/comments")
def add_comment(ticket_id: str,payload: CommentCreate,db: Session=Depends(get_db),user: User=Depends(get_current_user)):
    t=db.get(Ticket,ticket_id)
    if not t or (user.role==Role.CUSTOMER.value and t.customer_id!=user.id): raise HTTPException(404,"Ticket not found")
    if payload.internal and user.role in {Role.CUSTOMER.value,Role.AUDITOR.value}: raise HTTPException(403,"Internal notes are restricted")
    c=TicketComment(ticket_id=t.id,author_id=user.id,body=payload.body,internal=payload.internal)
    db.add(c); db.flush()
    record_event(db,t.id,user.id,"COMMENT_ADDED",{"internal":payload.internal})
    audit(db,user.id,"COMMENT_ADDED","ticket",t.id,{"internal":payload.internal})
    db.commit()
    return {"id":c.id,"body":c.body,"internal":c.internal,"created_at":c.created_at.isoformat()}

@router.post("/tickets/{ticket_id}/escalate")
def escalate(ticket_id:str,db:Session=Depends(get_db),user:User=Depends(require_roles(Role.SUPPORT.value,Role.SUPERVISOR.value,Role.ADMIN.value,Role.RISK.value))):
    t=db.get(Ticket,ticket_id)
    if not t: raise HTTPException(404,"Ticket not found")
    t.status=TicketStatus.ESCALATED.value; t.priority="P1" if t.category=="UNAUTHORIZED_PAYMENT" else "P2"; t.queue="Escalation Queue"
    record_event(db,t.id,user.id,"TICKET_ESCALATED",{"queue":t.queue,"priority":t.priority})
    audit(db,user.id,"TICKET_ESCALATED","ticket",t.id,{})
    db.commit(); db.refresh(t)
    return ticket_view(t,include_private=True)

@router.get("/queues")
def queues(db:Session=Depends(get_db),user:User=Depends(require_roles(Role.SUPPORT.value,Role.SUPERVISOR.value,Role.ADMIN.value,Role.REFUNDS.value,Role.RISK.value,Role.FINANCE.value))):
    rows=db.execute(select(Ticket.queue,func.count(Ticket.id)).group_by(Ticket.queue)).all()
    return [{"queue":q,"count":n} for q,n in rows]

@router.get("/refunds")
def refunds(db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    stmt=select(RefundRequest).order_by(desc(RefundRequest.created_at))
    if user.role==Role.CUSTOMER.value:
        stmt=stmt.join(Ticket,RefundRequest.ticket_id==Ticket.id).where(Ticket.customer_id==user.id)
    rows=db.scalars(stmt).all()
    return [{"id":r.id,"ticket_id":r.ticket_id,"transaction_id":r.transaction_id,"amount":float(r.amount),"currency":r.currency,
      "status":r.status,"reason":r.reason,"provider_reference":r.provider_reference,"created_at":r.created_at.isoformat()} for r in rows]

def propose_refund(db: Session, t: Ticket, user: User, amount: Decimal, reason: str) -> dict:
    """Create (or return) the refund proposal for a ticket. Money moves only after an independent approval
    and a separate execution (finance.py), never from this call."""
    tx = db.get(Transaction, t.transaction_id)
    if not tx or t.payment_verification != "VERIFIED":
        raise HTTPException(409, "Refund cannot be proposed until transaction ownership, amount and payment are verified")
    amount = Decimal(str(amount)).quantize(Decimal("0.01"))
    key = refund_key(t.id, amount, t.currency)
    existing = db.scalar(select(RefundRequest).where(RefundRequest.idempotency_key == key))
    if existing:
        return {"id": existing.id, "status": existing.status, "idempotent_replay": True}
    remaining = Decimal(str(tx.amount)) - Decimal(str(tx.refunded_amount))
    pending = db.scalars(select(RefundRequest).where(RefundRequest.transaction_id == tx.id, RefundRequest.status.in_([
        RefundStatus.PENDING_APPROVAL.value, RefundStatus.APPROVED.value, RefundStatus.PROCESSING.value,
        RefundStatus.RECONCILIATION_REQUIRED.value]))).all()
    remaining -= sum((Decimal(str(r.amount)) for r in pending), Decimal("0"))
    if amount <= 0 or amount > remaining:
        raise HTTPException(409, "Requested amount exceeds remaining refundable balance")
    r = RefundRequest(ticket_id=t.id, transaction_id=tx.id, requested_by_id=user.id, amount=amount, currency=t.currency,
                      status=RefundStatus.PENDING_APPROVAL.value, reason=reason, idempotency_key=key)
    db.add(r); db.flush()
    t.refund_status = RefundStatus.PENDING_APPROVAL.value
    t.status = TicketStatus.IN_REVIEW.value
    record_event(db, t.id, user.id, "REFUND_PROPOSED", {"refund_id": r.id, "amount": str(amount)})
    audit(db, user.id, "REFUND_PROPOSED", "refund", r.id, {"amount": str(amount), "currency": t.currency, "reason": reason})
    db.commit(); db.refresh(r)
    return {"id": r.id, "status": r.status, "amount": float(r.amount), "currency": r.currency,
            "next_step": "Awaiting approval by a different finance approver, then execution by a third person."}


@router.post("/refunds")
def create_refund(payload:RefundCreate,db:Session=Depends(get_db),user:User=Depends(require_roles(Role.REFUNDS.value,Role.FINANCE.value,Role.ADMIN.value))):
    t=db.get(Ticket,payload.ticket_id)
    if not t: raise HTTPException(404,"Ticket not found")
    return propose_refund(db, t, user, payload.amount, payload.reason)

@router.post("/refunds/{refund_id}/approve")
def approve_refund(refund_id:str,payload:RefundDecision,db:Session=Depends(get_db),user:User=Depends(require_roles(Role.FINANCE.value,Role.ADMIN.value))):
    r=db.get(RefundRequest,refund_id)
    if not r: raise HTTPException(404,"Refund request not found")
    if r.requested_by_id==user.id: raise HTTPException(409,"Separation of duties: approver cannot approve their own request")
    if r.status!=RefundStatus.PENDING_APPROVAL.value: raise HTTPException(409,"Refund is not awaiting approval")
    r.status=RefundStatus.APPROVED.value; r.approved_by_id=user.id
    audit(db,user.id,"REFUND_APPROVED","refund",r.id,{"reason":payload.reason})
    record_event(db,r.ticket_id,user.id,"REFUND_APPROVED",{"refund_id":r.id,"reason":payload.reason})
    db.commit(); db.refresh(r)
    return {"id":r.id,"status":r.status}

@router.post("/refunds/{refund_id}/reject")
def reject_refund(refund_id:str,payload:RefundDecision,db:Session=Depends(get_db),user:User=Depends(require_roles(Role.FINANCE.value,Role.ADMIN.value))):
    r=db.get(RefundRequest,refund_id)
    if not r: raise HTTPException(404,"Refund request not found")
    if r.status!=RefundStatus.PENDING_APPROVAL.value: raise HTTPException(409,"Refund is not awaiting approval")
    r.status=RefundStatus.REJECTED.value; r.rejection_reason=payload.reason
    audit(db,user.id,"REFUND_REJECTED","refund",r.id,{"reason":payload.reason})
    record_event(db,r.ticket_id,user.id,"REFUND_REJECTED",{"refund_id":r.id,"reason":payload.reason})
    db.commit(); return {"id":r.id,"status":r.status}

@router.post("/refunds/{refund_id}/execute")
def execute_refund(
    refund_id: str,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.FINANCE.value, Role.REFUNDS.value, Role.ADMIN.value))
):
    if not idempotency_key:
        raise HTTPException(400, "Idempotency-Key header is required for settlement execution")
    key = idempotency_key
    return FinancialSettlementService.execute_settlement(
        db=db,
        refund_id=refund_id,
        executor=user,
        idempotency_key=key,
        provider="SANDBOX"
    )

@router.get("/finance/ledger/accounts")
def list_ledger_accounts(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.FINANCE.value, Role.ADMIN.value, Role.AUDITOR.value))
):
    ensure_default_accounts(db)
    accounts = db.scalars(select(LedgerAccount).order_by(LedgerAccount.id)).all()
    out = []
    for acc in accounts:
        debit_sum = db.scalar(select(func.sum(LedgerEntry.amount_minor)).where(LedgerEntry.account_id == acc.id, LedgerEntry.entry_type == "DEBIT")) or 0
        credit_sum = db.scalar(select(func.sum(LedgerEntry.amount_minor)).where(LedgerEntry.account_id == acc.id, LedgerEntry.entry_type == "CREDIT")) or 0
        out.append({
            "id": acc.id,
            "name": acc.name,
            "account_type": acc.account_type,
            "currency": acc.currency,
            "active": acc.active,
            "total_debit_minor": debit_sum,
            "total_credit_minor": credit_sum,
            "net_balance_minor": debit_sum - credit_sum
        })
    return out

@router.get("/finance/ledger/journals")
def list_ledger_journals(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.FINANCE.value, Role.ADMIN.value, Role.AUDITOR.value))
):
    journals = db.scalars(
        select(LedgerJournal)
        .order_by(desc(LedgerJournal.posted_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    out = []
    for j in journals:
        entries = [{"id": e.id, "account_id": e.account_id, "entry_type": e.entry_type, "amount_minor": e.amount_minor} for e in j.entries]
        out.append({
            "id": j.id,
            "refund_id": j.refund_id,
            "ticket_id": j.ticket_id,
            "transaction_id": j.transaction_id,
            "currency": j.currency,
            "idempotency_key": j.idempotency_key,
            "posted_at": j.posted_at.isoformat() if j.posted_at else None,
            "posted_by_id": j.posted_by_id,
            "status": j.status,
            "description": j.description,
            "entries": entries,
            "balanced": sum(e["amount_minor"] for e in entries if e["entry_type"] == "DEBIT") == sum(e["amount_minor"] for e in entries if e["entry_type"] == "CREDIT")
        })
    return out

@router.get("/finance/settlements")
def list_settlements(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.FINANCE.value, Role.ADMIN.value, Role.AUDITOR.value))
):
    attempts = db.scalars(select(GatewaySettlementAttempt).order_by(desc(GatewaySettlementAttempt.created_at)).limit(100)).all()
    return [{
        "id": a.id,
        "refund_id": a.refund_id,
        "provider": a.provider,
        "provider_reference": a.provider_reference,
        "status": a.status,
        "amount_minor": a.amount_minor,
        "currency": a.currency,
        "error_message": a.error_message,
        "created_at": a.created_at.isoformat() if a.created_at else None
    } for a in attempts]

@router.post("/evidence/upload")
def upload_evidence(
    payload: EvidenceUploadIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    t = db.get(Ticket, payload.ticket_id)
    if not t:
        raise HTTPException(404, "Ticket not found")
    if user.role == Role.CUSTOMER.value and t.customer_id != user.id:
        raise HTTPException(404, "Ticket not found")

    raw_bytes = b""
    try:
        text = str(payload.base64_data).strip()
        if text.startswith("data:") and ";base64," in text:
            b64_part = text.split(";base64,", 1)[1]
        else:
            b64_part = text
        raw_bytes = base64.b64decode(b64_part, validate=False)
    except Exception:
        raw_bytes = b""

    evidence_file = evidence_store.save_evidence(db, t, raw_bytes, payload.file_name, source="upload")
    # A ticket paused for proof resumes on its own when the proof arrives (guide, phase 5 step 3).
    automation = None
    if _waiting_for_proof(t):
        automation = rerun_workflow(db, t, user, trigger="EVIDENCE_UPLOADED")
    db.commit()
    db.refresh(evidence_file)

    return {
        "id": evidence_file.id,
        "sha256": evidence_file.sha256_hash,
        "lifecycle_status": evidence_file.lifecycle_status,
        "file_name": evidence_file.file_name,
        "tamper_flags": evidence_file.tamper_flags or [],
        "automation": automation,
    }


def _waiting_for_proof(t: Ticket) -> bool:
    if t.status in {TicketStatus.RESOLVED.value, TicketStatus.REJECTED.value} or t.refund_status in {"APPROVED", "REJECTED", "REFUNDED"}:
        return False
    return t.proof_status == "PROOF_REQUESTED" or t.status == TicketStatus.AWAITING_INFORMATION.value

@router.post("/evidence/verify")
def verify_evidence(
    payload: EvidenceVerifyIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    res = verify_product_identity_and_defect(
        evidence_items=payload.evidence_items,
        claimed_defect=payload.claimed_defect,
        purchased_product={
            "sku": payload.product_sku or "PROD-GEN",
            "name": payload.product_name or "Claimed Item",
            "category": payload.product_category or "GENERAL"
        }
    )
    return res

@router.get("/catalog/products")
def list_products(db: Session = Depends(get_db)):
    prods = db.scalars(select(Product).where(Product.active == True)).all()
    return [{
        "sku": p.sku,
        "name": p.name,
        "category": p.category,
        "brand": p.brand,
        "model": p.model,
        "price_minor": p.price_minor,
        "currency": p.currency,
        "variants": [{"id": v.id, "sku": v.sku, "color": v.color, "size": v.size, "name": v.variant_name} for v in p.variants],
        "reference_images": [{"id": r.id, "url": r.image_url, "view_type": r.view_type} for r in p.reference_images]
    } for p in prods]

@router.get("/policies")
def list_policies(db: Session = Depends(get_db)):
    policies = db.scalars(select(ReturnPolicy).where(ReturnPolicy.active == True)).all()
    return [{
        "id": pol.id,
        "category": pol.category,
        "policy_version": pol.policy_version,
        "return_window_days": pol.return_window_days,
        "policy_summary": pol.policy_summary,
        "requires_serial": pol.requires_serial,
        "requires_tags": pol.requires_tags,
        "allow_damaged_exceptions": pol.allow_damaged_exceptions
    } for pol in policies]

@router.get("/health/readiness")
def health_readiness(db: Session = Depends(get_db)):
    """Comprehensive readiness probe checking database connectivity and ledger balance invariants."""
    # 1. Check DB connectivity
    db.execute(select(1)).scalar()

    # 2. Check Double-Entry Invariants
    total_debits = db.scalar(select(func.sum(LedgerEntry.amount_minor)).where(LedgerEntry.entry_type == "DEBIT")) or 0
    total_credits = db.scalar(select(func.sum(LedgerEntry.amount_minor)).where(LedgerEntry.entry_type == "CREDIT")) or 0
    ledger_balanced = (total_debits == total_credits)

    # 3. Check Pending Outbox Queue
    pending_outbox = db.scalar(select(func.count(OutboxMessage.id)).where(OutboxMessage.status == "PENDING")) or 0

    return {
        "status": "ready" if ledger_balanced else "degraded",
        "database": "connected",
        "ledger_invariants": {
            "total_debits_minor": total_debits,
            "total_credits_minor": total_credits,
            "balanced": ledger_balanced
        },
        "outbox_pending_count": pending_outbox,
        "outbox_failed_count": db.scalar(select(func.count(OutboxMessage.id)).where(OutboxMessage.status == "FAILED")) or 0,
        "integrations": {
            "payment_gateway": gateway_status(),
            "vision": vision_status(),
            "carrier": {"status": "NOT_CONFIGURED", "detail": "No carrier API configured; delivery facts come from the store order record."},
            "legal_rules": {"status": "NOT_CONFIGURED", "detail": "No maintained jurisdiction ruleset; only merchant policy is applied."},
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@router.get("/analytics/overview")
def analytics(db:Session=Depends(get_db),user:User=Depends(require_roles(
    Role.SUPPORT.value,Role.SUPERVISOR.value,Role.ADMIN.value,Role.REFUNDS.value,
    Role.RISK.value,Role.FINANCE.value,Role.AUDITOR.value,Role.CS_1.value,Role.CS_2.value,Role.CS_3.value
))):
    tickets = db.scalars(visible_ticket_query(db, user)).all()
    ticket_ids = {t.id for t in tickets}
    all_refunds = db.scalars(select(RefundRequest)).all()
    refunds = [r for r in all_refunds if r.ticket_id in ticket_ids] if user.role in {Role.CS_1.value, Role.CS_2.value, Role.CS_3.value} else all_refunds
    status_counts={}
    category_counts={}
    for t in tickets:
        status_counts[t.status]=status_counts.get(t.status,0)+1
        category_counts[t.category]=category_counts.get(t.category,0)+1
    return {"total_tickets":len(tickets),"open_tickets":sum(1 for t in tickets if t.status not in {TicketStatus.RESOLVED.value,TicketStatus.REJECTED.value}),
      "urgent_tickets":sum(1 for t in tickets if t.priority=="P1"),"unassigned_tickets":sum(1 for t in tickets if not t.assigned_to_id),
      "sla_breaches":sum(1 for t in tickets if t.status=="ESCALATED"),"refund_requested":float(sum((Decimal(str(r.amount)) for r in refunds),Decimal("0"))),
      "refund_completed":float(sum((Decimal(str(r.amount)) for r in refunds if r.status==RefundStatus.REFUNDED.value),Decimal("0"))),
      "status_counts":status_counts,"category_counts":category_counts,"as_of":datetime.now(timezone.utc).isoformat()}

@router.get("/admin/audit-logs")
def audit_logs(page:int=Query(1,ge=1),page_size:int=Query(50,ge=1,le=200),db:Session=Depends(get_db),
               user:User=Depends(require_roles(Role.ADMIN.value,Role.AUDITOR.value))):
    rows=db.scalars(select(AuditLog).order_by(desc(AuditLog.created_at)).offset((page-1)*page_size).limit(page_size)).all()
    return [{"id":a.id,"actor_id":a.actor_id,"action":a.action,"entity_type":a.entity_type,"entity_id":a.entity_id,"details":a.details,"created_at":a.created_at.isoformat()} for a in rows]

@router.get("/admin/users")
def users(db:Session=Depends(get_db),user:User=Depends(require_roles(Role.ADMIN.value))):
    return [user_view(u) | {"active":u.active} for u in db.scalars(select(User).order_by(User.email)).all()]

@router.get("/admin/health")
def admin_health(user:User=Depends(require_roles(Role.ADMIN.value))):
    gw = gateway_status()
    return {"status":"ok","database":"configured","ai_provider":"rules-only-with-optional-provider",
            "vision":vision_status(),"payment_provider":gw["active_provider"],"live_payments_enabled":gw["live_payments_enabled"],
            "background_worker":"in-process outbox thread" if settings.run_background_workers else "disabled (RUN_BACKGROUND_WORKERS=false)",
            "agents":len(AGENTS),"orchestrator":ORCHESTRATOR["id"]}


@router.post("/intelligence/classify/{ticket_id}")
def reclassify_ticket(ticket_id:str, db:Session=Depends(get_db),
                      user:User=Depends(require_roles(Role.SUPPORT.value,Role.SUPERVISOR.value,Role.ADMIN.value,Role.RISK.value))):
    t=db.get(Ticket,ticket_id)
    if not t: raise HTTPException(404,"Ticket not found")
    result=classify(t.description)
    if t.category=="UNAUTHORIZED_PAYMENT" and result["category"]!="UNAUTHORIZED_PAYMENT":
        result["category"]="UNAUTHORIZED_PAYMENT"
        result["confidence"]=max(result["confidence"],float(t.confidence))
        result["evidence"]=["Existing security-sensitive category retained"]
    audit(db,user.id,"TICKET_RECLASSIFIED","ticket",t.id,{"category":result["category"],"confidence":result["confidence"]})
    db.commit()
    return {"ticket_id":t.id,"category":result["category"],"confidence":result["confidence"],
            "evidence":result["evidence"],"recommended_action":result["recommended_action"],"classifier_version":"rules-v1"}

@router.post("/intelligence/duplicates/{ticket_id}/check")
def duplicate_check(ticket_id:str,db:Session=Depends(get_db),
                    user:User=Depends(require_roles(Role.SUPPORT.value,Role.SUPERVISOR.value,Role.ADMIN.value,Role.RISK.value))):
    t=db.get(Ticket,ticket_id)
    if not t: raise HTTPException(404,"Ticket not found")
    candidate=find_duplicate(db,t.customer_id,t.transaction_id,t.category,t.description,item_name=t.item_name,order_id=t.order_id)
    if candidate and candidate.id==t.id: candidate=None
    if candidate and not t.duplicate_of_id:
        t.duplicate_of_id=candidate.id
        record_event(db,t.id,user.id,"DUPLICATE_CANDIDATE_LINKED",{"canonical_ticket_id":candidate.id,"method":"same_customer_transaction_category"})
        audit(db,user.id,"DUPLICATE_CANDIDATE_LINKED","ticket",t.id,{"canonical_ticket_id":candidate.id})
    db.commit()
    return {"ticket_id":t.id,"candidate_id":candidate.id if candidate else t.duplicate_of_id,
            "match_type":"conservative_exact_relationship" if candidate or t.duplicate_of_id else "none",
            "auto_closed":False,"message":"Similarity alone never closes a financial complaint."}

@router.get("/intelligence/duplicates/{ticket_id}")
def get_duplicate_candidates(ticket_id:str,db:Session=Depends(get_db),
                    user:User=Depends(require_roles(Role.SUPPORT.value,Role.SUPERVISOR.value,Role.ADMIN.value,Role.RISK.value,Role.AUDITOR.value))):
    t=db.get(Ticket,ticket_id)
    if not t: raise HTTPException(404,"Ticket not found")
    rows=db.scalars(select(Ticket).where(Ticket.customer_id==t.customer_id,Ticket.transaction_id==t.transaction_id,Ticket.id!=t.id).order_by(desc(Ticket.created_at)).limit(20)).all()
    return {"ticket_id":t.id,"duplicate_of_id":t.duplicate_of_id,
            "candidates":[{"id":x.id,"ticket_number":x.ticket_number,"category":x.category,"status":x.status,
                           "same_category":x.category==t.category,"created_at":x.created_at.isoformat()} for x in rows]}

@router.post("/intelligence/risk/{ticket_id}/assess")
def assess_risk(ticket_id:str,db:Session=Depends(get_db),
                user:User=Depends(require_roles(Role.RISK.value,Role.SUPERVISOR.value,Role.ADMIN.value))):
    t=db.get(Ticket,ticket_id)
    if not t: raise HTTPException(404,"Ticket not found")
    signals=[]
    if t.category=="UNAUTHORIZED_PAYMENT": signals.append({"signal":"UNAUTHORIZED_PAYMENT_REPORT","severity":"HIGH","source":"ticket_category"})
    if t.payment_verification in {"CUSTOMER_MISMATCH","AMOUNT_MISMATCH","TRANSACTION_NOT_FOUND"}:
        signals.append({"signal":"TRANSACTION_VERIFICATION_EXCEPTION","severity":"HIGH","source":"transaction_check"})
    if t.duplicate_of_id: signals.append({"signal":"POSSIBLE_DUPLICATE_TICKET","severity":"MEDIUM","source":"ticket_relationship"})
    level="HIGH" if any(x["severity"]=="HIGH" for x in signals) else ("MEDIUM" if signals else "LOW")
    audit(db,user.id,"RISK_ASSESSMENT_RECORDED","ticket",t.id,{"risk_level":level,"signals":signals})
    db.commit()
    return {"ticket_id":t.id,"risk_level":level,"signals":signals,"decision":"REVIEW_SIGNAL_ONLY",
            "disclaimer":"A risk signal is not proof of fraud and must not independently deny a refund."}

@router.get("/tickets/{ticket_id}/history")
def ticket_history(ticket_id:str,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    t=db.get(Ticket,ticket_id)
    if not t or (user.role==Role.CUSTOMER.value and t.customer_id!=user.id): raise HTTPException(404,"Ticket not found")
    events=db.scalars(select(TicketEvent).where(TicketEvent.ticket_id==ticket_id).order_by(TicketEvent.created_at)).all()
    return [{"id":e.id,"event_type":e.event_type,"details":e.details,"created_at":e.created_at.isoformat(),
             "actor_id":e.actor_id if user.role!=Role.CUSTOMER.value else None} for e in events]

@router.get("/tickets/{ticket_id}/related")
def related_tickets(ticket_id:str,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    t=db.get(Ticket,ticket_id)
    if not t or (user.role==Role.CUSTOMER.value and t.customer_id!=user.id): raise HTTPException(404,"Ticket not found")
    rows=db.scalars(select(Ticket).where(Ticket.customer_id==t.customer_id,Ticket.transaction_id==t.transaction_id,Ticket.id!=t.id).limit(25)).all()
    return [ticket_view(x,include_private=user.role!=Role.CUSTOMER.value) for x in rows]

@router.get("/refunds/{refund_id}")
def get_refund(refund_id:str,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    r=db.get(RefundRequest,refund_id)
    if not r: raise HTTPException(404,"Refund request not found")
    t=db.get(Ticket,r.ticket_id)
    if user.role==Role.CUSTOMER.value and t.customer_id!=user.id: raise HTTPException(404,"Refund request not found")
    return {"id":r.id,"ticket_id":r.ticket_id,"transaction_id":r.transaction_id,"amount":float(r.amount),
            "currency":r.currency,"status":r.status,"reason":r.reason,"approved_by_id":r.approved_by_id,
            "provider_reference":r.provider_reference,"created_at":r.created_at.isoformat(),"updated_at":r.updated_at.isoformat()}

@router.post("/refunds/{refund_id}/reconcile")
def reconcile_refund(refund_id: str, db: Session = Depends(get_db),
                     user: User = Depends(require_roles(Role.FINANCE.value, Role.ADMIN.value, Role.AUDITOR.value))):
    """Ask the payment provider what actually happened to an uncertain settlement and apply it exactly once."""
    return FinancialSettlementService.reconcile_settlement(db, refund_id, user)


@router.post("/finance/webhooks/{provider}")
async def gateway_webhook(provider: str, request: Request, db: Session = Depends(get_db),
                          signature: Optional[str] = Header(None, alias="X-Gateway-Signature")):
    """Provider callbacks: HMAC-verified, de-duplicated by event id, applied through reconciliation."""
    raw = await request.body()
    return FinancialSettlementService.handle_gateway_webhook(db, provider, raw, signature or "")

@router.get("/automation/agents")
def automation_agents(user:User=Depends(require_roles(Role.SUPPORT.value,Role.SUPERVISOR.value,Role.ADMIN.value,Role.REFUNDS.value,Role.RISK.value,Role.FINANCE.value,Role.AUDITOR.value,Role.CS_1.value,Role.CS_2.value,Role.CS_3.value))):
    return {"orchestrator":ORCHESTRATOR,"agents":AGENTS,"count":len(AGENTS),"total_components":len(AGENTS)+1,
            "execution_policy":"Deterministic financial controls; no refund execution from classification or risk signals alone."}

@router.post("/automation/tickets/{ticket_id}/run")
def run_ticket_automation(ticket_id:str,db:Session=Depends(get_db),
                          user:User=Depends(require_roles(Role.SUPPORT.value,Role.SUPERVISOR.value,Role.ADMIN.value,Role.REFUNDS.value,Role.RISK.value,Role.FINANCE.value,Role.CS_1.value,Role.CS_2.value,Role.CS_3.value))):
    ticket=db.get(Ticket,ticket_id)
    if not ticket: raise HTTPException(404,"Ticket not found")
    result=rerun_workflow(db,ticket,user)
    db.commit(); db.refresh(ticket)
    return result

@router.post("/automation/run-all")
def run_all_automation(db:Session=Depends(get_db),
                       user:User=Depends(require_roles(Role.SUPPORT.value,Role.SUPERVISOR.value,Role.ADMIN.value,Role.REFUNDS.value,Role.RISK.value,Role.FINANCE.value,Role.CS_1.value,Role.CS_2.value,Role.CS_3.value))):
    tickets = db.scalars(select(Ticket).where(Ticket.status.notin_([TicketStatus.RESOLVED.value, TicketStatus.REJECTED.value]))).all()
    results = []
    for t in tickets:
        rerun_workflow(db, t, user)
        results.append({"ticket_id": t.id, "ticket_number": t.ticket_number, "bucket": t.decision_bucket, "desk": t.assigned_desk})
    db.commit()
    return {"status": "ORCHESTRATOR_EXECUTED", "processed_count": len(results), "agents_count": len(AGENTS), "results": results}

@router.get("/customer/transactions")
def customer_transactions(db:Session=Depends(get_db),
                          user:User=Depends(require_roles(Role.CUSTOMER.value))):
    txs = db.scalars(select(Transaction).where(Transaction.customer_id == user.id).order_by(desc(Transaction.created_at))).all()
    return [{
        "id": tx.id,
        "order_id": tx.order_id,
        "amount": float(tx.amount),
        "currency": tx.currency,
        "payment_status": tx.payment_status,
        "refunded_amount": float(tx.refunded_amount),
        "provider_reference": tx.provider_reference,
        "created_at": tx.created_at.isoformat()
    } for tx in txs]

@router.get("/automation/summary")
def automation_summary(db:Session=Depends(get_db),user:User=Depends(require_roles(Role.SUPPORT.value,Role.SUPERVISOR.value,Role.ADMIN.value,Role.REFUNDS.value,Role.RISK.value,Role.FINANCE.value,Role.AUDITOR.value,Role.CS_1.value,Role.CS_2.value,Role.CS_3.value))):
    tickets=db.scalars(select(Ticket)).all()
    events=db.scalars(select(TicketEvent).where(TicketEvent.event_type=="AUTOMATION_PIPELINE_COMPLETED")).all()
    return {"agent_count":len(AGENTS),"orchestrator_count":1,"pipeline_runs":len(events),
      "tickets_total":len(tickets),"tickets_flagged_duplicate":sum(1 for t in tickets if t.duplicate_of_id),
      "tickets_needing_verification":sum(1 for t in tickets if t.payment_verification not in {"VERIFIED","ALREADY_REFUNDED"}),
      "tickets_high_priority":sum(1 for t in tickets if t.priority=="P1"),
      "refund_execution_mode":gateway_status()["active_provider"],"real_provider_configured":gateway_status()["live_payments_enabled"],
      "note":"Counts are computed from persisted records; mock provider results are not real financial outcomes."}

@router.get("/desks/summary")
def desks_summary(db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    tickets=db.scalars(select(Ticket)).all()
    cs1_pending = [t for t in tickets if t.decision_bucket=="GENUINE_REFUNDABLE" and t.status not in {TicketStatus.RESOLVED.value, TicketStatus.REJECTED.value}]
    cs2_pending = [t for t in tickets if t.decision_bucket=="EXCEPTIONAL_PROOF_NEEDED" and t.status not in {TicketStatus.RESOLVED.value, TicketStatus.REJECTED.value}]
    cs3_pending = [t for t in tickets if t.decision_bucket=="NON_REFUNDABLE" and t.status not in {TicketStatus.RESOLVED.value, TicketStatus.REJECTED.value}]
    resolved = [t for t in tickets if t.status in {TicketStatus.RESOLVED.value, TicketStatus.REJECTED.value}]
    return {
        "cs1_count": len(cs1_pending),
        "cs2_count": len(cs2_pending),
        "cs3_count": len(cs3_pending),
        "resolved_count": len(resolved),
        "total_active": len(cs1_pending) + len(cs2_pending) + len(cs3_pending),
        "total_tickets": len(tickets)
    }

@router.post("/cs1/tickets/{ticket_id}/direct-refund")
def cs1_direct_refund(ticket_id:str, db:Session=Depends(get_db),
                      user:User=Depends(require_roles(Role.CS_1.value, Role.SUPPORT.value, Role.REFUNDS.value, Role.ADMIN.value, Role.SUPERVISOR.value))):
    """CS-1 fast track: approve the claim. Store orders are refunded by the store; RITOS-ledger orders get a
    refund proposal that a different finance approver must approve and a third person must execute."""
    ticket = db.get(Ticket, ticket_id)
    if not ticket: raise HTTPException(404, "Ticket not found")
    require_cs1_bucket(ticket)
    if ticket.payment_verification != "VERIFIED":
        raise HTTPException(409, f"Cannot issue refund: Ledger status is {ticket.payment_verification}")
    sent = store_decision(db, ticket, user, "APPROVED", "CS-1 fast-track approval")
    if sent: return sent
    record_human_decision(db, ticket, "APPROVED", user.id, "CS-1 fast-track approval")
    proposal = propose_refund(db, ticket, user, Decimal(str(ticket.claimed_amount)), "CS-1 fast-track approval")
    db.refresh(ticket)
    return {"status": "REFUND_PROPOSED", "refund": proposal, "ticket": ticket_view(ticket)}

@router.post("/cs1/tickets/{ticket_id}/manual-decide")
def cs1_manual_decide(ticket_id:str, payload:CS1DecisionIn, db:Session=Depends(get_db),
                      user:User=Depends(require_roles(Role.CS_1.value, Role.SUPPORT.value, Role.REFUNDS.value, Role.ADMIN.value, Role.SUPERVISOR.value))):
    ticket = db.get(Ticket, ticket_id)
    if not ticket: raise HTTPException(404, "Ticket not found")
    decision = payload.decision.upper().strip()
    if decision not in {"APPROVE", "CANCEL"}:
        raise HTTPException(400, "Decision must be 'APPROVE' or 'CANCEL'")
    if decision == "APPROVE":
        require_cs1_bucket(ticket)
        if ticket.payment_verification != "VERIFIED":
            raise HTTPException(409, f"Cannot approve refund: Ledger status is {ticket.payment_verification}")
    sent = store_decision(db, ticket, user, "APPROVED" if decision == "APPROVE" else "REJECTED", f"CS-1 manual review: {payload.reason}")
    if sent: return sent
    record_human_decision(db, ticket, "APPROVED" if decision == "APPROVE" else "REJECTED", user.id, payload.reason)
    if decision == "APPROVE":
        proposal = propose_refund(db, ticket, user, Decimal(str(ticket.claimed_amount)), f"CS-1 manual review: {payload.reason}")
        db.refresh(ticket)
        return {"status": "REFUND_PROPOSED", "refund": proposal, "ticket": ticket_view(ticket)}
    ticket.status = TicketStatus.REJECTED.value
    ticket.refund_status = "CANCELLED"
    ticket.policy_evaluation_reason = f"CS-1 manual review cancelled: {payload.reason}"
    ticket.refund_decided_at = datetime.now(timezone.utc)
    ticket.refund_decided_by_id = user.id
    db.add(TicketComment(ticket_id=ticket.id, author_id=user.id, body=f"CS-1 cancelled the refund: {payload.reason}", internal=False))
    record_event(db, ticket.id, user.id, "CS1_REFUND_CANCELLED", {"reason": payload.reason})
    audit(db, user.id, "CS1_REFUND_CANCELLED", "ticket", ticket.id, {"reason": payload.reason})
    db.commit(); db.refresh(ticket)
    return {"status": ticket.status, "ticket": ticket_view(ticket)}

@router.post("/cs2/tickets/{ticket_id}/send-proof-request")
def cs2_send_proof_request(ticket_id:str, payload:ProofRequestIn, db:Session=Depends(get_db),
                           user:User=Depends(require_roles(Role.CS_2.value, Role.SUPPORT.value, Role.REFUNDS.value, Role.ADMIN.value, Role.SUPERVISOR.value))):
    ticket = db.get(Ticket, ticket_id)
    if not ticket: raise HTTPException(404, "Ticket not found")
    
    ticket.proof_status = "REQUESTED"
    ticket.proof_request_sent_at = datetime.now(timezone.utc)
    ticket.status = TicketStatus.AWAITING_INFORMATION.value
    record_human_decision(db, ticket, "PROOF_REQUESTED", user.id, payload.message)
    if is_store_linked(ticket):
        enqueue(db, ticket.id, "NOTIFICATION", "/api/ritos/notifications",
                {"ticket_id": ticket.ticket_number, "title": "Proof requested", "body": payload.message[:1000], "channel": "IN_APP"},
                f"ritos-proof-request-{ticket.id}-{uuid4().hex[:8]}")

    # RITOS sends no SMS or email: the request is posted on the customer's ticket, and store-linked
    # customers also get an in-app notification from the store.
    dest = "TICKET_THREAD+STORE_IN_APP" if is_store_linked(ticket) else "TICKET_THREAD"
    db.add(TicketComment(
        ticket_id=ticket.id,
        author_id=user.id,
        body=f"📲 [CS-2 proof request, posted to the customer's ticket]:\n{payload.message}",
        internal=False
    ))
    record_event(db, ticket.id, user.id, "CS2_PROOF_REQUEST_DISPATCHED", {"destination": dest, "message": payload.message, "proof_type": payload.proof_type})
    audit(db, user.id, "CS2_PROOF_REQUEST_DISPATCHED", "ticket", ticket.id, {"destination": dest})
    db.commit()
    db.refresh(ticket)
    return {"status": "PROOF_REQUESTED", "destination": dest, "ticket": ticket_view(ticket)}

@router.post("/cs3/tickets/{ticket_id}/send-rejection-notice")
def cs3_send_rejection_notice(ticket_id:str, payload:RejectionNoticeIn, db:Session=Depends(get_db),
                             user:User=Depends(require_roles(Role.CS_3.value, Role.SUPPORT.value, Role.REFUNDS.value, Role.ADMIN.value, Role.SUPERVISOR.value))):
    ticket = db.get(Ticket, ticket_id)
    if not ticket: raise HTTPException(404, "Ticket not found")
    if is_store_linked(ticket) and ticket.refund_status != "REJECTED":
        store_decision(db, ticket, user, "REJECTED", payload.reason or ticket.policy_evaluation_reason or "Rejected under store policy")
    elif not is_store_linked(ticket):
        record_human_decision(db, ticket, "REJECTED", user.id, payload.reason or "CS-3 rejection notice")

    ticket.status = TicketStatus.REJECTED.value
    ticket.rejection_notice_sent_at = datetime.now(timezone.utc)
    if payload.reason:
        ticket.policy_evaluation_reason = payload.reason
        
    dest = "TICKET_THREAD+STORE_DECISION" if is_store_linked(ticket) else "TICKET_THREAD"
    db.add(TicketComment(
        ticket_id=ticket.id,
        author_id=user.id,
        body=f"📩 [CS-3 policy rejection notice, posted to the customer's ticket]:\n{payload.message}",
        internal=False
    ))
    record_event(db, ticket.id, user.id, "CS3_REJECTION_NOTICE_DISPATCHED", {"destination": dest, "message": payload.message, "reason": payload.reason})
    audit(db, user.id, "CS3_REJECTION_NOTICE_DISPATCHED", "ticket", ticket.id, {"destination": dest})
    db.commit()
    db.refresh(ticket)
    return {"status": "REJECTION_NOTICE_SENT", "destination": dest, "ticket": ticket_view(ticket)}

@router.post("/integrations/ecommerce/ticket")
def ecommerce_ticket_intake(
    payload: EcommerceTicketIn,
    db: Session = Depends(get_db),
    x_ecommerce_secret: str | None = Header(None, alias="X-Ecommerce-Secret"),
    authorization: Optional[str] = Header(None)
):
    # Store servers send the shared secret; staff can also use this from the desk portal's simulator
    # with their own login (the secret must never be shipped to the browser).
    expected = settings.ecommerce_webhook_secret
    secret_ok = bool(expected) and hmac.compare_digest(x_ecommerce_secret or "", expected)
    if not secret_ok:
        token = authorization[7:].strip() if authorization and authorization.lower().startswith("bearer ") else ""
        staff = None
        if token:
            try:
                staff = get_current_user(token, db)
            except HTTPException:
                staff = None
        if not staff or staff.role not in STAFF_ROLES:
            raise HTTPException(401, "Invalid or missing X-Ecommerce-Secret header")

    # The claim must belong to a known, active customer; it is never attached to someone else.
    if not payload.customer_email:
        raise HTTPException(422, "customer_email is required")
    cust = db.scalar(select(User).where(User.email == payload.customer_email.strip().lower(),
                                        User.role == Role.CUSTOMER.value, User.active.is_(True)))
    if not cust:
        raise HTTPException(404, "Customer identity is not mapped; provision or map the customer before intake")
    customer_id = cust.id
    currency = (payload.currency or settings.default_currency).upper()
    if currency not in settings.currencies:
        raise HTTPException(422, "Unsupported currency")

    tx = db.get(Transaction, payload.transaction_id)
    # A ledger capture date is only trusted when the transaction existed before this call.
    ledger_date = tx.created_at if tx and tx.customer_id == customer_id else None
    if not tx:
        # Only the store (shared secret) may register a payment, and only with the payment facts it holds:
        # a claim never certifies its own payment.
        if not secret_ok:
            raise HTTPException(409, "Transaction is not available in the trusted transaction source")
        if payload.transaction_amount is None or not payload.payment_status:
            raise HTTPException(409, "Unknown transaction: send transaction_amount and payment_status to register it")
        tx = Transaction(
            id=payload.transaction_id,
            customer_id=customer_id,
            order_id=payload.order_id,
            amount=Decimal(str(payload.transaction_amount)).quantize(Decimal("0.01")),
            currency=currency,
            payment_status=payload.payment_status.strip().upper(),
            refunded_amount=Decimal("0.00"),
            provider_reference=f"ECOM-{payload.transaction_id}"
        )
        db.add(tx)
        db.flush()

    ticket_number = f"RIT-ECOM-{uuid4().hex[:6].upper()}"
    # This caller is the store (shared secret) or staff, so its order date is authoritative; otherwise use the ledger.
    p_date = None
    if payload.purchase_date:
        try:
            p_date = datetime.fromisoformat(payload.purchase_date.strip().replace("Z", "+00:00"))
        except ValueError:
            p_date = None
    p_date_source = "STORE_ORDER" if p_date else ("LEDGER_CAPTURE" if ledger_date else None)

    ticket = Ticket(
        ticket_number=ticket_number,
        customer_id=customer_id,
        transaction_id=payload.transaction_id,
        order_id=payload.order_id,
        claimed_amount=payload.claimed_amount,
        currency=currency,
        description=payload.description,
        customer_name=payload.customer_name or "Valued Customer",
        customer_email=payload.customer_email,
        customer_phone=payload.customer_phone,
        item_name=payload.item_name or "Product Item",
        item_category=(payload.item_category or "GENERAL").upper(),
        purchase_date=p_date or ledger_date,
        classification_evidence={"source": "ecommerce_ticket_intake", "purchase_date_source": p_date_source},
    )
    db.add(ticket)
    db.flush()

    # Execute full multi-agent pipeline immediately on intake
    pipeline_res = run_ticket_pipeline(db, ticket, None)
    
    db.add(TicketComment(
        ticket_id=ticket.id,
        author_id=customer_id,
        body=f"Order: {payload.order_id} · Item: {payload.item_name} ({payload.item_category})\nDescription: {payload.description}",
        internal=False
    ))
    db.commit()
    db.refresh(ticket)
    
    return {
        "status": "INGESTED_AND_TRIAGED",
        "ticket_id": ticket.id,
        "ticket_number": ticket.ticket_number,
        "decision_bucket": ticket.decision_bucket,
        "assigned_desk": ticket.assigned_desk,
        "policy_evaluation_reason": ticket.policy_evaluation_reason,
        "recommended_action": ticket.recommended_action,
        "customer_message_draft": ticket.customer_message_draft,
        "proof_required": ticket.proof_required,
        "ticket": ticket_view(ticket)
    }

class ProofActionPayload(BaseModel):
    action: str  # "APPROVE_PROOF", "REQUEST_PROOF", "DENY"
    note: Optional[str] = "Human review decision recorded."

@router.post("/tickets/{ticket_id}/proof-action")
def handle_proof_action(ticket_id: str, payload: ProofActionPayload, db: Session = Depends(get_db),
                        user: User = Depends(require_roles(Role.CS_2.value, Role.SUPPORT.value, Role.REFUNDS.value, Role.ADMIN.value, Role.SUPERVISOR.value))):
    t = db.get(Ticket, ticket_id)
    if not t: raise HTTPException(404, "Ticket not found")
    if payload.action not in {"APPROVE_PROOF", "REQUEST_PROOF", "DENY"}:
        raise HTTPException(400, "action must be APPROVE_PROOF, REQUEST_PROOF or DENY")

    if payload.action == "DENY" and is_store_linked(t):
        store_decision(db, t, user, "REJECTED", f"Exception denied after proof review: {payload.note}")
    elif payload.action == "DENY":
        record_human_decision(db, t, "REJECTED", user.id, payload.note or "Exception denied")
    else:
        # Accepting proof moves the claim to CS-1, where a human authorizes the refund itself.
        record_human_decision(db, t, "PROOF_ACCEPTED" if payload.action == "APPROVE_PROOF" else "PROOF_REQUESTED", user.id, payload.note or "")

    if payload.action == "APPROVE_PROOF":
        t.proof_status = "PROOF_VERIFIED"
        t.decision_bucket = "GENUINE_REFUNDABLE"
        t.assigned_desk = AssignedDesk.CS_1.value
        t.policy_evaluation_reason = f"Human Agent ({user.email}) verified photo proof: {payload.note}"
        t.customer_message_draft = generate_customer_message_draft(
            customer_name=t.customer_name, order_id=t.order_id, item_name=t.item_name,
            claimed_amount=float(t.claimed_amount), currency=t.currency, decision_bucket=t.decision_bucket,
            reason=t.policy_evaluation_reason
        )
        record_event(db, t.id, user.id, "PROOF_VERIFIED_BY_AGENT", {"note": payload.note})
        audit(db, user.id, "PROOF_VERIFIED_BY_AGENT", "ticket", t.id, {"note": payload.note})

    elif payload.action == "REQUEST_PROOF":
        t.proof_status = "PROOF_REQUESTED"
        t.proof_request_sent_at = datetime.now(timezone.utc)
        record_event(db, t.id, user.id, "PROOF_REQUESTED", {"note": payload.note})
        audit(db, user.id, "PROOF_REQUESTED", "ticket", t.id, {"note": payload.note})

    elif payload.action == "DENY":
        t.decision_bucket = "NON_REFUNDABLE"
        t.assigned_desk = AssignedDesk.CS_3.value
        t.rejection_notice_sent_at = datetime.now(timezone.utc)
        t.policy_evaluation_reason = f"Human Agent ({user.email}) denied exception: {payload.note}"
        t.customer_message_draft = generate_customer_message_draft(
            customer_name=t.customer_name, order_id=t.order_id, item_name=t.item_name,
            claimed_amount=float(t.claimed_amount), currency=t.currency, decision_bucket=t.decision_bucket,
            reason=t.policy_evaluation_reason
        )
        record_event(db, t.id, user.id, "CLAIM_DENIED_BY_AGENT", {"note": payload.note})
        audit(db, user.id, "CLAIM_DENIED_BY_AGENT", "ticket", t.id, {"note": payload.note})

    db.commit()
    db.refresh(t)
    return {"status": "SUCCESS", "ticket": ticket_view(t)}

@router.post("/tickets/{ticket_id}/authorize-payout")
def authorize_payout(ticket_id: str, db: Session = Depends(get_db), user: User = Depends(require_roles(Role.FINANCE.value, Role.REFUNDS.value, Role.ADMIN.value))):
    t = db.get(Ticket, ticket_id)
    if not t: raise HTTPException(404, "Ticket not found")
    if t.refund_status == "REFUNDED":
        return {"status": "ALREADY_REFUNDED", "ticket": ticket_view(t)}
    require_cs1_bucket(t)
    sent = store_decision(db, t, user, "APPROVED", "Refund approved by finance")
    if sent: return sent  # the store owns its payments and executes the refund
    record_human_decision(db, t, "APPROVED", user.id, "Refund proposed by finance")
    proposal = propose_refund(db, t, user, Decimal(str(t.claimed_amount)), "Finance proposed payout for an eligible CS-1 claim")
    db.refresh(t)
    return {"status": "REFUND_PROPOSED", "refund": proposal, "ticket": ticket_view(t)}

# ==========================================
# SHOPFLOW INTEGRATION ENDPOINTS
# ==========================================
from .shopflow import process_shopflow_event, check_shopflow_health, handle_event, StoreUnavailable, UnknownStoreTicket

class ShopflowWebhookPayload(BaseModel):
    model_config = {"extra": "allow"}
    event_id: Optional[str] = None
    event_type: Optional[str] = "refund.ticket.created"
    ticket_id: str
    status: Optional[str] = "PENDING_RITOS"

def integration_caller(authorization: Optional[str], db: Session) -> str:
    """Store servers authenticate with the shared RITOS API key; staff may also call it from the desk portal."""
    token = authorization[7:].strip() if authorization and authorization.lower().startswith("bearer ") else ""
    if token and settings.ritos_api_key and hmac.compare_digest(token, settings.ritos_api_key):
        return "store"
    if token:
        try:
            user = get_current_user(token, db)
            if user.role in STAFF_ROLES:
                return f"staff:{user.email}"
        except HTTPException:
            pass
    raise HTTPException(401, "A valid RITOS API key is required (Authorization: Bearer <RITOS_API_KEY>)")

@router.post("/webhook/refund-tickets")
@router.post("/webhooks/shopflow")
def shopflow_webhook(payload: ShopflowWebhookPayload,
                     authorization: Optional[str] = Header(None),
                     db: Session = Depends(get_db)):
    """
    Webhook receiver for ShopFlow refund events (idempotent per event_id).
    refund.ticket.created runs the orchestrator; execution and human-decision events update the ticket.
    Store callbacks are queued in the outbox and delivered in the background.
    """
    integration_caller(authorization, db)
    try:
        result = handle_event(db, payload.model_dump())
    except HTTPException:
        raise
    except StoreUnavailable as e:
        db.rollback()
        raise HTTPException(503, f"Store temporarily unavailable, retry later: {e}")
    except UnknownStoreTicket as e:
        db.rollback()
        raise HTTPException(404, str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"ShopFlow processing error: {e}")
    return {"status": "SUCCESS", "message": "Event processed by RITOS orchestrator", "data": result}

@router.get("/integrations/shopflow/status")
def shopflow_status():
    """Returns ShopFlow connectivity status and base URL configuration."""
    health = check_shopflow_health()
    return {
        "shopflow_base_url": settings.shopflow_base_url,
        "connected": health.get("connected", False),
        "health": health
    }

@router.post("/integrations/shopflow/sync")
def shopflow_sync(db: Session = Depends(get_db),
                  user: User = Depends(require_roles(Role.SUPPORT.value, Role.SUPERVISOR.value, Role.ADMIN.value, Role.CS_1.value, Role.CS_2.value, Role.CS_3.value, Role.FINANCE.value))):
    """
    Manual / on-demand synchronization: Polls pending tickets or syncs recent ShopFlow state.
    """
    health = check_shopflow_health()
    if not health.get("connected"):
        return {
            "status": "DISCONNECTED",
            "message": f"ShopFlow at {settings.shopflow_base_url} is currently unreachable. Start ShopFlow (SHOPFLOW_BASE_URL) to sync live claims.",
            "synced_count": 0
        }

    # Attempt to fetch pending tickets queue from ShopFlow
    import httpx
    url = f"{settings.shopflow_base_url}/api/refunds?status=PENDING_RITOS"
    headers = {"Authorization": f"Bearer {settings.ritos_api_key}"}
    synced = []
    try:
        with httpx.Client(timeout=settings.store_request_timeout_seconds) as client:
            resp = client.get(url, headers=headers)
            if resp.is_success:
                data = resp.json()
                items = data if isinstance(data, list) else data.get("items", [])
                for item in items:
                    tid = item.get("id") or item.get("ticket_id")
                    if tid:
                        try:
                            res = process_shopflow_event(db, tid)
                            synced.append(res)
                        except Exception:
                            pass
    except Exception as err:
        return {"status": "ERROR", "message": str(err), "synced_count": 0}

    return {
        "status": "SYNCED",
        "synced_count": len(synced),
        "results": synced
    }



# ==========================================
# ORCHESTRATION VISIBILITY & OUTBOX OPERATIONS
# ==========================================
@router.get("/tickets/{ticket_id}/workflow")
def ticket_workflow(ticket_id: str, db: Session = Depends(get_db), user: User = Depends(require_roles(*STAFF_ROLES, Role.AUDITOR.value))):
    t = db.get(Ticket, ticket_id)
    if not t: raise HTTPException(404, "Ticket not found")
    runs = db.scalars(select(WorkflowRun).where(WorkflowRun.ticket_id == t.id).order_by(WorkflowRun.started_at.desc())).all()
    messages = db.scalars(select(OutboxMessage).where(OutboxMessage.ticket_id == t.id).order_by(OutboxMessage.created_at)).all()
    return {"ticket_id": t.id, "ticket_number": t.ticket_number, "store_linked": is_store_linked(t),
            "current": (t.classification_evidence or {}).get("workflow"),
            "runs": [workflow_view(r) for r in runs], "outbox": [outbox_view(m) for m in messages]}

@router.get("/workflow/runs")
def workflow_runs(status: str | None = None, limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db),
                  user: User = Depends(require_roles(*STAFF_ROLES, Role.AUDITOR.value))):
    q = select(WorkflowRun).order_by(WorkflowRun.started_at.desc()).limit(limit)
    if status: q = q.where(WorkflowRun.status == status)
    runs = db.scalars(q).all()
    waiting = db.scalar(select(func.count(WorkflowRun.id)).where(WorkflowRun.status == "WAITING_HUMAN")) or 0
    return {"waiting_human": waiting, "items": [workflow_view(r) for r in runs]}

@router.get("/integrations/outbox")
def list_outbox(status: str | None = None, db: Session = Depends(get_db),
                user: User = Depends(require_roles(Role.ADMIN.value, Role.SUPERVISOR.value, Role.AUDITOR.value))):
    q = select(OutboxMessage).order_by(OutboxMessage.created_at.desc()).limit(200)
    if status: q = q.where(OutboxMessage.status == status)
    return [outbox_view(m) for m in db.scalars(q).all()]

@router.post("/integrations/outbox/{message_id}/retry")
def retry_outbox_message(message_id: str, db: Session = Depends(get_db),
                         user: User = Depends(require_roles(Role.ADMIN.value, Role.SUPERVISOR.value))):
    m = db.get(OutboxMessage, message_id)
    if not m: raise HTTPException(404, "Outbox message not found")
    retry_outbox(db, m)
    audit(db, user.id, "OUTBOX_RETRY_REQUESTED", "outbox_message", m.id, {"kind": m.kind}); db.commit()
    return outbox_view(m)

@router.post("/integrations/outbox/deliver")
def deliver_outbox_now(db: Session = Depends(get_db), user: User = Depends(require_roles(Role.ADMIN.value, Role.SUPERVISOR.value))):
    return {"attempted": deliver_due(db)}
