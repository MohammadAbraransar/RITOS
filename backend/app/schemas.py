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
    classification_evidence: dict
    created_at: str
    updated_at: str
