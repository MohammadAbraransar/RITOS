"""Financial Settlement Engine and Double-Entry Accounting Journal for RITOS.

Enforces:
- Strict segregation of duties (proposer != approver != executor)
- Concurrency-safe balance reservation with row-level locks
- Balanced double-entry journal posting (Debits == Credits in minor integer units)
- Request-level idempotency with payload fingerprint verification
- Provider adapters: SANDBOX implemented; real providers report NOT_CONFIGURED / NOT_IMPLEMENTED
- Automated settlement reconciliation and compensating reversal entries
"""
from __future__ import annotations
import hashlib
import hmac
import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import (
    RefundRequest, RefundStatus, Transaction, Ticket, User, Role,
    LedgerAccount, LedgerJournal, LedgerEntry, GatewaySettlementAttempt,
    IdempotencyRecord, AccountType, EntryType, JournalStatus, AuditLog, TicketEvent
)
from .config import settings
from .permissions import PAYOUT_ROLES, EXECUTE, RECONCILE

# Standard Chart of Accounts
DEFAULT_ACCOUNTS = [
    {"id": "REFUND_LIABILITY", "name": "Refund Liability / Contra-Revenue", "account_type": AccountType.LIABILITY.value, "currency": "INR"},
    {"id": "PROCESSOR_CLEARING", "name": "Payment Gateway Clearing Account", "account_type": AccountType.ASSET.value, "currency": "INR"},
    {"id": "CASH_MAIN", "name": "Operating Cash Account", "account_type": AccountType.ASSET.value, "currency": "INR"},
    {"id": "CUSTOMER_RECEIVABLE", "name": "Customer Accounts Receivable", "account_type": AccountType.ASSET.value, "currency": "INR"},
    {"id": "REFUND_FEES_EXPENSE", "name": "Gateway Refund Processing Fees", "account_type": AccountType.EXPENSE.value, "currency": "INR"},
]


def ensure_default_accounts(db: Session, currency: str = "INR") -> None:
    """Idempotently seed standard chart of accounts."""
    for acc in DEFAULT_ACCOUNTS:
        existing = db.get(LedgerAccount, acc["id"])
        if not existing:
            new_acc = LedgerAccount(
                id=acc["id"],
                name=acc["name"],
                account_type=acc["account_type"],
                currency=currency,
                active=True,
            )
            db.add(new_acc)
    db.flush()


def compute_payload_fingerprint(payload: Any) -> str:
    """Deterministic canonical sha256 hash of a payload dictionary or string."""
    if isinstance(payload, dict):
        canonical_str = json.dumps(payload, sort_keys=True, default=str)
    else:
        canonical_str = str(payload)
    return hashlib.sha256(canonical_str.encode("utf-8")).hexdigest()


class GatewayAdapter:
    """Provider adapter contract. `status` values: SETTLED, ACCEPTED, FAILED, UNKNOWN, NOT_CONFIGURED, NOT_IMPLEMENTED."""
    provider_name = "BASE"
    live = False

    def execute_refund(self, transaction_id: str, amount_minor: int, currency: str, idempotency_key: str, reason: str) -> Dict[str, Any]:
        raise NotImplementedError

    def reconcile_refund(self, db: Session, provider_reference: str) -> Dict[str, Any]:
        raise NotImplementedError

    def verify_webhook_signature(self, raw_body: bytes, signature_header: str) -> bool:
        """HMAC-SHA256 over the raw body with GATEWAY_WEBHOOK_SECRET. No secret configured => reject everything."""
        secret = settings.gateway_webhook_secret
        if not secret or not signature_header:
            return False
        expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
        received = signature_header.split("=", 1)[1] if signature_header.startswith("sha256=") else signature_header
        return hmac.compare_digest(expected, received.strip())


