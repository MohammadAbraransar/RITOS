from datetime import datetime, timezone
import hmac
from decimal import Decimal
from uuid import uuid4
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlalchemy.orm import Session
from sqlalchemy import select, func, desc
from .database import get_db
from .models import User, Ticket, TicketComment, TicketEvent, Transaction, RefundRequest, RefundStatus, TicketStatus, AuditLog, Role, DecisionBucket, AssignedDesk
from .schemas import (
    LoginIn, TicketCreate, CommentCreate, TicketUpdate, RefundCreate, RefundDecision,
    CS1DecisionIn, ProofRequestIn, RejectionNoticeIn, EcommerceTicketIn
)
from .security import verify_password, create_access_token, get_current_user, require_roles
from .services import (
    classify, verify_transaction, calculate_priority, find_duplicate,
    record_event, audit, refund_key, ROUTES, generate_customer_message_draft
)
from .agents import AGENTS, ORCHESTRATOR, run_ticket_pipeline
from .config import settings

router = APIRouter(prefix="/api/v1")

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
    if payload.currency.upper() not in {"INR","USD","EUR","GBP"}: raise HTTPException(422,"Unsupported currency")
    result=verify_transaction(db,payload.transaction_id,user.id,payload.claimed_amount,payload.currency.upper())
    triage=classify(payload.description)
    priority=calculate_priority(triage["category"],payload.description)
    duplicate=find_duplicate(db,user.id,payload.transaction_id,triage["category"],payload.description,item_name=getattr(payload,"item_name",None),order_id=payload.order_id)
    t=Ticket(ticket_number=f"RIT-{datetime.now(timezone.utc):%y%m%d}-{uuid4().hex[:6].upper()}",
       customer_id=user.id,transaction_id=payload.transaction_id,order_id=payload.order_id,
       claimed_amount=payload.claimed_amount,currency=payload.currency.upper(),description=payload.description,
       category=triage["category"],confidence=triage["confidence"],priority=priority,
       queue=ROUTES.get(triage["category"],"Manual Triage"),status=TicketStatus.TRIAGED.value,
       item_name=getattr(payload, "item_name", None) or (result["transaction"].order_id if result["transaction"] else "Customer Item"),
       item_category=getattr(payload, "item_category", None) or "GENERAL",
       customer_name=user.full_name or "Portal Customer",
       customer_email=user.email,
       payment_verification=result["status"],refund_status=(result["transaction"].payment_status if result["transaction"] else "UNKNOWN"),
       duplicate_of_id=duplicate.id if duplicate else None,recommended_action=triage["recommended_action"],
       classification_evidence={
           "matched_terms":triage["evidence"],
           "classifier":"rules-v1",
           "transaction_check":result["status"],
           "evidence_images": getattr(payload, "evidence_images", []) or []
       })
    db.add(t); db.flush()
    record_event(db,t.id,user.id,"TICKET_CREATED",{"ticket_number":t.ticket_number})
    record_event(db,t.id,None,"TRIAGE_COMPLETED",{"category":t.category,"priority":t.priority,"queue":t.queue,"duplicate_of_id":t.duplicate_of_id})
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
    currency = str(payload.get("currency", "INR")).upper()
    if currency not in {"INR", "USD", "EUR", "GBP"}:
        raise HTTPException(422, "Unsupported currency")
    transaction_id = str(payload["transaction_id"]).strip()
    if not db.get(Transaction, transaction_id):
        # Do not accept ecommerce-supplied payment facts as proof of payment.
        raise HTTPException(409, "Transaction is not available in the trusted transaction source")
    description = str(payload["description"]).strip()
    if len(description) < 8 or len(description) > 5000:
        raise HTTPException(422, "description must be between 8 and 5000 characters")
    result = verify_transaction(db, transaction_id, customer.id, amount, currency)
    triage = classify(description)
    priority = calculate_priority(triage["category"], description)
    duplicate = find_duplicate(db, customer.id, transaction_id, triage["category"], description, item_name=payload.get("item_name"), order_id=payload.get("order_id"))
    t = Ticket(ticket_number=f"RIT-{datetime.now(timezone.utc):%y%m%d}-{uuid4().hex[:6].upper()}",
        customer_id=customer.id, transaction_id=transaction_id, order_id=payload.get("order_id"),
        claimed_amount=amount, currency=currency, description=description, category=triage["category"],
        confidence=triage["confidence"], priority=priority, queue=ROUTES.get(triage["category"], "Manual Triage"),
        status=TicketStatus.TRIAGED.value, payment_verification=result["status"],
        refund_status=(result["transaction"].payment_status if result["transaction"] else "UNKNOWN"),
        duplicate_of_id=duplicate.id if duplicate else None, recommended_action=triage["recommended_action"],
        classification_evidence={"matched_terms":triage["evidence"], "classifier":"rules-v1", "source":"ecommerce_webhook", "transaction_check":result["status"]})
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
    total=len(db.scalars(stmt).all())
    rows=db.scalars(stmt.offset((page-1)*page_size).limit(page_size)).all()
    staff=user.role != Role.CUSTOMER.value
    return {"items":[ticket_view(t,include_private=staff) for t in rows],"total":total,"page":page,"page_size":page_size}

