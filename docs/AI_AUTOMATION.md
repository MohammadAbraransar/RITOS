# RITOS automation policy and workflow

## Workflow

1. **Intake** — accept customer-created tickets through the authenticated customer API or server-to-server ecommerce endpoint. Ecommerce must call RITOS from its backend; secrets must never be exposed in browser code.
2. **Trusted transaction lookup** — match transaction, customer ownership, amount and currency against RITOS' trusted transaction source. A customer-provided claim is not proof of payment.
3. **Classification** — assign a rules-based issue category, confidence and matched evidence. Confidence is a triage signal, not a financial authorization.
4. **Duplicate analysis** — link potential duplicate tickets using customer + transaction and other evidence. Separately inspect duplicate payment and prior refund history. A repeated transaction ID alone must not automatically reject or close a case.
5. **Risk and policy checks** — calculate conservative risk indicators and eligibility candidates. Unknown source data, unauthorized-payment allegations, conflicting amounts, suspicious history, and policy exceptions route to review. Risk flags are not proof of fraud.
6. **Routing** — assign queue and priority based on category and urgency; preserve security-sensitive priorities.
7. **Human exception review** — the reviewer checks evidence, requests additional information when needed, and records a reasoned decision. The reviewer does not bypass payment verification.
8. **Separate approval and execution** — refund operations requests/execut es only after approval; finance approval must be a different user from the requester, and the executor must be different from the approver. Execution rechecks the remaining refundable balance and serializes relevant database rows on PostgreSQL.
9. **Reconciliation and audit** — persist events and audit details. The current provider adapter is MOCK only; no real payment provider is called.

## Eight specialist components + central orchestrator

The registry represents: transaction verification, classification, duplicate analysis, risk signals, policy/eligibility, queue/SLA routing, refund-operation controls, and customer/audit communication. A central orchestrator coordinates these components. This is a component architecture, not a claim that nine independent LLMs are running.

## Automation boundaries

- Deterministic financial controls override generated text or model recommendations.
- No AI/classifier output may independently approve or execute a refund.
- Missing or conflicting data means review, not optimistic eligibility.
- A provider timeout must be reconciled with the provider using the original idempotency key before any retry; the current mock adapter does not implement a real provider timeout lifecycle.
- The app's current classifier is rules-based. An LLM adapter, production notification delivery, durable retry/dead-letter queues and SLA scheduler are not claimed as fully implemented.

## Current limitations

The ecommerce webhook does not yet persist provider event IDs for durable replay deduplication. Database schema creation at startup must be replaced with reviewed migrations before production data. Celery is scaffolded but durable orchestration and recovery need end-to-end verification. These are production blockers, not hidden capabilities.
