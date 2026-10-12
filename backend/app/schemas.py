from pydantic import BaseModel, Field, ConfigDict
from typing import Optional

class LoginIn(BaseModel):
    email: str
    password: str

class TicketCreate(BaseModel):
    transaction_id: str = Field(min_length=3, max_length=80)
    order_id: Optional[str] = Field(default=None, max_length=80)
    claimed_amount: float = Field(gt=0, le=100000000)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    description: str = Field(min_length=8, max_length=5000)
    item_name: Optional[str] = None
    item_category: Optional[str] = None
    evidence_images: Optional[list] = None

class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=5000)
    internal: bool = False

class TicketUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_to_id: Optional[str] = None
    queue: Optional[str] = None

class RefundCreate(BaseModel):
    ticket_id: str
    amount: float = Field(gt=0, le=100000000)
    reason: str = Field(min_length=5, max_length=1000)

class RefundDecision(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

class TicketOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    ticket_number: str
    customer_id: str
    transaction_id: str
    order_id: Optional[str]
    claimed_amount: float
    currency: str
    description: str
    category: str
    confidence: float
    priority: str
    queue: str
    status: str
    payment_verification: str
    refund_status: str
    duplicate_of_id: Optional[str]
    assigned_to_id: Optional[str]
    recommended_action: str
    created_at: str
    updated_at: str

class CS1DecisionIn(BaseModel):
    decision: str = Field(description="'APPROVE' or 'CANCEL'")
    reason: str = Field(min_length=3, max_length=1000)

class ProofRequestIn(BaseModel):
    message: str = Field(min_length=5, max_length=2000)
    proof_type: Optional[str] = "PHOTO_OF_ITEM,SHIPPING_LABEL_PHOTO"

class RejectionNoticeIn(BaseModel):
    message: str = Field(min_length=5, max_length=2000)
    reason: Optional[str] = None

class EcommerceTicketIn(BaseModel):
    order_id: str
    transaction_id: str
    customer_name: Optional[str] = "Customer"
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    item_name: Optional[str] = "Product Item"
    item_category: Optional[str] = "GENERAL"
    claimed_amount: float = Field(gt=0)
    currency: Optional[str] = "INR"
    purchase_date: Optional[str] = None
    description: str = Field(min_length=5, max_length=5000)

class EvidenceUploadIn(BaseModel):
    ticket_id: str
    file_name: str = Field(min_length=1, max_length=255)
    file_type: str = Field(default="image/jpeg", max_length=50)
    base64_data: str = Field(min_length=10)

class EvidenceVerifyIn(BaseModel):
    ticket_id: Optional[str] = None
    claimed_defect: str = Field(min_length=3, max_length=1000)
    product_sku: Optional[str] = None
    product_name: Optional[str] = None
    product_category: Optional[str] = "GENERAL"
    evidence_items: list = Field(default_factory=list)

class SettlementExecuteIn(BaseModel):
    provider: Optional[str] = "SANDBOX"


