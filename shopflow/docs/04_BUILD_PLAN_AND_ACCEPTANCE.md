# 04: Build Plan, Tests and Acceptance

Build in this order. Do not start a phase until the previous one's checks pass.

## Phase 0: Scaffold
Next.js + TS strict + Tailwind, Prisma, Zod, Vitest, Playwright, ESLint. `docker-compose.yml` (postgres + app), `.env.example`, `README.md` skeleton, folder layout from 01.
**Check:** `docker compose up` serves a health page and `/api/health` returns `{ok:true}` with DB connectivity.

## Phase 1: Schema and seed
Prisma schema per 01 §6 with all constraints (unique keys, ledger guard, ticket-number sequence). `prisma/seed.ts` per 03 (relative dates, scenario tickets, history, evidence placeholders). `npm run db:seed` is re-runnable (truncate and reseed).
**Check:** after seeding, counts match: 15 products with 15 active policies, 10 customers + 2 staff, 25+ orders, tickets 000090-000120 as listed, next ticket id preview = `RIT-2026-000123`.

## Phase 2: Auth, catalog, cart, checkout
Register/login/logout, role guards, product list (category filter, search, sort), product page with structured refund-policy panel, cart, checkout with mock payment (success and failure paths), order confirmation.
**Check:** log in as aarav, buy PROD-001 by UPI, order and payment (`TXN-...`) are persisted; paying with `fail@mock` yields a FAILED payment and no confirmed order.

## Phase 3: Orders and admin controls
My Orders, order detail with status tracking, admin orders page: change status, simulate delivery (choose "delivered N days ago"), view transactions.
**Check:** admin sets the new order to DELIVERED 4 days ago; customer sees "Request refund" appear.

## Phase 4: Refund tickets and evidence
Ticket form (reason, request type, description, upload), server validation per 02 §7, evidence storage with MIME/size/hash checks, policy snapshot, state machine function with audit events, customer ticket page with timeline and notifications. Emit `refund.ticket.created` into the outbox.
**Check:** ticket created with id `RIT-2026-000123`, status `PENDING_RITOS`, evidence stored, audit row exists, outbox row exists. Uploading a `.exe` or a 10 MB file is rejected.

## Phase 5: RITOS read API
API-key middleware, context endpoint exactly per 02 §1, resource endpoints (02 §6), derived facts and conflict detection, refund ledger, related tickets, evidence download. Add the Postman/curl collection and `scripts/ritos-client.ts`.
**Check:** a contract test validates the context JSON against a Zod schema generated from 02. All 10 scenario tickets return correct `derived_facts` (e.g. scenario 4 `within_return_window=false`; scenario 7 `related_tickets` has the REFUNDED sibling and `remaining_refundable_minor=0`; scenario 8 has a conflict string).

## Phase 6: Decision callback and refund execution
`POST /api/ritos/refund-decision` (idempotent, guardrails), `POST /api/payments/refund` (row lock, idempotent, over-refund and duplicate protection, failure simulation, async completion job), status endpoints, notifications.
**Checks (automated):**
- Two parallel calls to `/api/payments/refund` with the same key create exactly one `refund_transactions` row.
- Same ticket, different key, while the first is SUCCESS -> 409 `DUPLICATE_REFUND`.
- Two concurrent refunds that together exceed the payment amount -> one succeeds, one 422.
- Illegal transition (e.g. REFUNDED -> APPROVED) -> 409.
- Replaying the decision with the same key returns the stored response with `Idempotent-Replayed: true`.

## Phase 7: Human review and mock RITOS
`/admin/review` queue + detail (ticket, customer, order, product, reason, evidence viewer, policy, requested amount, RITOS decision, confidence, explanation, recommended action) with Approve / Reject / Modify amount / Note. `MOCK_RITOS` per 03 §4, triggered by the outbox dispatcher.
**Check:** with `MOCK_RITOS=true`, all 10 scenarios reach the expected outcomes in 03 §3 (approval scenarios end `REFUNDED`; scenarios 5, 6, 8, 9 end `HUMAN_REVIEW`; 3, 4, 7 end `REJECTED`).

## Phase 8: Admin and demo console
`/admin` overview, `/admin/refunds`, `/admin/ritos` integration console (ticket id, request sent, timestamp, RITOS response, decision, confidence, refund amount, human-review flag, latency, retry state, resend button), `/admin/data` (customers, products, transactions), simulate refund failure, `/admin/api-docs` rendering docs/02, reset-and-seed button.
**Check:** every admin control changes persisted state; the RITOS console shows the exchange for a ticket just created.

## Phase 9: Hardening and docs
Rate limiting, security headers, input validation sweep, customer-response sanitization test (grep that customer endpoints never return `risk_metadata`, `confidence_score`, `agent_trace`), README (setup, env, seed, accounts, scenarios, how to point real RITOS at it), OpenAPI file generated from the Zod schemas if feasible, `docs/SAMPLE_REQUESTS.md` with curl examples for every RITOS endpoint.

## 5. Test suite requirements
- **Unit:** state machine, policy fact derivation (window math, remaining refundable, conflict detection), money helpers, mock decision rules.
- **Integration (against a real Postgres):** all Phase 6 checks, auth/authorization (customer cannot read another customer's ticket; RITOS endpoints reject missing/invalid key).
- **Contract:** context response schema; decision request schema.
- **E2E (Playwright):** the two flows in section 6.

## 6. End-to-end demo (must pass as `npm run test:e2e`)
**Happy path**
1. Log in as `aarav@example.com`, buy Nimbus Wireless Headphones (UPI).
2. Admin simulates delivery 4 days ago.
3. Customer opens My Orders, clicks Request Refund, picks "Product damaged", uploads an image, submits.
4. Ticket `RIT-2026-000123` is created as `PENDING_RITOS`; the outbox event is dispatched.
5. RITOS (mock) fetches the context, the context contains customer, order, product, transaction, policy, evidence, refund history.
6. Decision posted: `APPROVED`, confidence 0.96, ₹2,999.
7. Refund executes; ticket reaches `REFUNDED`.
8. Customer page shows "Refund approved", "₹2,999 refund initiated", "Expected credit: 2-5 business days", and the timeline is complete. No confidence/risk shown.

**Exception path**
1. Seeded scenario 6 (or create a new damaged-phone ticket without evidence).
2. Mock RITOS returns `HUMAN_REVIEW`.
3. Support analyst opens the queue, sees RITOS decision, confidence and explanation, then approves a modified amount.
4. Refund executes; ticket `REFUNDED`; notification delivered; audit trail shows both the RITOS and human decisions.

## 7. Definition of done
- `docker compose up` + `npm run db:seed` gives a working app from a clean machine.
- All phase checks and `npm run test` + `npm run test:e2e` pass.
- No dead buttons; all state persisted.
- The context endpoint matches docs/02 exactly; the contract test enforces it.
- No duplicate or over-refund is possible, including under concurrency.
- Customers cannot see risk/fraud/RITOS internals.
- README lets a new developer run the demo and connect a real RITOS using `RITOS_BASE_URL`, `RITOS_API_KEY`, and `MOCK_RITOS=false`.

## 8. Open decisions for the human (ask before assuming)
1. Auth library preference (NextAuth vs custom sessions).
2. Who executes refunds in your final demo (`EXECUTION_OWNER=ritos` is the faithful architecture; `shopflow` is simpler).
3. Whether RITOS will receive webhooks or poll `GET /api/refunds?status=PENDING_RITOS`. Both are built; pick one for the demo.