class SandboxGatewayAdapter(GatewayAdapter):
    """Local SANDBOX gateway: no money moves and every result is labelled SANDBOX.

    Scenario keys (tests and demos): an idempotency key containing "sandbox_fail" is declined, one containing
    "sandbox_timeout" times out after the provider may already have acted. The sandbox's own provider-side
    record is kept on the settlement attempt so reconciliation reports what the "provider" actually did.
    """
    provider_name = "SANDBOX"

    def execute_refund(self, transaction_id, amount_minor, currency, idempotency_key, reason):
        key = idempotency_key.lower()
        ref = f"SANDBOX-{hashlib.sha256(idempotency_key.encode()).hexdigest()[:16].upper()}"  # provider idempotency
        if "sandbox_fail" in key:
            return {"status": "FAILED", "provider_reference": None, "error": "Sandbox decline (scenario key)",
                    "raw": {"mode": "SANDBOX", "code": "SANDBOX_DECLINED", "provider_side_status": "FAILED"}}
        if "sandbox_timeout" in key:
            # The request reached the sandbox and was processed, but the response never arrived.
            return {"status": "UNKNOWN", "provider_reference": ref, "error": "Sandbox timeout before acknowledgement",
                    "raw": {"mode": "SANDBOX", "code": "TIMEOUT", "provider_side_status": "SETTLED"}}
        return {"status": "ACCEPTED", "provider_reference": ref,
                "raw": {"mode": "SANDBOX", "provider_side_status": "SETTLED", "amount_minor": amount_minor, "currency": currency,
                        "confirmation_level": "SANDBOX_ACCEPTED (no real bank transfer)"}}

    def reconcile_refund(self, db, provider_reference):
        attempt = db.scalar(select(GatewaySettlementAttempt).where(
            GatewaySettlementAttempt.provider_reference == provider_reference,
            GatewaySettlementAttempt.provider == self.provider_name))
        if not attempt:
            return {"provider_reference": provider_reference, "status": "UNKNOWN", "detail": "No sandbox record for this reference"}
        side = (attempt.raw_response or {}).get("provider_side_status", "UNKNOWN")
        return {"provider_reference": provider_reference, "status": side, "mode": "SANDBOX"}


class UnconfiguredGatewayAdapter(GatewayAdapter):
    """Real providers (Stripe, Razorpay) are not implemented in this build. They never report success."""

    def __init__(self, name: str, configured: bool):
        self.provider_name = name
        self.configured = configured

    def _status(self):
        return "NOT_IMPLEMENTED" if self.configured else "NOT_CONFIGURED"

    def execute_refund(self, transaction_id, amount_minor, currency, idempotency_key, reason):
        return {"status": self._status(), "provider_reference": None,
                "error": f"{self.provider_name} refunds are {self._status().replace('_', ' ').lower()} in this build; use SANDBOX.",
                "raw": {"code": self._status()}}

    def reconcile_refund(self, db, provider_reference):
        return {"provider_reference": provider_reference, "status": self._status()}

    def verify_webhook_signature(self, raw_body, signature_header):
        return False


def get_gateway_adapter(provider: str = "SANDBOX") -> GatewayAdapter:
    p = (provider or "SANDBOX").upper()
    if p == "SANDBOX":
        return SandboxGatewayAdapter()
    if p == "STRIPE":
        return UnconfiguredGatewayAdapter("STRIPE", bool(settings.stripe_api_key))
    return UnconfiguredGatewayAdapter(p, False)


def gateway_status() -> Dict[str, Any]:
    """For readiness/integration health: what is implemented, configured, or unavailable."""
    return {
        "active_provider": "SANDBOX",
        "live_payments_enabled": False,
        "providers": {
            "SANDBOX": "IMPLEMENTED (no money moves)",
            "STRIPE": "NOT_IMPLEMENTED" if settings.stripe_api_key else "NOT_CONFIGURED",
            "RAZORPAY": "NOT_CONFIGURED",
        },
        "webhook_verification": "HMAC_SHA256" if settings.gateway_webhook_secret else "DISABLED (no GATEWAY_WEBHOOK_SECRET; webhooks rejected)",
    }


