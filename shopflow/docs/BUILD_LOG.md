# ShopFlow Build Log

## Phase 0: Scaffold
- **Built**: Next.js 14 App Router, TypeScript strict, Tailwind CSS, Prisma 5, Vitest, Playwright, Dockerfile & docker-compose.yml (PostgreSQL 16 + Next.js app), `.env.example`.
- **Checks Run**:
  - `docker compose up -d`
  - Health endpoint `GET /api/health` -> HTTP 200 `{ "ok": true, "database": "connected" }`.
- **Result**: PASS

## Phase 1: Schema and Seed
- **Built**: `prisma/schema.prisma` with 13 models, PostgreSQL sequence `refund_ticket_seq`, 15 catalog items, 15 refund policies, 10 customers + 2 staff accounts, 29 orders, 24 historical tickets (`RIT-2026-000090`..`000120`), audit events, decisions, and transactions.
- **Checks Run**:
  - `npm run db:seed`
  - Verification query: Next ticket sequence preview = `RIT-2026-000123`.
  - Product count = 15; Customers = 10; Staff = 2.
- **Result**: PASS

## Phase 2: Auth, Catalog, Cart, Checkout
- **Built**: Iron-session cookie auth + DB sessions, password hashing (`bcryptjs`), role guards, catalog list with search/filter/sort, product details with structured policy panel, shopping cart service, mock payment provider with `fail@mock` simulation, UPI/card checkout.
- **Checks Run**:
  - Vitest: `tests/unit/auth-payment.test.ts`, `tests/unit/phase2-acceptance.test.ts`.
  - Aarav UPI checkout for PROD-001 persisted in PostgreSQL; `fail@mock` declined without confirmed order.
- **Result**: PASS (3/3 tests passed)

## Phase 3: Orders and Admin Controls
- **Built**: Customer `/orders` and `/orders/[id]`, admin `/admin/orders` management, `/api/admin/orders/[id]/status`, `/api/admin/orders/[id]/simulate-delivery`, refund button eligibility gate on delivered orders.
- **Checks Run**:
  - Vitest: `tests/unit/phase3-acceptance.test.ts`.
  - Admin simulated delivery 4 days ago -> customer view derived `is_eligible_for_refund: true` and rendered "Request Refund" action.
- **Result**: PASS (1/1 test passed)

## Phase 4: Refund Tickets and Evidence
- **Built**: Refund ticket submission API `POST /api/me/orders/[id]/refund-tickets`, evidence storage with MIME/size/SHA256 hash checks, state machine `assertValidTransition` and `transitionTicket`, audit events trail, outbox dispatcher `refund.ticket.created` event emission, sanitized customer timeline API.
- **Checks Run**:
  - Vitest: `tests/unit/phase4-acceptance.test.ts`.
  - Next ticket sequence preview verified as `RIT-2026-000123`.
  - State machine allows legal transitions and throws `IllegalTransitionError` for illegal jumps (e.g. `REFUNDED` -> `APPROVED`).
  - Evidence validator accepts valid images/PDFs and computes SHA-256; rejects disallowed types.
  - Integration event outbox row persisted with status `PENDING`.
- **Result**: PASS (3/3 tests passed)

## Phase 5: RITOS Read API and Contract
- **Built**: RITOS API-key authentication (`Authorization: Bearer <RITOS_API_KEY>`), full refund context builder per docs/02 §1 (`GET /api/ritos/refund-tickets/:ticketId/context` and alias `GET /api/refunds/:ticketId/context`), evidence download streaming (`GET /api/ritos/evidence/:evidenceId/download`), resource endpoints (`/api/orders/:id/details`, `/api/orders/:id/refund-eligibility`, `/api/customers/:id`, `/api/customers/:id/refund-history`, `/api/products/:id/refund-policy`, `/api/transactions/:transactionId`, `/api/refunds/:ticketId`, `/api/refunds`), and dev helper script `scripts/ritos-client.ts`.
- **Checks Run**:
  - Contract & Scenario Vitest: `tests/unit/phase5-acceptance.test.ts`.
  - Zod validation of Context against strict docs/02 §1 schema: PASS.
  - Scenario 4: `within_return_window = false`: PASS.
  - Scenario 7: `related_tickets` includes REFUNDED sibling `RIT-2026-000111` and `remaining_refundable_minor = 0`: PASS.
  - Scenario 8: `claim_data_conflicts` detects mismatch between `ORDER_NEVER_ARRIVED` and order `DELIVERED`: PASS.
  - `npx tsc --noEmit` and `npm run lint`: PASS.
- **Result**: PASS (4/4 tests passed)