@router.get("/tickets/{ticket_id}")
def get_ticket(ticket_id: str, db: Session=Depends(get_db), user: User=Depends(get_current_user)):
    t=db.get(Ticket,ticket_id)
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

@router.post("/refunds")
def create_refund(payload:RefundCreate,db:Session=Depends(get_db),user:User=Depends(require_roles(Role.REFUNDS.value,Role.FINANCE.value,Role.ADMIN.value))):
    t=db.get(Ticket,payload.ticket_id)
    if not t: raise HTTPException(404,"Ticket not found")
    tx=db.get(Transaction,t.transaction_id)
    if not tx or t.payment_verification!="VERIFIED": raise HTTPException(409,"Refund cannot be requested until transaction ownership, amount and payment are verified")
    amount=Decimal(str(payload.amount)).quantize(Decimal("0.01"))
    remaining=Decimal(str(tx.amount))-Decimal(str(tx.refunded_amount))
    pending=db.scalars(select(RefundRequest).where(RefundRequest.transaction_id==tx.id,RefundRequest.status.in_([RefundStatus.PENDING_APPROVAL.value,RefundStatus.APPROVED.value,RefundStatus.PROCESSING.value,RefundStatus.RECONCILIATION_REQUIRED.value]))).all()
    remaining-=sum((Decimal(str(r.amount)) for r in pending),Decimal("0"))
    if amount<=0 or amount>remaining: raise HTTPException(409,"Requested amount exceeds remaining refundable balance")
    key=refund_key(t.id,amount,t.currency)
    existing=db.scalar(select(RefundRequest).where(RefundRequest.idempotency_key==key))
    if existing: return {"id":existing.id,"status":existing.status,"idempotent_replay":True}
    r=RefundRequest(ticket_id=t.id,transaction_id=tx.id,requested_by_id=user.id,amount=amount,currency=t.currency,
      status=RefundStatus.PENDING_APPROVAL.value,reason=payload.reason,idempotency_key=key)
    db.add(r); db.flush()
    record_event(db,t.id,user.id,"REFUND_REQUESTED",{"refund_id":r.id,"amount":str(amount)})
    audit(db,user.id,"REFUND_REQUESTED","refund",r.id,{"amount":str(amount),"currency":t.currency})
    db.commit(); db.refresh(r)
    return {"id":r.id,"status":r.status,"amount":float(r.amount),"currency":r.currency}

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
def execute_refund(refund_id:str,db:Session=Depends(get_db),user:User=Depends(require_roles(Role.REFUNDS.value,Role.ADMIN.value))):
    # Lock the refund row to serialize repeated clicks/worker retries on PostgreSQL.
    r=db.scalar(select(RefundRequest).where(RefundRequest.id==refund_id).with_for_update())
    if not r: raise HTTPException(404,"Refund request not found")
    if r.status==RefundStatus.REFUNDED.value: return {"id":r.id,"status":r.status,"idempotent_replay":True}
    if r.status!=RefundStatus.APPROVED.value: raise HTTPException(409,"Only an approved refund can be executed")
    if r.approved_by_id == user.id:
        raise HTTPException(409,"Separation of duties: the approver cannot execute the same refund")
    # Lock the source transaction and re-check the balance immediately before execution.
    tx=db.scalar(select(Transaction).where(Transaction.id==r.transaction_id).with_for_update())
    if not tx: raise HTTPException(409,"Source transaction is no longer available")
    amount=Decimal(str(r.amount)).quantize(Decimal("0.01"))
    available=(Decimal(str(tx.amount))-Decimal(str(tx.refunded_amount))).quantize(Decimal("0.01"))
    if amount <= 0 or amount > available:
        raise HTTPException(409,"Refund exceeds the remaining refundable balance")
    # This adapter is intentionally MOCK ONLY. It must never be represented as a real gateway call.
    r.status=RefundStatus.PROCESSING.value
    db.flush()
    tx.refunded_amount=(Decimal(str(tx.refunded_amount))+amount).quantize(Decimal("0.01"))
    r.provider_reference=f"MOCK-{uuid4().hex[:12].upper()}"
    r.status=RefundStatus.REFUNDED.value
    ticket=db.get(Ticket,r.ticket_id); ticket.refund_status=RefundStatus.REFUNDED.value
    record_event(db,ticket.id,user.id,"MOCK_REFUND_CONFIRMED",{"refund_id":r.id,"provider_reference":r.provider_reference,"mock_provider":True})
    audit(db,user.id,"MOCK_REFUND_EXECUTED","refund",r.id,{"provider_reference":r.provider_reference,"idempotency_key":r.idempotency_key})
    db.commit()
    return {"id":r.id,"status":r.status,"provider_reference":r.provider_reference,"provider":"MOCK"}

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
    return {"status":"ok","database":"configured","ai_provider":"rules-only-with-optional-provider","payment_provider":"mock-only","background_worker":"API-triggered pipeline; durable worker requires Redis/Celery deployment","agents":len(AGENTS),"orchestrator":ORCHESTRATOR["id"]}


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
def reconcile_mock_refund(refund_id:str,db:Session=Depends(get_db),
                          user:User=Depends(require_roles(Role.REFUNDS.value,Role.FINANCE.value,Role.ADMIN.value,Role.AUDITOR.value))):
    r=db.get(RefundRequest,refund_id)
    if not r: raise HTTPException(404,"Refund request not found")
    result={"refund_id":r.id,"status":r.status,"provider_reference":r.provider_reference,"provider":"MOCK",
            "reconciled_at":datetime.now(timezone.utc).isoformat()}
    audit(db,user.id,"MOCK_REFUND_RECONCILED","refund",r.id,result)
    db.commit()
    return result


