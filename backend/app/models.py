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
    payment_status: Mapped[str]=mapped_column(String(30), default="UNKNOWN")  # a payment is never assumed captured
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

class AccountType(str, enum.Enum):
    ASSET = "ASSET"
    LIABILITY = "LIABILITY"
    EQUITY = "EQUITY"
    REVENUE = "REVENUE"
    EXPENSE = "EXPENSE"

class EntryType(str, enum.Enum):
    DEBIT = "DEBIT"
    CREDIT = "CREDIT"

class JournalStatus(str, enum.Enum):
    POSTED = "POSTED"
    REVERSED = "REVERSED"

class EvidenceLifecycle(str, enum.Enum):
    UPLOADED = "UPLOADED"
    VALIDATED = "VALIDATED"
    IDENTITY_CHECKED = "IDENTITY_CHECKED"
    DEFECT_CHECKED = "DEFECT_CHECKED"
    ADJUDICATED = "ADJUDICATED"
    REJECTED = "REJECTED"
    INCONCLUSIVE = "INCONCLUSIVE"
    AWAITING_CUSTOMER = "AWAITING_CUSTOMER"
    AWAITING_REVIEW = "AWAITING_REVIEW"
    PROCESSING_FAILED = "PROCESSING_FAILED"

class LedgerAccount(Base):
    __tablename__ = "ledger_accounts"
    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    account_type: Mapped[str] = mapped_column(String(20), default=AccountType.LIABILITY.value)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    entries: Mapped[list["LedgerEntry"]] = relationship(back_populates="account")

class LedgerJournal(Base):
    """Immutable double-entry journal entry. Debits MUST equal credits."""
    __tablename__ = "ledger_journals"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    refund_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("refund_requests.id"), nullable=True, index=True)
    ticket_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("tickets.id"), nullable=True, index=True)
    transaction_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    idempotency_key: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    posted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    posted_by_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default=JournalStatus.POSTED.value)
    description: Mapped[str] = mapped_column(Text)
    entries: Mapped[list["LedgerEntry"]] = relationship(back_populates="journal", cascade="all, delete-orphan")

class LedgerEntry(Base):
    """Individual debit or credit leg of a double-entry journal, stored in minor units."""
    __tablename__ = "ledger_entries"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    journal_id: Mapped[str] = mapped_column(ForeignKey("ledger_journals.id"), index=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("ledger_accounts.id"), index=True)
    entry_type: Mapped[str] = mapped_column(String(10)) # DEBIT or CREDIT
    amount_minor: Mapped[int] = mapped_column(Integer) # Integer minor units (paise / cents)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    journal: Mapped["LedgerJournal"] = relationship(back_populates="entries")
    account: Mapped["LedgerAccount"] = relationship(back_populates="entries")

class GatewaySettlementAttempt(Base):
    """Tracks gateway execution attempts, timeouts, idempotency, and reconciliation."""
    __tablename__ = "gateway_settlement_attempts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    refund_id: Mapped[str] = mapped_column(ForeignKey("refund_requests.id"), index=True)
    provider: Mapped[str] = mapped_column(String(40))
    provider_reference: Mapped[str | None] = mapped_column(String(120), nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="INITIATED")
    amount_minor: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    idempotency_key: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_response: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

class IdempotencyRecord(Base):
    """Persisted request fingerprinting and replay cache."""
    __tablename__ = "idempotency_records"
    id: Mapped[str] = mapped_column(String(120), primary_key=True) # idempotency key
    fingerprint_hash: Mapped[str] = mapped_column(String(64))
    route: Mapped[str] = mapped_column(String(120))
    status_code: Mapped[int] = mapped_column(Integer)
    response_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

class Product(Base):
    """Authoritative product catalog for model matching and evidence validation."""
    __tablename__ = "products"
    sku: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(150))
    category: Mapped[str] = mapped_column(String(50), default="GENERAL")
    brand: Mapped[str] = mapped_column(String(80), default="")
    model: Mapped[str] = mapped_column(String(80), default="")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price_minor: Mapped[int] = mapped_column(Integer, default=0)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    variants: Mapped[list["ProductVariant"]] = relationship(back_populates="product", cascade="all, delete-orphan")
    reference_images: Mapped[list["ProductReferenceImage"]] = relationship(back_populates="product", cascade="all, delete-orphan")

class ProductVariant(Base):
    __tablename__ = "product_variants"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    product_sku: Mapped[str] = mapped_column(ForeignKey("products.sku"), index=True)
    sku: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    color: Mapped[str | None] = mapped_column(String(50), nullable=True)
    size: Mapped[str | None] = mapped_column(String(30), nullable=True)
    variant_name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    product: Mapped["Product"] = relationship(back_populates="variants")

class ProductReferenceImage(Base):
    """Merchant catalog reference photographs for visual identity and seam verification."""
    __tablename__ = "product_reference_images"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    product_sku: Mapped[str] = mapped_column(ForeignKey("products.sku"), index=True)
    variant_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    image_url: Mapped[str] = mapped_column(String(255))
    view_type: Mapped[str] = mapped_column(String(40), default="HERO") # HERO, DETAIL, LABEL, SEAM, HANDLE
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    product: Mapped["Product"] = relationship(back_populates="reference_images")

class EvidenceFile(Base):
    """Auditable evidence lifecycle tracking with cryptographic hash and verification status."""
    __tablename__ = "evidence_files"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    ticket_id: Mapped[str] = mapped_column(ForeignKey("tickets.id"), index=True)
    file_name: Mapped[str] = mapped_column(String(255))
    file_type: Mapped[str] = mapped_column(String(50))
    file_size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    sha256_hash: Mapped[str] = mapped_column(String(64), index=True)
    storage_path: Mapped[str] = mapped_column(String(255))
    lifecycle_status: Mapped[str] = mapped_column(String(40), default=EvidenceLifecycle.UPLOADED.value)
    verification_result: Mapped[dict] = mapped_column(JSON, default=dict)
    tamper_flags: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

class ReturnPolicy(Base):
    """Versioned refund policy rules for automated deterministic policy evaluation."""
    __tablename__ = "return_policies"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    category: Mapped[str] = mapped_column(String(50), index=True)
    policy_version: Mapped[int] = mapped_column(Integer, default=1)
    return_window_days: Mapped[int] = mapped_column(Integer, default=14)
    requires_serial: Mapped[bool] = mapped_column(Boolean, default=False)
    requires_tags: Mapped[bool] = mapped_column(Boolean, default=False)
    allow_damaged_exceptions: Mapped[bool] = mapped_column(Boolean, default=False)  # never assumed; set per policy
    policy_summary: Mapped[str] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

class CarrierShipment(Base):
    """Carrier tracking and milestone delivery verification."""
    __tablename__ = "carrier_shipments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    order_id: Mapped[str] = mapped_column(String(80), index=True)
    carrier_name: Mapped[str] = mapped_column(String(60))
    tracking_number: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(40), default="IN_TRANSIT")
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    proof_of_delivery_ref: Mapped[str | None] = mapped_column(String(120), nullable=True)
    destination_postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    weight_grams: Mapped[int | None] = mapped_column(Integer, nullable=True)
    carrier_events: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
