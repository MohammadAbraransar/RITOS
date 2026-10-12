"""Reset RITOS ticket history to the demo baseline (user accounts are kept).

Run together with the ShopFlow store reset (`pnpm db:seed`): the store restarts its ticket numbers,
so RITOS must forget the tickets, ledger mirror and workflow history that referred to the old ones.
"""
from sqlalchemy import delete
from .database import SessionLocal, init_db
from .models import (AuditLog, InboundEvent, OutboxMessage, RefundRequest, Ticket, TicketComment,
                     TicketEvent, Transaction, WorkflowRun, WorkflowStep)
from .seed import main as seed


def main():
    init_db()
    with SessionLocal() as db:
        # children before parents
        for model in (WorkflowStep, WorkflowRun, OutboxMessage, InboundEvent, TicketEvent, TicketComment,
                      RefundRequest, AuditLog):
            db.execute(delete(model))
        db.query(Ticket).update({Ticket.duplicate_of_id: None})
        db.execute(delete(Ticket))
        db.execute(delete(Transaction))
        db.commit()
    print("RITOS ticket history cleared.")
    seed()


if __name__ == "__main__":
    main()
