# RITOS Architecture Notes

## Request flow
1. Customer submits ticket through React.
2. FastAPI validates the schema and derives the customer ID from the access token.
3. Transaction adapter checks the synthetic transaction table; claims are not treated as trusted facts.
4. Rules classifier emits category, evidence terms, confidence and recommended next step.
5. Duplicate matcher searches active cases for the same customer, transaction and category. Related tickets are linked, not silently closed.
6. Priority and routing are persisted with ticket state and timeline events.
7. Authorized operations staff can request a refund only after transaction verification.
8. Finance approves/rejects independently. Approved requests can be executed only through the explicit mock adapter.
9. Audit events and case events are persisted for traceability.

## Service boundaries
- Identity: user lookup, password hashing, access tokens and role checks.
- Ticket service: customer ownership, ticket lifecycle, comments and assignment.
- Intelligence: rule-based category classification, conservative duplicate check, priority and route.
- Transaction adapter: synthetic local transaction data in this build.
- Refund service: approval, idempotency key and mock execution.
- Reporting: aggregate SQLAlchemy records.
- Frontend: API-driven role workspaces and case details.

## Production architecture target
React/Vite -> API gateway/WAF -> FastAPI service -> PostgreSQL.
Durable queue (Redis + Celery or equivalent) handles triage, SLA checks, notification delivery and reconciliation. Integration adapters connect to authorized transaction, payment, email, SMS, storage and LLM providers. Centralized logs/metrics/traces and alerting monitor service health.

## State machines
Ticket statuses: NEW -> TRIAGED -> IN_REVIEW / AWAITING_INFORMATION / ESCALATED -> RESOLVED / REJECTED; resolved cases can be explicitly reopened by a future endpoint. Transitions should be formalized and validated before production.
Refund statuses: PENDING_APPROVAL -> APPROVED -> PROCESSING -> REFUNDED; pending can transition to REJECTED. Uncertain real-provider outcomes should transition to RECONCILIATION_REQUIRED, not trigger a fresh payment request.

## Security model
Customer endpoints scope tickets to the authenticated customer. Staff capabilities are gated server-side by roles. Finance approval and refund execution are distinct roles/actions. Approval cannot be performed by the same user who requested the refund. Audit events record significant actions. This is a baseline, not a completed compliance assessment.
