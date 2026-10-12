import enum, uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, ForeignKey, Integer, Boolean, Numeric, JSON, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base

def now_utc():
    return datetime.now(timezone.utc)

class Role(str, enum.Enum):
    CUSTOMER="customer"
    SUPPORT="support_agent"
    REFUNDS="refund_operations"
    RISK="risk_analyst"
    SUPERVISOR="supervisor"
    FINANCE="finance_approver"
    ADMIN="administrator"
    AUDITOR="auditor"
    CS_1="cs_1"
    CS_2="cs_2"
    CS_3="cs_3"

class DecisionBucket(str, enum.Enum):
    GENUINE_REFUNDABLE="GENUINE_REFUNDABLE"
    EXCEPTIONAL_PROOF_NEEDED="EXCEPTIONAL_PROOF_NEEDED"
    NON_REFUNDABLE="NON_REFUNDABLE"

class AssignedDesk(str, enum.Enum):
    CS_1="CS_1"
    CS_2="CS_2"
    CS_3="CS_3"
    SUPERVISOR="SUPERVISOR"

class TicketStatus(str, enum.Enum):
    NEW="NEW"
    TRIAGED="TRIAGED"
    IN_REVIEW="IN_REVIEW"
    AWAITING_INFORMATION="AWAITING_INFORMATION"
    ESCALATED="ESCALATED"
    RESOLVED="RESOLVED"
    REJECTED="REJECTED"
    REOPENED="REOPENED"

class RefundStatus(str, enum.Enum):
    DRAFT="DRAFT"
    PENDING_APPROVAL="PENDING_APPROVAL"
    APPROVED="APPROVED"
    REJECTED="REJECTED"
    PROCESSING="PROCESSING"
    REFUNDED="REFUNDED"
    FAILED="FAILED"
    RECONCILIATION_REQUIRED="RECONCILIATION_REQUIRED"

class User(Base):
    __tablename__="users"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda:str(uuid.uuid4()))
    email: Mapped[str]=mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str]=mapped_column(String(120))
    password_hash: Mapped[str]=mapped_column(String(255))
    role: Mapped[str]=mapped_column(String(40), index=True)
    active: Mapped[bool]=mapped_column(Boolean, default=True)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now_utc)

class Transaction(Base):
    __tablename__="transactions"
    id: Mapped[str]=mapped_column(String(80), primary_key=True)
    customer_id: Mapped[str]=mapped_column(String(36), index=True)
    order_id: Mapped[str]=mapped_column(String(80), index=True)
    amount: Mapped[float]=mapped_column(Numeric(12,2))
    currency: Mapped[str]=mapped_column(String(3), default="INR")
    payment_status: Mapped[str]=mapped_column(String(30), default="SUCCESSFUL")
    refunded_amount: Mapped[float]=mapped_column(Numeric(12,2), default=0)
    provider_reference: Mapped[str|None]=mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now_utc)

