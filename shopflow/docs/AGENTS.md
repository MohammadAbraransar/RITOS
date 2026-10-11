# AGENTS.md: ShopFlow rules

ShopFlow is the customer-facing system of record for RITOS. Follow these rules in every session.

## Boundaries
1. ShopFlow owns: customers, products, policies, orders, payments, transactions, tickets, evidence, refund execution records, notifications.
2. RITOS owns: understanding, verification, policy reasoning, risk, duplicate analysis, the decision, and orchestration.
3. ShopFlow must not decide refunds. The only decision code allowed lives in `src/server/mock-ritos/` and runs only when `MOCK_RITOS=true`. It must be removable without touching other modules.
4. ShopFlow may compute **facts** (days since delivery, within window, remaining refundable amount, evidence present). It must label them as facts, never as verdicts.
5. All RITOS-facing code goes through `src/server/integrations/ritos/` (`ritosService`). Business logic must not import RITOS HTTP code directly. The app must keep working if RITOS is down.

## Engineering
- TypeScript strict. Validate every request body and query with Zod. Return the standard error envelope from 02_API_CONTRACT.md.
- Money: integer paise (`*_minor`), currency `INR`. Never floats.
- Timestamps: UTC ISO-8601 in the API; store as `timestamptz`.
- Policies are structured rows, not prose. A ticket stores an immutable **policy snapshot** at creation time.
- Every state change on a ticket goes through one state-machine function that rejects illegal transitions and writes an `audit_events` row.
- Refund execution must be idempotent (Idempotency-Key + DB unique constraint) and guarded by a row lock so concurrent calls cannot over-refund.
- Secrets only via env vars. Never commit `.env`. Provide `.env.example`.
- Customer-facing APIs and UI must never return risk/fraud fields. RITOS endpoints return them only with a valid API key.
- File uploads: validate MIME and size server-side (images/PDF, max 5 MB, max 5 files per ticket), randomize stored filenames.

## Workflow
- Do not skip ahead of the phase order in docs/04. Verify each phase by running it.
- Prefer small, reviewable commits. Update docs/02 only if the contract changes, and call that out explicitly.
- When a requirement is ambiguous, ask instead of guessing.
- Never add fake or decorative UI controls.
