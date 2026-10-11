# RITOS Architecture

## Ticket flow

1. Customer authenticates and submits a ticket. The backend derives customer identity from the access token; user-supplied payment status and approval fields are not trusted.
2. Input is validated and the transaction is looked up in the configured internal/provider adapter.
3. The ticket is classified; confidence, matched evidence, priority and queue are persisted.
4. Duplicate-ticket candidates are linked conservatively. Duplicate payment is a separate transaction-level investigation; similar wording alone never closes a ticket.
5. Risk signals and an eligibility candidate are computed independently from classification.
6. The central orchestrator records the decision and evidence. Unknown/mismatched data and high-risk cases require review.
7. Refund creation/approval/execution are separate endpoints and role-gated. Execution is mock-only in this distribution and uses a stable idempotency key.
8. Provider outcome must be reconciled before a refund is represented as confirmed. Customer status should be based on persisted provider status.

## Agent boundaries

Eight specialist components: Transaction Data Fetcher; Duplicate Intelligence; Issue Classification; Risk & Fraud Signals; Refund Eligibility & Policy; Routing & SLA; Refund Execution; Reconciliation & Communication. A central orchestrator coordinates persisted workflow state. These are logical components, not necessarily eight separate LLMs. Deterministic validation and policy code remains authoritative for money movement.

## Human roles

Routine cases should not require a human when configured policy, trusted data and provider capabilities allow safe automation. Exception Review Specialist handles ambiguous/missing data; Risk & Compliance Specialist handles risk and policy exceptions; Finance Approver authorizes high-value or policy-required refunds. Customer is an external user role. Administrator and Auditor are platform-wide roles.

## State boundaries

- Ticket state describes the complaint workflow.
- Transaction verification describes source-of-truth lookup result.
- Risk describes review signals, not proof of fraud.
- Eligibility describes whether policy permits consideration.
- Approval describes a recorded human/authorized policy decision.
- Refund state describes provider operation state.

## Data and trust boundaries

Customer input is untrusted. Transaction facts come from a database/provider adapter; approval comes from authorized records; refund success comes only from a verified provider response. Provider timeouts are ambiguous and must be reconciled before retry. Provider credentials remain on the backend. Production deployments require signed webhook verification, secrets management, tenant isolation, backup/restore drills, and security review.