class Ticket(Base):
    __tablename__="tickets"
    __table_args__=(Index("ix_ticket_customer_transaction", "customer_id", "transaction_id"),)
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda:str(uuid.uuid4()))
    ticket_number: Mapped[str]=mapped_column(String(24), unique=True, index=True)
    customer_id: Mapped[str]=mapped_column(String(36), index=True)
    transaction_id: Mapped[str]=mapped_column(String(80), index=True)
    order_id: Mapped[str|None]=mapped_column(String(80), nullable=True)
    claimed_amount: Mapped[float]=mapped_column(Numeric(12,2))
    currency: Mapped[str]=mapped_column(String(3), default="INR")
    description: Mapped[str]=mapped_column(Text)
    category: Mapped[str]=mapped_column(String(50), default="OTHER")
    confidence: Mapped[float]=mapped_column(Numeric(5,4), default=0)
    priority: Mapped[str]=mapped_column(String(2), default="P3")
    queue: Mapped[str]=mapped_column(String(80), default="Manual Triage")
    status: Mapped[str]=mapped_column(String(40), default=TicketStatus.NEW.value)
    payment_verification: Mapped[str]=mapped_column(String(40), default="MANUAL_VERIFICATION_REQUIRED")
    refund_status: Mapped[str]=mapped_column(String(40), default="UNKNOWN")
    duplicate_of_id: Mapped[str|None]=mapped_column(String(36), ForeignKey("tickets.id"), nullable=True)
    assigned_to_id: Mapped[str|None]=mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    recommended_action: Mapped[str]=mapped_column(Text, default="Review transaction records.")
    classification_evidence: Mapped[dict]=mapped_column(JSON, default=dict)
    decision_bucket: Mapped[str]=mapped_column(String(50), default="EXCEPTIONAL_PROOF_NEEDED", index=True)
    assigned_desk: Mapped[str]=mapped_column(String(30), default="CS_2", index=True)
    customer_name: Mapped[str|None]=mapped_column(String(120), nullable=True)
    customer_phone: Mapped[str|None]=mapped_column(String(30), nullable=True)
    customer_email: Mapped[str|None]=mapped_column(String(255), nullable=True)
    item_name: Mapped[str|None]=mapped_column(String(150), nullable=True)
    item_category: Mapped[str|None]=mapped_column(String(50), default="GENERAL")
    purchase_date: Mapped[datetime|None]=mapped_column(DateTime(timezone=True), nullable=True)
    customer_message_draft: Mapped[str|None]=mapped_column(Text, nullable=True)
    policy_evaluation_reason: Mapped[str|None]=mapped_column(Text, nullable=True)
    proof_required: Mapped[str|None]=mapped_column(String(100), nullable=True)
    proof_status: Mapped[str]=mapped_column(String(30), default="NOT_REQUESTED")
    proof_request_sent_at: Mapped[datetime|None]=mapped_column(DateTime(timezone=True), nullable=True)
    rejection_notice_sent_at: Mapped[datetime|None]=mapped_column(DateTime(timezone=True), nullable=True)
    refund_decided_at: Mapped[datetime|None]=mapped_column(DateTime(timezone=True), nullable=True)
    refund_decided_by_id: Mapped[str|None]=mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)
    comments: Mapped[list["TicketComment"]]=relationship(back_populates="ticket", cascade="all, delete-orphan")
    events: Mapped[list["TicketEvent"]]=relationship(back_populates="ticket", cascade="all, delete-orphan")

class TicketComment(Base):
    __tablename__="ticket_comments"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda:str(uuid.uuid4()))
    ticket_id: Mapped[str]=mapped_column(ForeignKey("tickets.id"), index=True)
    author_id: Mapped[str]=mapped_column(ForeignKey("users.id"))
    body: Mapped[str]=mapped_column(Text)
    internal: Mapped[bool]=mapped_column(Boolean, default=False)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now_utc)
    ticket: Mapped["Ticket"]=relationship(back_populates="comments")

class TicketEvent(Base):
    __tablename__="ticket_events"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda:str(uuid.uuid4()))
    ticket_id: Mapped[str]=mapped_column(ForeignKey("tickets.id"), index=True)
    actor_id: Mapped[str|None]=mapped_column(String(36), nullable=True)
    event_type: Mapped[str]=mapped_column(String(80))
    details: Mapped[dict]=mapped_column(JSON, default=dict)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now_utc)
    ticket: Mapped["Ticket"]=relationship(back_populates="events")

class RefundRequest(Base):
    __tablename__="refund_requests"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda:str(uuid.uuid4()))
    ticket_id: Mapped[str]=mapped_column(ForeignKey("tickets.id"), index=True)
    transaction_id: Mapped[str]=mapped_column(ForeignKey("transactions.id"), index=True)
    requested_by_id: Mapped[str]=mapped_column(ForeignKey("users.id"))
    amount: Mapped[float]=mapped_column(Numeric(12,2))
    currency: Mapped[str]=mapped_column(String(3), default="INR")
    status: Mapped[str]=mapped_column(String(40), default=RefundStatus.PENDING_APPROVAL.value)
    reason: Mapped[str]=mapped_column(Text)
    approved_by_id: Mapped[str|None]=mapped_column(ForeignKey("users.id"), nullable=True)
    provider_reference: Mapped[str|None]=mapped_column(String(120), nullable=True)
    idempotency_key: Mapped[str]=mapped_column(String(100), unique=True)
    rejection_reason: Mapped[str|None]=mapped_column(Text, nullable=True)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