@router.get("/automation/agents")
def automation_agents(user:User=Depends(require_roles(Role.SUPPORT.value,Role.SUPERVISOR.value,Role.ADMIN.value,Role.REFUNDS.value,Role.RISK.value,Role.FINANCE.value,Role.AUDITOR.value,Role.CS_1.value,Role.CS_2.value,Role.CS_3.value))):
    return {"orchestrator":ORCHESTRATOR,"agents":AGENTS,"count":len(AGENTS),"total_components":len(AGENTS)+1,
            "execution_policy":"Deterministic financial controls; no refund execution from classification or risk signals alone."}

@router.post("/automation/tickets/{ticket_id}/run")
def run_ticket_automation(ticket_id:str,db:Session=Depends(get_db),
                          user:User=Depends(require_roles(Role.SUPPORT.value,Role.SUPERVISOR.value,Role.ADMIN.value,Role.REFUNDS.value,Role.RISK.value,Role.FINANCE.value,Role.CS_1.value,Role.CS_2.value,Role.CS_3.value))):
    ticket=db.get(Ticket,ticket_id)
    if not ticket: raise HTTPException(404,"Ticket not found")
    result=run_ticket_pipeline(db,ticket,user.id)
    db.commit(); db.refresh(ticket)
    return result

@router.post("/automation/run-all")
def run_all_automation(db:Session=Depends(get_db),
                       user:User=Depends(require_roles(Role.SUPPORT.value,Role.SUPERVISOR.value,Role.ADMIN.value,Role.REFUNDS.value,Role.RISK.value,Role.FINANCE.value,Role.CS_1.value,Role.CS_2.value,Role.CS_3.value))):
    tickets = db.scalars(select(Ticket).where(Ticket.status.notin_([TicketStatus.RESOLVED.value, TicketStatus.REJECTED.value]))).all()
    results = []
    for t in tickets:
        run_ticket_pipeline(db, t, user.id)
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
      "refund_execution_mode":"MOCK_ONLY","real_provider_configured":False,
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
    ticket = db.get(Ticket, ticket_id)
    if not ticket: raise HTTPException(404, "Ticket not found")
    if ticket.payment_verification != "VERIFIED":
        raise HTTPException(409, f"Cannot issue refund: Ledger status is {ticket.payment_verification}")
    
    tx = db.get(Transaction, ticket.transaction_id)
    if not tx: raise HTTPException(404, "Transaction record not found in ledger")
    
    amount = Decimal(str(ticket.claimed_amount)).quantize(Decimal("0.01"))
    available = Decimal(str(tx.amount)) - Decimal(str(tx.refunded_amount))
    if amount <= 0 or amount > available:
        raise HTTPException(409, "Requested refund exceeds available transaction balance")

    key = refund_key(ticket.id, amount, ticket.currency)
    ref = f"MOCK-CS1-{uuid4().hex[:10].upper()}"
    
    refund_req = RefundRequest(
        ticket_id=ticket.id,
        transaction_id=tx.id,
        requested_by_id=user.id,
        amount=amount,
        currency=ticket.currency,
        status=RefundStatus.REFUNDED.value,
        reason="CS-1 Fast-Track: Automated 1-Click execution on verified genuine ticket",
        approved_by_id=user.id,
        provider_reference=ref,
        idempotency_key=key
    )
    db.add(refund_req)
    
    # Update ledger balance & ticket status
    tx.refunded_amount = (Decimal(str(tx.refunded_amount)) + amount).quantize(Decimal("0.01"))
    ticket.status = TicketStatus.RESOLVED.value
    ticket.refund_status = RefundStatus.REFUNDED.value
    ticket.refund_decided_at = datetime.now(timezone.utc)
    ticket.refund_decided_by_id = user.id
    
    comment_body = f"✅ CS-1 Fast-Track: 1-Click refund of {ticket.currency} {amount:,.2f} executed successfully. Provider Reference: {ref}."
    db.add(TicketComment(ticket_id=ticket.id, author_id=user.id, body=comment_body, internal=False))
    
    record_event(db, ticket.id, user.id, "CS1_DIRECT_REFUND_EXECUTED", {"amount": str(amount), "ref": ref, "provider": "MOCK"})
    audit(db, user.id, "CS1_DIRECT_REFUND_EXECUTED", "ticket", ticket.id, {"amount": str(amount), "ref": ref})
    db.commit()
    db.refresh(ticket)
    return {"status": "REFUNDED", "provider_reference": ref, "ticket": ticket_view(ticket)}