class FinancialSettlementService:
    """Central service managing the financial settlement lifecycle and double-entry ledger."""

    @staticmethod
    def check_idempotency(
        db: Session,
        idempotency_key: str,
        route: str,
        payload: Any
    ) -> Optional[Dict[str, Any]]:
        """Check for replay of an existing idempotency key.
        
        If identical key with identical payload: return cached response.
        If identical key with differing payload: raise 409 Conflict.
        If new key: return None.
        """
        if not idempotency_key:
            return None

        record = db.get(IdempotencyRecord, idempotency_key)
        if not record:
            return None

        incoming_fingerprint = compute_payload_fingerprint(payload)
        if record.fingerprint_hash != incoming_fingerprint:
            raise HTTPException(
                status_code=409,
                detail=f"Idempotency conflict: key '{idempotency_key}' was previously used with a different request payload."
            )

        return {
            "cached": True,
            "status_code": record.status_code,
            "response": record.response_payload
        }

    @staticmethod
    def save_idempotency(
        db: Session,
        idempotency_key: str,
        route: str,
        payload: Any,
        status_code: int,
        response_payload: Dict[str, Any]
    ) -> None:
        """Store request result for deterministic replay."""
        if not idempotency_key:
            return

        fingerprint = compute_payload_fingerprint(payload)
        record = db.get(IdempotencyRecord, idempotency_key)
        if not record:
            record = IdempotencyRecord(
                id=idempotency_key,
                fingerprint_hash=fingerprint,
                route=route,
                status_code=status_code,
                response_payload=response_payload,
            )
            db.add(record)
            db.flush()

    @staticmethod
    def post_double_entry_journal(
        db: Session,
        refund_id: str,
        ticket_id: str | None,
        transaction_id: str,
        amount_minor: int,
        currency: str,
        actor_id: str,
        idempotency_key: str,
        description: str,
        debit_account_id: str = "REFUND_LIABILITY",
        credit_account_id: str = "PROCESSOR_CLEARING"
    ) -> LedgerJournal:
        """Create an append-only, perfectly balanced double-entry journal entry.
        
        Total Debits MUST equal Total Credits.
        """
        ensure_default_accounts(db, currency)

        if amount_minor <= 0:
            raise ValueError(f"Journal amount must be positive, got {amount_minor}")

        journal = LedgerJournal(
            id=str(uuid.uuid4()),
            refund_id=refund_id,
            ticket_id=ticket_id,
            transaction_id=transaction_id,
            currency=currency,
            idempotency_key=f"JRNL-{idempotency_key}",
            posted_by_id=actor_id,
            status=JournalStatus.POSTED.value,
            description=description,
        )
        db.add(journal)
        db.flush()

        debit_entry = LedgerEntry(
            id=str(uuid.uuid4()),
            journal_id=journal.id,
            account_id=debit_account_id,
            entry_type=EntryType.DEBIT.value,
            amount_minor=amount_minor,
        )
        credit_entry = LedgerEntry(
            id=str(uuid.uuid4()),
            journal_id=journal.id,
            account_id=credit_account_id,
            entry_type=EntryType.CREDIT.value,
            amount_minor=amount_minor,
        )
        db.add(debit_entry)
        db.add(credit_entry)
        db.flush()

        # Invariant check against what was actually persisted for this journal
        from sqlalchemy import func as _f
        totals = dict(db.execute(select(LedgerEntry.entry_type, _f.sum(LedgerEntry.amount_minor))
                                 .where(LedgerEntry.journal_id == journal.id).group_by(LedgerEntry.entry_type)).all())
        total_debit, total_credit = totals.get(EntryType.DEBIT.value, 0), totals.get(EntryType.CREDIT.value, 0)
        if total_debit != total_credit or total_debit != amount_minor:
            raise RuntimeError(f"Unbalanced double-entry journal: Debits {total_debit} != Credits {total_credit}")

        return journal

    @staticmethod
    def post_reversal_journal(
        db: Session,
        original_journal_id: str,
        actor_id: str,
        reason: str
    ) -> LedgerJournal:
        """Create compensating reversal entries for an existing journal without mutating history."""
        orig_journal = db.get(LedgerJournal, original_journal_id)
        if not orig_journal:
            raise HTTPException(404, "Original journal not found for reversal")

        if orig_journal.status == JournalStatus.REVERSED.value:
            raise HTTPException(409, "Journal has already been reversed")

        reversal_id = str(uuid.uuid4())
        rev_journal = LedgerJournal(
            id=reversal_id,
            refund_id=orig_journal.refund_id,
            ticket_id=orig_journal.ticket_id,
            transaction_id=orig_journal.transaction_id,
            currency=orig_journal.currency,
            idempotency_key=f"REV-{orig_journal.idempotency_key}",
            posted_by_id=actor_id,
            status=JournalStatus.POSTED.value,
            description=f"Compensating reversal of {orig_journal.id}: {reason}",
        )
        db.add(rev_journal)
        db.flush()

        # Invert debits and credits
        for entry in orig_journal.entries:
            new_type = EntryType.CREDIT.value if entry.entry_type == EntryType.DEBIT.value else EntryType.DEBIT.value
            db.add(LedgerEntry(
                id=str(uuid.uuid4()),
                journal_id=rev_journal.id,
                account_id=entry.account_id,
                entry_type=new_type,
                amount_minor=entry.amount_minor,
            ))

        orig_journal.status = JournalStatus.REVERSED.value
        db.flush()
        return rev_journal


    @classmethod
    def execute_settlement(cls, db: Session, refund_id: str, executor: User, idempotency_key: str,
                           provider: str = "SANDBOX") -> Dict[str, Any]:
        """Execute an APPROVED refund in three phases so no row lock is held during the network call.

        1. Reserve: lock refund + transaction, check roles, four-eyes and balance, mark PROCESSING, record the
           attempt, commit. A concurrent second execution now sees PROCESSING and is refused.
        2. Call the gateway with no locks held.
        3. Record: lock again and apply the outcome. ACCEPTED/SETTLED -> balanced journal + REFUNDED.
           UNKNOWN (timeout) -> RECONCILIATION_REQUIRED; never retried blindly. FAILED -> FAILED, balance released.
        """
        if executor.role not in PAYOUT_ROLES[EXECUTE]:  # same policy as the endpoints and the desk (permissions.py)
            raise HTTPException(403, f"Role '{executor.role}' may not execute settlements.")
        route = f"/refunds/{refund_id}/execute"
        cached = cls.check_idempotency(db, idempotency_key, route, {"refund_id": refund_id, "provider": provider})
        if cached:
            return {**cached["response"], "idempotent_replay": True}

        # ---- Phase 1: reserve ----
        refund = db.scalar(select(RefundRequest).where(RefundRequest.id == refund_id).with_for_update())
        if not refund:
            raise HTTPException(404, "Refund request not found")
        if refund.status == RefundStatus.REFUNDED.value:
            return {"id": refund.id, "status": refund.status, "provider_reference": refund.provider_reference,
                    "idempotent_replay": True}
        if refund.status != RefundStatus.APPROVED.value:
            raise HTTPException(409, f"Refund is '{refund.status}'; only APPROVED refunds can be executed.")
        # Four-eyes: proposer, approver and executor must be three different people (no role is exempt).
        if executor.id in (refund.requested_by_id, refund.approved_by_id):
            raise HTTPException(409, "Separation of duties: the proposer or approver of a refund cannot execute it.")
        if not refund.approved_by_id or refund.approved_by_id == refund.requested_by_id:
            raise HTTPException(409, "Separation of duties: refund lacks an independent approval.")

        tx = db.scalar(select(Transaction).where(Transaction.id == refund.transaction_id).with_for_update())
        if not tx:
            raise HTTPException(409, "Source transaction not found in ledger")
        amount = Decimal(str(refund.amount)).quantize(Decimal("0.01"))
        amount_minor = int(amount * 100)
        available = (Decimal(str(tx.amount)) - Decimal(str(tx.refunded_amount))).quantize(Decimal("0.01"))
        if amount <= 0 or amount > available:
            raise HTTPException(409, f"Refund {refund.currency} {amount:.2f} exceeds the remaining {tx.currency} {available:.2f}.")

        adapter = get_gateway_adapter(provider)
        attempt = GatewaySettlementAttempt(id=str(uuid.uuid4()), refund_id=refund.id, provider=adapter.provider_name,
                                           amount_minor=amount_minor, currency=refund.currency,
                                           idempotency_key=idempotency_key, status="INITIATED")
        db.add(attempt)
        refund.status = RefundStatus.PROCESSING.value
        db.commit()  # releases the row locks before the network call

        # ---- Phase 2: gateway call (no locks held) ----
        try:
            result = adapter.execute_refund(tx.id, amount_minor, refund.currency, idempotency_key, refund.reason or "Customer refund")
        except Exception as exc:  # transport failure: the provider may or may not have acted
            result = {"status": "UNKNOWN", "provider_reference": None, "error": f"{type(exc).__name__}: {exc}", "raw": {}}

        # ---- Phase 3: record ----
        refund = db.scalar(select(RefundRequest).where(RefundRequest.id == refund_id).with_for_update())
        attempt = db.get(GatewaySettlementAttempt, attempt.id)
        attempt.raw_response = result.get("raw", {})
        attempt.provider_reference = result.get("provider_reference")
        attempt.error_message = result.get("error")
        status = result["status"]
        if status in ("ACCEPTED", "SETTLED"):
            response = cls._post_settlement(db, refund, attempt, executor.id, idempotency_key, status)
            code = 200
        elif status == "UNKNOWN":
            refund.status = RefundStatus.RECONCILIATION_REQUIRED.value
            attempt.status = "RECONCILIATION_REQUIRED"
            response = {"id": refund.id, "status": refund.status, "provider": adapter.provider_name,
                        "provider_reference": attempt.provider_reference,
                        "warning": "Gateway outcome unknown; reconcile before any new attempt."}
            code = 202
        else:
            refund.status = RefundStatus.FAILED.value
            attempt.status = status
            db.add(AuditLog(actor_id=executor.id, action="FINANCIAL_SETTLEMENT_FAILED", entity_type="refund", entity_id=refund.id,
                            details={"provider": adapter.provider_name, "status": status, "error": result.get("error")}))
            db.commit()
            raise HTTPException(502, f"Gateway settlement {status}: {result.get('error')}")
        cls.save_idempotency(db, idempotency_key, route, {"refund_id": refund_id, "provider": provider}, code, response)
        db.commit()
        return response

    @classmethod
    def _post_settlement(cls, db: Session, refund: RefundRequest, attempt: GatewaySettlementAttempt, actor_id: str,
                         idempotency_key: str, provider_status: str) -> Dict[str, Any]:
        tx = db.scalar(select(Transaction).where(Transaction.id == refund.transaction_id).with_for_update())
        amount = Decimal(str(refund.amount)).quantize(Decimal("0.01"))
        journal = cls.post_double_entry_journal(
            db=db, refund_id=refund.id, ticket_id=refund.ticket_id, transaction_id=tx.id,
            amount_minor=attempt.amount_minor, currency=refund.currency, actor_id=actor_id,
            idempotency_key=idempotency_key,
            description=f"Refund {refund.id} via {attempt.provider} ({attempt.provider_reference})")
        tx.refunded_amount = (Decimal(str(tx.refunded_amount)) + amount).quantize(Decimal("0.01"))
        refund.status = RefundStatus.REFUNDED.value
        refund.provider_reference = attempt.provider_reference
        attempt.status = provider_status
        confirmation = (attempt.raw_response or {}).get("confirmation_level") or provider_status
        ticket = db.get(Ticket, refund.ticket_id)
        if ticket:
            ticket.refund_status = RefundStatus.REFUNDED.value
            ticket.status = "RESOLVED"
            db.add(TicketEvent(ticket_id=ticket.id, actor_id=actor_id, event_type="FINANCIAL_SETTLEMENT_POSTED",
                               details={"refund_id": refund.id, "amount_minor": attempt.amount_minor, "provider": attempt.provider,
                                        "provider_reference": attempt.provider_reference, "journal_id": journal.id,
                                        "confirmation_level": confirmation}))
        db.add(AuditLog(actor_id=actor_id, action="FINANCIAL_SETTLEMENT_POSTED", entity_type="refund", entity_id=refund.id,
                        details={"provider": attempt.provider, "provider_reference": attempt.provider_reference,
                                 "amount_minor": attempt.amount_minor, "journal_id": journal.id, "idempotency_key": idempotency_key,
                                 "confirmation_level": confirmation}))
        return {"id": refund.id, "status": refund.status, "provider": attempt.provider,
                "provider_reference": attempt.provider_reference, "confirmation_level": confirmation,
                "journal_id": journal.id, "amount_minor": attempt.amount_minor, "currency": refund.currency}

    @classmethod
    def reconcile_settlement(cls, db: Session, refund_id: str, actor: User) -> Dict[str, Any]:
        """Ask the provider what actually happened to an uncertain settlement, then apply it exactly once."""
        if actor.role not in PAYOUT_ROLES[RECONCILE]:
            raise HTTPException(403, f"Role '{actor.role}' may not reconcile settlements.")
        refund = db.scalar(select(RefundRequest).where(RefundRequest.id == refund_id).with_for_update())
        if not refund:
            raise HTTPException(404, "Refund request not found")
        if refund.status not in (RefundStatus.RECONCILIATION_REQUIRED.value, RefundStatus.PROCESSING.value):
            return {"id": refund.id, "status": refund.status, "reconciled": False, "detail": "Nothing to reconcile."}
        attempt = db.scalar(select(GatewaySettlementAttempt).where(GatewaySettlementAttempt.refund_id == refund.id)
                            .order_by(GatewaySettlementAttempt.created_at.desc()))
        if not attempt or not attempt.provider_reference:
            return {"id": refund.id, "status": refund.status, "reconciled": False,
                    "detail": "No provider reference recorded; check the provider dashboard manually."}
        provider_view = get_gateway_adapter(attempt.provider).reconcile_refund(db, attempt.provider_reference)
        outcome = provider_view["status"]
        if outcome in ("SETTLED", "ACCEPTED"):
            response = cls._post_settlement(db, refund, attempt, actor.id, attempt.idempotency_key or f"recon-{refund.id}", outcome)
        elif outcome == "FAILED":
            refund.status = RefundStatus.FAILED.value
            attempt.status = "FAILED"
            response = {"id": refund.id, "status": refund.status}
        else:
            response = {"id": refund.id, "status": refund.status, "detail": f"Provider still reports {outcome}."}
        db.add(AuditLog(actor_id=actor.id, action="SETTLEMENT_RECONCILED", entity_type="refund", entity_id=refund.id,
                        details={"provider_view": provider_view}))
        db.commit()
        return {**response, "reconciled": outcome in ("SETTLED", "ACCEPTED", "FAILED"), "provider_view": provider_view}

    @classmethod
    def handle_gateway_webhook(cls, db: Session, provider: str, raw_body: bytes, signature: str) -> Dict[str, Any]:
        """Verify, de-duplicate and apply a provider webhook. Only the provider's reported state is trusted."""
        from .models import InboundEvent
        adapter = get_gateway_adapter(provider)
        if not adapter.verify_webhook_signature(raw_body, signature or ""):
            raise HTTPException(401, "Invalid webhook signature")
        try:
            event = json.loads(raw_body)
            event_id, reference, outcome = event["id"], event["provider_reference"], event["status"]
        except (ValueError, KeyError) as exc:
            raise HTTPException(422, f"Malformed webhook: {exc}")
        replay_key = f"{adapter.provider_name}:{event_id}"
        if db.get(InboundEvent, replay_key):
            return {"status": "DUPLICATE_IGNORED", "event_id": event_id}
        db.add(InboundEvent(id=replay_key, source=adapter.provider_name, event_type=f"refund.{outcome.lower()}",
                            external_ticket_id=reference, result={"status": outcome}))
        attempt = db.scalar(select(GatewaySettlementAttempt).where(GatewaySettlementAttempt.provider_reference == reference))
        if not attempt:
            db.commit()
            return {"status": "UNKNOWN_REFERENCE", "event_id": event_id}
        attempt.raw_response = {**(attempt.raw_response or {}), "provider_side_status": outcome, "webhook_event_id": event_id}
        db.commit()
        refund = db.get(RefundRequest, attempt.refund_id)
        if refund and refund.status in (RefundStatus.RECONCILIATION_REQUIRED.value, RefundStatus.PROCESSING.value):
            system = User(id="gateway-webhook", role=Role.FINANCE.value, email="gateway@system", full_name="Gateway webhook")
            return {"status": "APPLIED", **cls.reconcile_settlement(db, refund.id, system)}
        return {"status": "RECORDED", "event_id": event_id}