class WorkflowRun(Base):
    """One execution of the orchestrator for a ticket (intake, re-run, or a human decision resuming it)."""
    __tablename__="workflow_runs"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda:str(uuid.uuid4()))
    ticket_id: Mapped[str]=mapped_column(ForeignKey("tickets.id"), index=True)
    trigger: Mapped[str]=mapped_column(String(40))
    status: Mapped[str]=mapped_column(String(30), default="RUNNING", index=True)
    next_action: Mapped[str|None]=mapped_column(String(40), nullable=True)
    decision: Mapped[str|None]=mapped_column(String(60), nullable=True)
    actor_id: Mapped[str|None]=mapped_column(String(36), nullable=True)
    error: Mapped[str|None]=mapped_column(Text, nullable=True)
    started_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now_utc)
    finished_at: Mapped[datetime|None]=mapped_column(DateTime(timezone=True), nullable=True)
    steps: Mapped[list["WorkflowStep"]]=relationship(back_populates="run", cascade="all, delete-orphan", order_by="WorkflowStep.seq")

class WorkflowStep(Base):
    __tablename__="workflow_steps"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda:str(uuid.uuid4()))
    run_id: Mapped[str]=mapped_column(ForeignKey("workflow_runs.id"), index=True)
    seq: Mapped[int]=mapped_column(Integer)
    step_id: Mapped[str]=mapped_column(String(60))
    name: Mapped[str]=mapped_column(String(120))
    status: Mapped[str]=mapped_column(String(20))
    output: Mapped[dict]=mapped_column(JSON, default=dict)
    error: Mapped[str|None]=mapped_column(Text, nullable=True)
    started_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now_utc)
    duration_ms: Mapped[int]=mapped_column(Integer, default=0)
    run: Mapped["WorkflowRun"]=relationship(back_populates="steps")

class OutboxMessage(Base):
    """Durable outbound call to the store (status, decision, notification), delivered in order with retries."""
    __tablename__="outbox_messages"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda:str(uuid.uuid4()))
    ticket_id: Mapped[str|None]=mapped_column(String(36), index=True, nullable=True)
    kind: Mapped[str]=mapped_column(String(40))
    path: Mapped[str]=mapped_column(String(255))
    payload: Mapped[dict]=mapped_column(JSON, default=dict)
    idempotency_key: Mapped[str]=mapped_column(String(120), unique=True)
    status: Mapped[str]=mapped_column(String(20), default="PENDING", index=True)
    attempts: Mapped[int]=mapped_column(Integer, default=0)
    next_attempt_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now_utc)
    last_error: Mapped[str|None]=mapped_column(Text, nullable=True)
    response: Mapped[dict|None]=mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now_utc)
    sent_at: Mapped[datetime|None]=mapped_column(DateTime(timezone=True), nullable=True)

class InboundEvent(Base):
    """Webhook events already processed, so store retries never run the workflow twice."""
    __tablename__="inbound_events"
    id: Mapped[str]=mapped_column(String(120), primary_key=True)
    source: Mapped[str]=mapped_column(String(40))
    event_type: Mapped[str]=mapped_column(String(80))
    external_ticket_id: Mapped[str|None]=mapped_column(String(80), index=True, nullable=True)
    result: Mapped[dict]=mapped_column(JSON, default=dict)
    received_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now_utc)

class AuditLog(Base):
    __tablename__="audit_logs"
    id: Mapped[str]=mapped_column(String(36), primary_key=True, default=lambda:str(uuid.uuid4()))
    actor_id: Mapped[str|None]=mapped_column(String(36), nullable=True)
    action: Mapped[str]=mapped_column(String(100), index=True)
    entity_type: Mapped[str]=mapped_column(String(60))
    entity_id: Mapped[str]=mapped_column(String(80), index=True)
    details: Mapped[dict]=mapped_column(JSON, default=dict)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now_utc)