## Phase 6: Decision Callback and Refund Execution
- **Built**: Decision callback `POST /api/ritos/refund-decision` with idempotency, ledger balance protection, and auto-execution trigger; refund execution service `POST /api/payments/refund` with PostgreSQL `FOR UPDATE` row lock, duplicate & over-refund protection, failure simulation flag, and DB settlement (`settle_at`); status poll `GET /api/payments/refund/:id` with lazy settlement; status reporter `POST /api/ritos/refund-tickets/:ticketId/status`; notifications endpoint `POST /api/ritos/notifications`.
- **Checks Run**:
  - Automated concurrency & state machine test: `tests/unit/phase6-acceptance.test.ts`.
  - Two parallel calls with same idempotency key create exactly 1 refund row: PASS.
  - Same ticket with different key while first is active returns 409 DUPLICATE_REFUND: PASS.
  - Two concurrent refunds exceeding total balance: exactly one succeeds, one rejected with 422 AMOUNT_EXCEEDS_REFUNDABLE: PASS.
  - Illegal status transitions (e.g. REFUNDED -> APPROVED) throw IllegalTransitionError / 409: PASS.
  - `npx tsc --noEmit` and `npm run lint`: PASS.
- **Result**: PASS (4/4 tests passed)

## Phase 7: Human Review and Mock RITOS
- **Built**: Support analyst review queue `/admin/review` and detail `/admin/review/[id]` with full claim dossier, conflict analysis, and Approve/Reject/Modify adjudication controls; `POST /api/admin/refunds/:ticketId/human-decision`; deterministic rules function `src/server/mock-ritos/mock-decide.ts` per docs/03 §4; outbox processor `src/server/outbox/processor.ts` and manual endpoint `POST /api/admin/outbox/process`; background poller registered in `src/instrumentation.ts`.
- **Checks Run**:
  - All 10 scenario outcomes verified: `tests/unit/phase7-acceptance.test.ts`.
  - Scenarios 1 & 10 reach `APPROVED` (100% confidence >= 0.95): PASS.
  - Scenario 2 reaches `PARTIALLY_APPROVED` (90%): PASS.
  - Scenarios 3, 4, 7 reach `REJECTED`: PASS.
  - Scenarios 5, 6, 8, 9 reach `HUMAN_REVIEW`: PASS.
  - `npx tsc --noEmit` and `npm run lint`: PASS.
- **Result**: PASS (1/1 test passed across all 10 scenarios)

## Phase 8: Admin and Demo Console
- **Built**: Updated console hub `/admin`, `/admin/refunds` roster with live failure simulation button, `/admin/ritos` integration console with outbox monitor & resend control, `/admin/data` with instant database wipe-and-reseed button, `/admin/api-docs` rendering docs/02 specification, endpoints `POST /api/admin/tickets/:id/simulate-refund-failure`, `POST /api/admin/refunds/:ticketId/resend-to-ritos`, `POST /api/admin/demo/reset-and-seed`, `GET /api/admin/ritos/exchanges`.
- **Checks Run**:
  - Vitest: `tests/unit/phase8-acceptance.test.ts`.
  - State mutation verification for failure simulation flag: PASS.
  - Outbox event queuing and persistence: PASS.
  - Full suite Vitest: 8/8 test files passed (21/21 tests passed).
  - `npx tsc --noEmit` and `npm run lint`: PASS.
- **Result**: PASS (2/2 tests passed)

## Phase 9: Hardening, E2E Tests, and Documentation
- **Built**:
  - Rate limiting middleware `src/middleware.ts` with IP sliding limiter.
  - Security headers configured in `next.config.js` (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS).
  - Explicit Zod whitelist output schema `src/server/schemas/customer.ts` for customer endpoints.
  - Customer UI pages: `/orders/[id]/refund` and `/refunds/[id]` with real-time timeline tracking.
  - Customer sanitization unit tests and AST/regex scanner `tests/unit/customer-sanitization.test.ts`.
  - Playwright End-to-End demo flows `tests/e2e/demo-flows.spec.ts` (Happy Path & Exception Path per docs/04 §6).
  - Copy-pasteable curl documentation `docs/SAMPLE_REQUESTS.md` for all RITOS endpoints in docs/02.
  - Comprehensive `README.md` detailing architecture, system boundaries, setup, environment variables, demo accounts, scenario matrix, and instructions for connecting real RITOS.
- **Checks Run**:
  - `npx tsc --noEmit`: PASS (0 errors)
  - `npm run lint`: PASS (0 errors)
  - `npm run test` (Vitest): PASS (9 files, 23 passed tests)
  - `npm run test:e2e` (Playwright): PASS (2 passed tests in 14.9s: Happy Path in 5.0s, Exception Path in 5.0s)
- **Result**: PASS

