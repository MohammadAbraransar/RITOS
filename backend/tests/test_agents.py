from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.database import Base
from app.models import Ticket, Transaction
from app.agents import AGENTS, ORCHESTRATOR, run_ticket_pipeline


def db_session():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def test_pipeline_verifies_transaction_and_does_not_execute_refund():
    db = db_session()
    db.add(Transaction(id='TX-1', customer_id='cust-1', order_id='ORD-1', amount=100,
                       currency='INR', payment_status='SUCCESSFUL', refunded_amount=0))
    ticket = Ticket(ticket_number='RIT-TEST-1', customer_id='cust-1', transaction_id='TX-1',
                    order_id='ORD-1', claimed_amount=100, currency='INR',
                    description='My refund has not arrived', category='REFUND_NOT_RECEIVED',
                    confidence=.8, priority='P3', queue='Refund Operations', status='TRIAGED',
                    payment_verification='UNKNOWN', refund_status='UNKNOWN')
    db.add(ticket); db.commit(); db.refresh(ticket)
    result = run_ticket_pipeline(db, ticket)
    db.commit()
    assert result['transaction_verification'] == 'VERIFIED'
    assert result['executed_refund'] is False
    # a refund-not-received dispute is reconciled with the provider, never paid out a second time automatically
    assert result['decision'] == 'HUMAN_REVIEW_REQUIRED'
    assert 'PAYMENT_ISSUE_RECONCILIATION' in result['reason_codes']
    assert ticket.duplicate_of_id is None
    db.close()


def test_pipeline_flags_unauthorized_payment_for_human_review():
    db = db_session()
    db.add(Transaction(id='TX-2', customer_id='cust-2', order_id='ORD-2', amount=50,
                       currency='INR', payment_status='SUCCESSFUL', refunded_amount=0))
    ticket = Ticket(ticket_number='RIT-TEST-2', customer_id='cust-2', transaction_id='TX-2',
                    order_id='ORD-2', claimed_amount=50, currency='INR',
                    description='I did not make this payment', category='UNAUTHORIZED_PAYMENT',
                    confidence=.9, priority='P1', queue='Security and Fraud Review', status='TRIAGED',
                    payment_verification='UNKNOWN', refund_status='UNKNOWN')
    db.add(ticket); db.commit(); db.refresh(ticket)
    result = run_ticket_pipeline(db, ticket)
    assert result['risk_level'] == 'HIGH'
    assert result['decision'] == 'HUMAN_REVIEW_REQUIRED'
    assert result['executed_refund'] is False
    db.close()


def test_registry_has_nine_specialists_plus_orchestrator():
    assert len(AGENTS) == 9
    assert ORCHESTRATOR['id'] == 'central_orchestrator'


def test_same_transaction_id_links_ticket_even_when_category_differs():
    db = db_session()
    db.add(Transaction(id='TX-DUP', customer_id='cust-dup', order_id='ORD-DUP', amount=100,
                       currency='INR', payment_status='SUCCESSFUL', refunded_amount=0))
    first = Ticket(ticket_number='RIT-DUP-1', customer_id='cust-dup', transaction_id='TX-DUP',
                    order_id='ORD-DUP', claimed_amount=100, currency='INR',
                    description='Refund has not arrived', category='REFUND_NOT_RECEIVED',
                    confidence=.8, priority='P3', queue='Refund Operations', status='TRIAGED',
                    payment_verification='UNKNOWN', refund_status='UNKNOWN')
    db.add(first); db.commit(); db.refresh(first)
    second = Ticket(ticket_number='RIT-DUP-2', customer_id='cust-dup', transaction_id='TX-DUP',
                    order_id='ORD-DUP', claimed_amount=100, currency='INR',
                    description='Payment was deducted but order failed', category='PAYMENT_ORDER_FAILED',
                    confidence=.8, priority='P3', queue='Refund Operations', status='TRIAGED',
                    payment_verification='UNKNOWN', refund_status='UNKNOWN')
    db.add(second); db.commit(); db.refresh(second)
    result = run_ticket_pipeline(db, second)
    db.commit()
    assert result['duplicate_ticket_id'] == first.id
    assert result['executed_refund'] is False
    db.close()
