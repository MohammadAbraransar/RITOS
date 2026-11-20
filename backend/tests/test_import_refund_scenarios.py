"""The refund test-data import: each scenario lands in its intended stage, and re-running it changes nothing."""
from sqlalchemy import func, select

from app.database import SessionLocal
from app.main import app  # noqa: F401  (startup seeds users and policies in development)
from app.models import RefundRequest, Ticket, Transaction
from app import import_refund_scenarios as importer


def _state(txid):
    with SessionLocal() as db:
        t = db.scalar(select(Ticket).where(Ticket.transaction_id == txid))
        r = db.scalar(select(RefundRequest).where(RefundRequest.transaction_id == txid).order_by(RefundRequest.created_at.desc()))
        tx = db.get(Transaction, txid)
        return t, r, tx


def test_import_creates_one_claim_per_refund_stage_and_is_idempotent():
    importer.main()
    expected = {  # txid: (desk, ticket status, ticket refund_status, refund record status)
        "TXN-RS-01": ("CS_1", None, None, None),
        "TXN-RS-03": ("CS_1", "IN_REVIEW", "PENDING_APPROVAL", "PENDING_APPROVAL"),
        "TXN-RS-04": ("CS_1", "IN_REVIEW", "APPROVED", "APPROVED"),
        "TXN-RS-05": ("CS_1", "RESOLVED", "REFUNDED", "REFUNDED"),
        "TXN-RS-06": ("CS_1", "IN_REVIEW", "FAILED", "FAILED"),
        "TXN-RS-07": ("CS_1", "IN_REVIEW", "RECONCILIATION_REQUIRED", "RECONCILIATION_REQUIRED"),
        "TXN-RS-08": ("CS_1", "REJECTED", "REJECTED", "REJECTED"),
        "TXN-RS-09": ("CS_1", "REJECTED", "CANCELLED", None),
        "TXN-RS-10": ("CS_2", None, None, None),
    }
    for txid, (desk, status, refund_status, refund) in expected.items():
        t, r, _ = _state(txid)
        assert t is not None, txid
        assert t.assigned_desk == desk, (txid, t.assigned_desk, t.policy_evaluation_reason)
        if status:
            assert (t.status, t.refund_status) == (status, refund_status), txid
        assert (r.status if r else None) == refund, txid

    # the >5,000 claim needs a supervisory approver, so the Approval Desk agent cannot approve it alone
    t, _, _ = _state("TXN-RS-02")
    assert t.decision_bucket == "GENUINE_REFUNDABLE" and t.classification_evidence["workflow"]["next_action"] == "AWAIT_APPROVAL"

    # money only moved for the paid scenario, through the sandbox
    for txid in expected:
        _, r, tx = _state(txid)
        assert float(tx.refunded_amount) == (1299.0 if txid == "TXN-RS-05" else 0.0), txid
    assert _state("TXN-RS-05")[1].provider_reference.startswith("SANDBOX-")

    # orders left for the customer to claim
    for txid in ("TXN-RS-11", "TXN-RS-12"):
        t, _, tx = _state(txid)
        assert tx is not None and t is None

    with SessionLocal() as db:
        counts = (db.scalar(select(func.count(Ticket.id))), db.scalar(select(func.count(RefundRequest.id))),
                  db.scalar(select(func.count(Transaction.id))))
    importer.main()
    with SessionLocal() as db:
        assert counts == (db.scalar(select(func.count(Ticket.id))), db.scalar(select(func.count(RefundRequest.id))),
                          db.scalar(select(func.count(Transaction.id))))