@router.post("/cs1/tickets/{ticket_id}/manual-decide")
def cs1_manual_decide(ticket_id:str, payload:CS1DecisionIn, db:Session=Depends(get_db),
                      user:User=Depends(require_roles(Role.CS_1.value, Role.SUPPORT.value, Role.REFUNDS.value, Role.ADMIN.value, Role.SUPERVISOR.value))):
    ticket = db.get(Ticket, ticket_id)
    if not ticket: raise HTTPException(404, "Ticket not found")
    
    decision = payload.decision.upper().strip()
    if decision == "APPROVE":
        if ticket.payment_verification != "VERIFIED":
            raise HTTPException(409, f"Cannot approve refund: Ledger status is {ticket.payment_verification}")
        tx = db.get(Transaction, ticket.transaction_id)
        if not tx: raise HTTPException(404, "Transaction record not found in ledger")
        amount = Decimal(str(ticket.claimed_amount)).quantize(Decimal("0.01"))
        ref = f"MOCK-CS1-MANUAL-{uuid4().hex[:10].upper()}"
        key = refund_key(ticket.id, amount, ticket.currency)
        
        refund_req = RefundRequest(
            ticket_id=ticket.id, transaction_id=tx.id, requested_by_id=user.id,
            amount=amount, currency=ticket.currency, status=RefundStatus.REFUNDED.value,
            reason=f"CS-1 Manual Review Approved: {payload.reason}", approved_by_id=user.id,
            provider_reference=ref, idempotency_key=key
        )
        db.add(refund_req)
        tx.refunded_amount = (Decimal(str(tx.refunded_amount)) + amount).quantize(Decimal("0.01"))
        ticket.status = TicketStatus.RESOLVED.value
        ticket.refund_status = RefundStatus.REFUNDED.value
        ticket.refund_decided_at = datetime.now(timezone.utc)
        ticket.refund_decided_by_id = user.id
        db.add(TicketComment(ticket_id=ticket.id, author_id=user.id, body=f"✅ CS-1 Verified & Approved Refund: {payload.reason} (Ref: {ref})", internal=False))
        record_event(db, ticket.id, user.id, "CS1_MANUAL_REFUND_APPROVED", {"reason": payload.reason, "ref": ref})
        audit(db, user.id, "CS1_MANUAL_REFUND_APPROVED", "ticket", ticket.id, {"reason": payload.reason, "ref": ref})
    elif decision == "CANCEL":
        ticket.status = TicketStatus.REJECTED.value
        ticket.refund_status = "CANCELLED"
        ticket.policy_evaluation_reason = f"CS-1 Manual Review Cancelled: {payload.reason}"
        ticket.refund_decided_at = datetime.now(timezone.utc)
        ticket.refund_decided_by_id = user.id
        db.add(TicketComment(ticket_id=ticket.id, author_id=user.id, body=f"❌ CS-1 Cancelled Refund: {payload.reason}", internal=False))
        record_event(db, ticket.id, user.id, "CS1_REFUND_CANCELLED", {"reason": payload.reason})
        audit(db, user.id, "CS1_REFUND_CANCELLED", "ticket", ticket.id, {"reason": payload.reason})
    else:
        raise HTTPException(400, "Decision must be 'APPROVE' or 'CANCEL'")

    db.commit()
    db.refresh(ticket)
    return {"status": ticket.status, "ticket": ticket_view(ticket)}

