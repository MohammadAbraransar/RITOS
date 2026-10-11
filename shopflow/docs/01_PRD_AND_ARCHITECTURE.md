# 01: PRD and Architecture

## 1. Purpose
ShopFlow is a realistic e-commerce platform used as the **source system** for RITOS. A customer buys a product, raises a refund ticket, and RITOS (external AI orchestrator) pulls structured context over REST, returns a decision, and executes or routes to a human. ShopFlow records everything and shows the customer the outcome.

```
Customer -> ShopFlow UI -> Order -> Refund Ticket (PENDING_RITOS)
   -> event refund.ticket.created -> RITOS
   -> RITOS GET /api/ritos/refund-tickets/:id/context
   -> RITOS agents (intake, verification+policy, risk+duplicate, decision)
   -> RITOS POST /api/ritos/refund-decision
        APPROVED / PARTIALLY_APPROVED / REJECTED -> execution
        HUMAN_REVIEW -> ShopFlow support queue -> human decision
   -> POST /api/payments/refund (mock provider, idempotent)
   -> POST /api/ritos/notifications (optional, RITOS Notification Agent)
   -> ticket REFUNDED, customer sees status
```

## 2. Scope
**In:** catalog, auth, cart, checkout with mock payment, orders and delivery simulation, refund tickets with evidence, RITOS integration API, mock payment/refund provider, human review queue, admin/demo panel, outbox events, seed scenarios, API docs, tests.
**Out:** RITOS agents/LLMs, real payment gateway, computer-vision on evidence, real email/SMS (notifications are stored in DB and shown in UI).

## 3. Roles
| Role | Can do |
|---|---|
| CUSTOMER | browse, buy, view own orders, raise/view own tickets, upload evidence, see notifications |
| SUPPORT_ANALYST | see HUMAN_REVIEW queue, approve/reject/modify amount, add notes |
| ADMIN | everything above plus demo controls (change order status, simulate delivery, simulate refund failure, view payloads) |
| RITOS (service) | API-key authenticated; read context, post decisions, execute refunds, post notifications and agent traces |

## 4. Stack (decided; do not substitute)
- Next.js 14+ (App Router) + TypeScript strict + Tailwind. API as Route Handlers under `src/app/api`.
- PostgreSQL 16 + Prisma. Docker Compose for Postgres and the app.
- Zod for validation. NextAuth (credentials) or lucia-style session cookies for customer/admin auth. Passwords hashed with argon2/bcrypt.
- Vitest for unit/integration, Playwright for e2e.
- Layout:
```
src/app/(shop)/...            customer pages
src/app/admin/...             admin pages
src/app/api/...               route handlers (thin)
src/server/services/          orders, tickets, refunds, policies, notifications
src/server/integrations/ritos ritosService (client), event outbox dispatcher
src/server/mock-ritos/        deterministic stand-in, only when MOCK_RITOS=true
src/server/mock-pay/          mock payment provider
prisma/schema.prisma, prisma/seed.ts
docs/, scripts/
```

## 5. Environment variables
```
DATABASE_URL=
SESSION_SECRET=
RITOS_BASE_URL=http://localhost:8000
RITOS_API_KEY=                 # RITOS calls ShopFlow with this (inbound)
SHOPFLOW_OUTBOUND_KEY=         # ShopFlow calls RITOS with this (outbound)
MOCK_RITOS=true
EXECUTION_OWNER=shopflow       # shopflow | ritos  (who calls the refund API after approval)
HIGH_VALUE_THRESHOLD_MINOR=5000000   # INR 50,000
UPLOAD_DIR=./uploads
```
`EXECUTION_OWNER=ritos` is the real-architecture setting (RITOS Refund Execution Agent calls `/api/payments/refund`). `shopflow` makes the demo self-contained with `MOCK_RITOS=true`.

## 6. Data model (relational, with FKs)
All ids are text with prefixes. Money in `*_minor` (paise).

- **users**: id `CUS-10001`, role, name, email (unique), phone, password_hash, created_at, `risk_metadata` jsonb (internal only: flags such as `manual_watchlist`, never shown to customers)
- **products**: id `PROD-001`, sku, name, category, brand, description, specs jsonb, price_minor, stock, image_url, rating, is_digital, is_personalized, is_clearance
- **refund_policies**: id, product_id FK (one active per product), version, policy_type enum, refund_percentage, return_window_days, opened_allowed, requires_unused, defective_only, exchange_only, replacement_allowed, return_required, evidence_required_reasons text[], human_approval_threshold_minor nullable, exceptions jsonb (e.g. `{"manufacturing_defect": true, "duplicate_billing": true, "defective_on_arrival": true}`), return_shipping (`FREE|CUSTOMER|NA`), verification_required (`NONE|IMEI|SERIAL`), notes
- **orders**: id `ORD-10291`, customer_id FK, status enum (PENDING, CONFIRMED, PROCESSING, SHIPPED, OUT_FOR_DELIVERY, DELIVERED, CANCELLED), total_minor, currency, shipping_address jsonb, ordered_at, delivered_at nullable, delivery_status
- **order_items**: id, order_id FK, product_id FK, quantity, unit_price_minor, unit_serial text nullable (for laptop/phone verification)
- **payments**: id `PAY-...`, order_id FK, **transaction_id** `TXN-...` unique, method (UPI, CARD, NETBANKING, COD), status (PAID, FAILED, REFUNDED, PARTIALLY_REFUNDED), amount_minor, paid_at
- **refund_tickets**: id `RIT-2026-000123` (from a Postgres sequence, zero-padded), customer_id, order_id, order_item_id, product_id, transaction_id, reason enum, description, requested_action enum, requested_amount_minor, status enum, approval_source (`AUTO|HUMAN|null`), policy_snapshot jsonb (immutable), created_at, updated_at
- **refund_evidence**: id `EVD-...`, ticket_id FK, type (IMAGE, DOCUMENT, SCREENSHOT), filename, stored_path, mime, size_bytes, sha256, uploaded_at
- **refund_decisions**: id `DEC-...`, ticket_id FK, decision, refund_percentage, refund_amount_minor, reason, confidence_score numeric(4,3), processed_by (`RITOS|HUMAN:<userId>|MOCK_RITOS`), requires_human_review bool, agent_trace jsonb, human_note, created_at. Append-only: a human override is a new row.
- **refund_transactions**: id `REF-...`, ticket_id FK, transaction_id FK, amount_minor, status (PENDING, PROCESSING, SUCCESS, FAILED), idempotency_key, failure_reason, created_at. **Unique (transaction_id, idempotency_key)**.
- **notifications**: id, user_id FK, ticket_id nullable, channel (IN_APP, EMAIL_MOCK), title, body, created_at, read_at
- **audit_events**: id, entity_type, entity_id, event, actor, payload jsonb, created_at (every ticket transition, decision, refund attempt, RITOS call)
- **integration_events** (outbox): id, event_type, ticket_id, payload jsonb, status (PENDING, SENT, FAILED), attempts, last_error, created_at, sent_at
- **ritos_exchanges**: id, ticket_id, direction (OUT/IN), endpoint, request jsonb, response jsonb, http_status, latency_ms, created_at (feeds the admin RITOS page)
- **idempotency_keys**: key, scope, request_hash, response jsonb, created_at

