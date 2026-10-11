from sqlalchemy import select
from .database import Base, engine, SessionLocal
from .models import User, Transaction, Ticket
from .security import hash_password
from .config import settings
from .services import classify, calculate_priority, ROUTES

USERS=[
 ("customer@ritos.local","Riya Customer","customer"),
 ("agent@ritos.local","Aarav Support","support_agent"),
 ("refunds@ritos.local","Mira Refund Operations","refund_operations"),
 ("risk@ritos.local","Kabir Risk Analyst","risk_analyst"),
 ("lead@ritos.local","Anaya Team Lead","supervisor"),
 ("finance@ritos.local","Dev Finance Approver","finance_approver"),
 ("admin@ritos.local","System Administrator","administrator"),
 ("audit@ritos.local","Ishita Auditor","auditor"),
]
def main():
    Base.metadata.create_all(bind=engine)
    db=SessionLocal()
    try:
        users={}
        for email,name,role in USERS:
            u=db.scalar(select(User).where(User.email==email))
            if not u:
                u=User(email=email,full_name=name,role=role,password_hash=hash_password(settings.seed_password))
                db.add(u); db.flush()
            users[role]=u
        customer=users["customer"]
        txs=[
          ("TXN-1001","ORD-1001",1500.00,"SUCCESSFUL",0),
          ("TXN-1002","ORD-1002",2499.00,"SUCCESSFUL",0),
          ("TXN-1003","ORD-1003",799.00,"SUCCESSFUL",0),
          ("TXN-1004","ORD-1004",1200.00,"PENDING",0),
        ]
        for txid,order,amount,status,refunded in txs:
            if not db.get(Transaction,txid):
                db.add(Transaction(id=txid,customer_id=customer.id,order_id=order,amount=amount,currency="INR",payment_status=status,refunded_amount=refunded,provider_reference=f"DEMO-{txid}"))
        db.commit()
        print("Seed complete. Development-only accounts:")
        print("Password:",settings.seed_password)
        for email,_,role in USERS: print(f"  {role:20} {email}")
        print("Synthetic customer transactions: TXN-1001, TXN-1002, TXN-1003, TXN-1004")
    finally: db.close()
if __name__=="__main__": main()