@router.post("/cs2/tickets/{ticket_id}/send-proof-request")
def cs2_send_proof_request(ticket_id:str, payload:ProofRequestIn, db:Session=Depends(get_db),
                           user:User=Depends(require_roles(Role.CS_2.value, Role.SUPPORT.value, Role.REFUNDS.value, Role.ADMIN.value, Role.SUPERVISOR.value))):
    ticket = db.get(Ticket, ticket_id)
    if not ticket: raise HTTPException(404, "Ticket not found")
    
    ticket.proof_status = "REQUESTED"
    ticket.proof_request_sent_at = datetime.now(timezone.utc)
    ticket.status = TicketStatus.AWAITING_INFORMATION.value
    
    dest = ticket.customer_phone or ticket.customer_email or "Customer Mobile"
    db.add(TicketComment(
        ticket_id=ticket.id,
        author_id=user.id,
        body=f"📲 [CS-2 Dispatch to {dest}]:\n{payload.message}",
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
    
    ticket.status = TicketStatus.REJECTED.value
    ticket.rejection_notice_sent_at = datetime.now(timezone.utc)
    if payload.reason:
        ticket.policy_evaluation_reason = payload.reason
        
    dest = ticket.customer_phone or ticket.customer_email or "Customer Mobile"
    db.add(TicketComment(
        ticket_id=ticket.id,
        author_id=user.id,
        body=f"📩 [CS-3 Policy Rejection Notice dispatched to {dest}]:\n{payload.message}",
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
    x_ecommerce_secret: str | None = Header(None, alias="X-Ecommerce-Secret")
):
    # Verify optional webhook secret
    if settings.ecommerce_webhook_secret and x_ecommerce_secret != settings.ecommerce_webhook_secret:
        raise HTTPException(401, "Invalid or missing X-Ecommerce-Secret header")

    # Find customer or create fallback customer
    cust = db.scalar(select(User).where(User.email == (payload.customer_email or "customer@ritos.local")))
    if not cust:
        cust = db.scalar(select(User).where(User.role == Role.CUSTOMER.value))
    customer_id = cust.id if cust else str(uuid4())

    # Ensure transaction exists or record in ledger for lookup
    tx = db.get(Transaction, payload.transaction_id)
    if not tx:
        # If new transaction provided by eCommerce store, register it as successful
        tx = Transaction(
            id=payload.transaction_id,
            customer_id=customer_id,
            order_id=payload.order_id,
            amount=Decimal(str(payload.claimed_amount)).quantize(Decimal("0.01")),
            currency=payload.currency.upper() if payload.currency else "INR",
            payment_status="SUCCESSFUL",
            refunded_amount=Decimal("0.00"),
            provider_reference=f"ECOM-{payload.transaction_id}"
        )
        db.add(tx)
        db.flush()

    ticket_number = f"RIT-ECOM-{uuid4().hex[:6].upper()}"
    p_date = None
    if payload.purchase_date:
        try:
            p_date = datetime.fromisoformat(payload.purchase_date)
        except Exception:
            p_date = None

    ticket = Ticket(
        ticket_number=ticket_number,
        customer_id=customer_id,
        transaction_id=payload.transaction_id,
        order_id=payload.order_id,
        claimed_amount=payload.claimed_amount,
        currency=payload.currency.upper() if payload.currency else "INR",
        description=payload.description,
        customer_name=payload.customer_name or "Valued Customer",
        customer_email=payload.customer_email,
        customer_phone=payload.customer_phone,
        item_name=payload.item_name or "Product Item",
        item_category=(payload.item_category or "GENERAL").upper(),
        purchase_date=p_date or datetime.now(timezone.utc)
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
def handle_proof_action(ticket_id: str, payload: ProofActionPayload, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = db.get(Ticket, ticket_id)
    if not t: raise HTTPException(404, "Ticket not found")
    
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
    
    tx = db.get(Transaction, t.transaction_id)
    if not tx: raise HTTPException(404, "Transaction ledger entry not found")
    
    amount = Decimal(str(t.claimed_amount)).quantize(Decimal("0.01"))
    tx.refunded_amount = (Decimal(str(tx.refunded_amount)) + amount).quantize(Decimal("0.01"))
    provider_ref = f"MOCK-PAYOUT-{uuid4().hex[:10].upper()}"
    
    t.refund_status = "REFUNDED"
    t.status = TicketStatus.RESOLVED.value
    t.refund_decided_at = datetime.now(timezone.utc)
    t.refund_decided_by_id = user.id
    
    record_event(db, t.id, user.id, "FINANCE_PAYOUT_EXECUTED", {
        "amount": str(amount), "currency": t.currency, "provider_reference": provider_ref
    })
    audit(db, user.id, "FINANCE_PAYOUT_EXECUTED", "ticket", t.id, {
        "amount": str(amount), "provider_reference": provider_ref, "approver": user.email
    })
    db.commit()
    db.refresh(t)
    return {
        "status": "REFUNDED",
        "provider_reference": provider_ref,
        "amount": float(amount),
        "ticket": ticket_view(t)
    }

# ==========================================
# SHOPFLOW INTEGRATION ENDPOINTS
# ==========================================
from pydantic import BaseModel
from typing import Optional
from .shopflow import process_shopflow_event, check_shopflow_health

class ShopflowWebhookPayload(BaseModel):
    model_config = {"extra": "allow"}
    event_id: Optional[str] = None
    event_type: Optional[str] = "refund.ticket.created"
    ticket_id: str
    status: Optional[str] = "PENDING_RITOS"

@router.post("/webhook/refund-tickets")
@router.post("/webhooks/shopflow")
def shopflow_webhook(payload: ShopflowWebhookPayload,
                     authorization: Optional[str] = Header(None),
                     db: Session = Depends(get_db)):
    """
    Webhook receiver for ShopFlow refund events.
    Fetches claim context from ShopFlow, executes the 8-specialist agent orchestrator,
    and returns the adjudication decision callback.
    """
    # Verify Bearer token if provided
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1].strip()
        if settings.ritos_api_key and token != settings.ritos_api_key:
            raise HTTPException(401, "Invalid RITOS API key")

    try:
        raw_dict = payload.model_dump()
        result = process_shopflow_event(db, payload.ticket_id, payload.event_id, fallback_payload=raw_dict)
        return {
            "status": "SUCCESS",
            "message": "ShopFlow ticket adjudicated and decision submitted",
            "data": result
        }
    except Exception as e:
        raise HTTPException(500, f"ShopFlow processing error: {str(e)}")

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
            "message": f"ShopFlow at {settings.shopflow_base_url} is currently unreachable. Start ShopFlow on port 3000 to sync live claims.",
            "synced_count": 0
        }

    # Attempt to fetch pending tickets queue from ShopFlow
    import httpx
    url = f"{settings.shopflow_base_url}/api/refunds?status=PENDING_RITOS"
    headers = {"Authorization": f"Bearer {settings.ritos_api_key}"}
    synced = []
    try:
        with httpx.Client(timeout=10.0) as client:
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