### Database-enforced safety
- `CHECK` that the sum of SUCCESS/PENDING/PROCESSING refund_transactions per transaction never exceeds `payments.amount_minor` (enforce in a transaction with `SELECT ... FOR UPDATE` on the payment row; add a deferred constraint trigger as a backstop).
- Unique `(transaction_id, idempotency_key)` on refund_transactions.
- Ticket status changes only via `transitionTicket()`.

## 7. Ticket state machine
Statuses: `PENDING_RITOS, PROCESSING, APPROVED, PARTIALLY_APPROVED, REJECTED, HUMAN_REVIEW, REFUND_INITIATED, REFUND_PROCESSING, REFUNDED, FAILED`.

Note: the original draft used `AUTO_APPROVED`. Use `APPROVED` plus `approval_source = AUTO|HUMAN`, because a human-approved ticket should not read as "auto".

```
PENDING_RITOS -> PROCESSING
PROCESSING    -> APPROVED | PARTIALLY_APPROVED | REJECTED | HUMAN_REVIEW
PENDING_RITOS -> HUMAN_REVIEW          (RITOS unavailable past timeout; see below)
HUMAN_REVIEW  -> APPROVED | PARTIALLY_APPROVED | REJECTED   (human)
APPROVED | PARTIALLY_APPROVED -> REFUND_INITIATED -> REFUND_PROCESSING -> REFUNDED
REFUND_INITIATED | REFUND_PROCESSING -> FAILED -> REFUND_INITIATED  (retry, same idempotency key)
```
Terminal: `REFUNDED`, `REJECTED`. Anything else returns 409 `ILLEGAL_TRANSITION`.

If RITOS does not pick up a ticket within `RITOS_TIMEOUT_MINUTES` (default 10), the outbox marks the event failed after retries and an admin banner appears; the ticket stays `PENDING_RITOS` and can be manually routed to `HUMAN_REVIEW`. The app must never lose a ticket because RITOS is down.

## 8. Customer-visible timeline mapping
Ticket Created -> RITOS Processing -> Eligibility Verified -> Decision -> Refund Initiated -> Refund Completed. Derive from `audit_events`; do not store separately. Customers see friendly text only ("We are reviewing your request"), never confidence scores, risk, or agent traces.

## 9. Events (outbox pattern)
Emit into `integration_events` in the same DB transaction as the state change, then a dispatcher posts them to RITOS (`POST {RITOS_BASE_URL}/webhooks/shopflow`, signed with HMAC `X-ShopFlow-Signature`). With `MOCK_RITOS=true` the dispatcher invokes the mock directly.

`refund.ticket.created`, `refund.ticket.updated`, `refund.decision.received`, `refund.human.decided`, `refund.execution.completed`, `refund.execution.failed`.

Payload: `{ "event_id", "event_type", "occurred_at", "ticket_id", "context_url" }`. RITOS then pulls the context; events do not carry full data.

## 10. Frontend pages
Customer: `/`, `/products`, `/products/[id]` (refund policy panel is prominent and generated from structured policy), `/cart`, `/checkout`, `/orders/[id]/confirmation`, `/account/orders`, `/account/orders/[id]`, `/account/orders/[id]/refund` (ticket form), `/account/refunds`, `/account/refunds/[ticketId]` (timeline), `/account/profile`, notifications bell.
Admin: `/admin` (counts, quick links), `/admin/orders` (change status, simulate delivery), `/admin/refunds` (all tickets, filters), `/admin/review` (human queue + detail), `/admin/ritos` (integration console), `/admin/data` (customers, products, transactions), `/admin/api-docs` (renders docs/02).

Design bar: looks like a real store (clean grid, product cards, sticky header with cart, skeleton loaders, empty states, toasts, responsive down to mobile). Refund eligibility on the order page: show a "Request refund" button only when the order is DELIVERED (or lost-in-transit reasons apply) and not fully refunded; if outside the window still allow raising the ticket (RITOS must be able to reject it), but show the policy clearly beforehand.
