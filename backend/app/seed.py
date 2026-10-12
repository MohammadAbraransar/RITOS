from datetime import datetime, timezone, timedelta
from sqlalchemy import select
from .database import SessionLocal, init_db
from .models import User, Transaction, Ticket
from .security import hash_password
from .config import settings
from .agents import run_ticket_pipeline

USERS = [
    ("customer@ritos.local", "Riya Customer", "customer"),
    ("agent@ritos.local", "Aarav Support", "support_agent"),
    ("cs1@ritos.local", "Aarav (CS-1 Fast-Track)", "cs_1"),
    ("cs2@ritos.local", "Pooja (CS-2 Exceptions)", "cs_2"),
    ("cs3@ritos.local", "Rohan (CS-3 Denials)", "cs_3"),
    ("refunds@ritos.local", "Mira Refund Operations", "refund_operations"),
    ("risk@ritos.local", "Kabir Risk Analyst", "risk_analyst"),
    ("lead@ritos.local", "Anaya Team Lead", "supervisor"),
    ("finance@ritos.local", "Dev Finance Approver", "finance_approver"),
    ("admin@ritos.local", "System Administrator", "administrator"),
    ("audit@ritos.local", "Ishita Auditor", "auditor"),
]

def main():
    init_db()
    db = SessionLocal()
    try:
        users = {}
        for email, name, role in USERS:
            u = db.scalar(select(User).where(User.email == email))
            if not u:
                u = User(email=email, full_name=name, role=role, password_hash=hash_password(settings.seed_password))
                db.add(u)
                db.flush()
            users[role] = u

        customer = users["customer"]
        now = datetime.now(timezone.utc)

        txs = [
            ("TXN-1001", "ORD-1001", 1500.00, "SUCCESSFUL", 0),
            ("TXN-1002", "ORD-1002", 2499.00, "SUCCESSFUL", 0),
            ("TXN-1003", "ORD-1003", 799.00, "SUCCESSFUL", 0),
            ("TXN-1004", "ORD-1004", 1200.00, "PENDING", 0),
            ("TXN-1005", "ORD-1005", 1500.00, "SUCCESSFUL", 0),
        ]
        for txid, order, amount, status, refunded in txs:
            if not db.get(Transaction, txid):
                db.add(Transaction(
                    id=txid, customer_id=customer.id, order_id=order, amount=amount,
                    currency="INR", payment_status=status, refunded_amount=refunded,
                    provider_reference=f"DEMO-{txid}"
                ))
        db.commit()

        # Seed sample tickets across all 3 desks if not already created
        sample_tickets = [
            {
                "num": "RIT-CS1-GENUINE",
                "tx": "TXN-1005",
                "order": "ORD-1005",
                "item": "Ergonomic Office Chair",
                "cat": "GENERAL",
                "amt": 1500.00,
                "phone": "+91-9876543210",
                "desc": "I cancelled this order before delivery due to relocation. Please process my cancellation refund to my bank.",
                "days_ago": 2
            },
            {
                "num": "RIT-CS2-EXCEPTION",
                "tx": "TXN-1002",
                "order": "ORD-1002",
                "item": "Sony Wireless Headphones",
                "cat": "ELECTRONICS",
                "amt": 2499.00,
                "phone": "+91-9876543211",
                "desc": "The parcel arrived with a crushed box and the headphone left hinge is broken and sound is distorted.",
                "days_ago": 3
            },
            {
                "num": "RIT-ORD-1001",
                "tx": "TXN-1001",
                "order": "ORD-1001",
                "item": "Wireless Mechanical Keyboard",
                "cat": "ELECTRONICS",
                "amt": 1500.00,
                "phone": "+91-9876543210",
                "desc": "Order cancelled prior to dispatch. Refund initiated by Support operations.",
                "days_ago": 1
            },
            {
                "num": "RIT-CS3-REJECTED",
                "tx": "TXN-1003",
                "order": "ORD-1003",
                "item": "Organic Skincare Serum",
                "cat": "HYGIENE",
                "amt": 799.00,
                "phone": "+91-9876543212",
                "desc": "I opened and used the face serum twice but did not like the fragrance. I want a complete refund.",
                "days_ago": 5
            }
        ]

        ticket_1001 = None
        for s in sample_tickets:
            t = db.scalar(select(Ticket).where(Ticket.ticket_number == s["num"]))
            if not t:
                p_date = now - timedelta(days=s["days_ago"])
                t = Ticket(
                    ticket_number=s["num"],
                    customer_id=customer.id,
                    transaction_id=s["tx"],
                    order_id=s["order"],
                    item_name=s["item"],
                    item_category=s["cat"],
                    claimed_amount=s["amt"],
                    currency="INR",
                    customer_name="Riya Sharma",
                    customer_phone=s["phone"],
                    customer_email="customer@ritos.local",
                    purchase_date=p_date,
                    description=s["desc"]
                )
                db.add(t)
                db.flush()
                run_ticket_pipeline(db, t)
            if s["num"] == "RIT-ORD-1001":
                ticket_1001 = t

        # Seed sample RefundRequest for dual-custody Finance Approver workflow
        from .models import RefundRequest, RefundStatus
        from decimal import Decimal
        from uuid import uuid4

        # 1. Pending Dual-Custody Approval
        if ticket_1001 and not db.scalar(select(RefundRequest).where(RefundRequest.ticket_id == ticket_1001.id)):
            req_user = users.get("refund_operations") or users.get("administrator")
            db.add(RefundRequest(
                ticket_id=ticket_1001.id,
                transaction_id="TXN-1001",
                requested_by_id=req_user.id,
                amount=Decimal("1500.00"),
                currency="INR",
                status=RefundStatus.PENDING_APPROVAL.value,
                reason="Pre-dispatch cancellation verified against warehouse ledger; pending Finance four-eyes sign-off.",
                idempotency_key=f"seed-refund-{ticket_1001.id}"
            ))

        # 2. Executed Settled Refund for TXN-1005
        t_1005 = db.scalar(select(Ticket).where(Ticket.ticket_number == "RIT-CS1-GENUINE"))
        if t_1005 and not db.scalar(select(RefundRequest).where(RefundRequest.ticket_id == t_1005.id)):
            req_user = users.get("cs_1") or users.get("administrator")
            app_user = users.get("finance_approver") or users.get("administrator")
            db.add(RefundRequest(
                ticket_id=t_1005.id,
                transaction_id="TXN-1005",
                requested_by_id=req_user.id,
                amount=Decimal("1500.00"),
                currency="INR",
                status=RefundStatus.REFUNDED.value,
                approved_by_id=app_user.id,
                provider_reference="MOCK-SETTLE-881920",
                reason="CS-1 automated fast-track settlement credited to customer bank account.",
                idempotency_key=f"seed-settle-{t_1005.id}"
            ))
            # Mark ticket as resolved
            t_1005.status = "RESOLVED"
            t_1005.refund_status = "REFUNDED"
        
        db.commit()
        print("Seed complete. Development-only accounts:")
        print("Password:", settings.seed_password)
        for email, _, role in USERS:
            print(f"  {role:20} {email}")
        print("Seeded Desks: CS-1 (Genuine), CS-2 (Exceptions), CS-3 (Ineligible/Non-refundable)")
    finally:
        db.close()

if __name__ == "__main__":
    main()
