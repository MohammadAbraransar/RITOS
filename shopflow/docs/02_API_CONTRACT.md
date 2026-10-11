# 02: API Contract (ShopFlow <-> RITOS)

This file is the source of truth. If code and this file disagree, fix the code or change this file explicitly.

## 0. Conventions
- Base path `/api`. JSON only. UTC ISO-8601 timestamps. Money as integer paise in `*_minor` fields; `currency: "INR"`.
- **RITOS auth:** `Authorization: Bearer <RITOS_API_KEY>` on every `/api/ritos/*`, `/api/payments/*` and RITOS-readable resource endpoint. Missing/invalid -> 401.
- **Customer/admin auth:** session cookie. Customers can only read their own data (403 otherwise).
- **Idempotency:** mutating RITOS endpoints require `Idempotency-Key` header (UUID). Same key + same body -> same response (replay, `Idempotent-Replayed: true`). Same key + different body -> 422 `IDEMPOTENCY_KEY_REUSED`.
- **Error envelope:**
```json
{ "error": { "code": "TICKET_NOT_FOUND", "message": "No ticket RIT-2026-000999", "details": {} } }
```
Codes: `UNAUTHORIZED, FORBIDDEN, VALIDATION_ERROR, NOT_FOUND, ILLEGAL_TRANSITION, IDEMPOTENCY_KEY_REUSED, AMOUNT_EXCEEDS_REFUNDABLE, DUPLICATE_REFUND, PAYMENT_NOT_PAID, RATE_LIMITED, INTERNAL`.
- Rate limit: RITOS 600 req/min, customers 60 req/min per IP on write endpoints.
- Customer-facing responses never include `risk_metadata`, `agent_trace`, `confidence_score`, or `derived_facts.risk_*`.

## 1. PRIMARY: refund context
### `GET /api/ritos/refund-tickets/:ticketId/context`
**Purpose:** everything RITOS needs to decide, in one call. ShopFlow supplies facts; RITOS decides.
**Response 200:**
```json
{
  "context_version": "1.0",
  "generated_at": "2026-10-11T09:30:00Z",
  "ticket": {
    "ticket_id": "RIT-2026-000123",
    "status": "PENDING_RITOS",
    "reason": "PRODUCT_DAMAGED",
    "description": "The left ear cup arrived cracked.",
    "requested_action": "FULL_REFUND",
    "requested_amount_minor": 299900,
    "currency": "INR",
    "created_at": "2026-10-11T09:20:00Z"
  },
  "customer": {
    "customer_id": "CUS-10001",
    "name": "Aarav Mehta",
    "email": "aarav@example.com",
    "account_age_days": 420,
    "lifetime_order_count": 7,
    "refund_tickets_30d": 0,
    "refund_tickets_90d": 1,
    "refund_tickets_lifetime": 1,
    "risk_metadata": { "manual_watchlist": false }
  },
  "order": {
    "order_id": "ORD-10291",
    "status": "DELIVERED",
    "delivery_status": "DELIVERED",
    "ordered_at": "2026-10-01T10:00:00Z",
    "delivered_at": "2026-10-07T12:00:00Z",
    "total_minor": 299900,
    "shipping_address": { "city": "Hyderabad", "pincode": "500081" },
    "items": [
      { "order_item_id": "OI-1", "product_id": "PROD-001", "quantity": 1,
        "unit_price_minor": 299900, "unit_serial": null }
    ]
  },
  "product": {
    "product_id": "PROD-001", "sku": "AUD-WH-001", "name": "Nimbus Wireless Headphones",
    "category": "Audio", "brand": "Nimbus", "price_minor": 299900,
    "is_digital": false, "is_personalized": false, "is_clearance": false
  },
  "transaction": {
    "transaction_id": "TXN-884321", "payment_id": "PAY-5521",
    "amount_minor": 299900, "payment_method": "UPI", "payment_status": "PAID",
    "paid_at": "2026-10-01T10:01:00Z"
  },
  "refund_policy": {
    "policy_version": 1,
    "policy_type": "FULL",
    "refund_percentage": 100,
    "return_window_days": 30,
    "opened_allowed": true,
    "requires_unused": false,
    "defective_only": false,
    "exchange_only": false,
    "replacement_allowed": true,
    "return_required": true,
    "return_shipping": "FREE",
    "verification_required": "NONE",
    "evidence_required_reasons": ["PRODUCT_DAMAGED", "WRONG_PRODUCT"],
    "human_approval_threshold_minor": null,
    "exceptions": { "defective_on_arrival": true },
    "snapshot_taken_at": "2026-10-11T09:20:00Z"
  },
  "evidence": [
    { "evidence_id": "EVD-1", "type": "IMAGE", "filename": "damage.jpg", "mime": "image/jpeg",
      "size_bytes": 184233, "sha256": "…", "url": "https://shopflow.local/api/ritos/evidence/EVD-1/download",
      "uploaded_at": "2026-10-11T09:20:05Z" }
  ],
  "refund_history": [
    { "ticket_id": "RIT-2026-000090", "order_id": "ORD-10100", "product_id": "PROD-013",
      "status": "REFUNDED", "refunded_amount_minor": 229900, "created_at": "2026-08-02T08:00:00Z" }
  ],
  "related_tickets": [
    { "ticket_id": "RIT-2026-000101", "relation": "SAME_TRANSACTION", "status": "REFUNDED",
      "refunded_amount_minor": 299900 }
  ],
  "refund_ledger": {
    "transaction_amount_minor": 299900,
    "already_refunded_minor": 0,
    "in_flight_minor": 0,
    "remaining_refundable_minor": 299900
  },
  "derived_facts": {
    "days_since_delivery": 4,
    "return_window_expires_at": "2026-11-06T12:00:00Z",
    "within_return_window": true,
    "evidence_required": true,
    "evidence_count": 1,
    "requested_exceeds_remaining": false,
    "above_high_value_threshold": false,
    "claim_data_conflicts": [],
    "reason_policy_notes": ["Policy accepts damaged items with evidence"]
  },
  "timestamps": {
    "order_created": "2026-10-01T10:00:00Z",
    "delivered": "2026-10-07T12:00:00Z",
    "ticket_created": "2026-10-11T09:20:00Z"
  }
}
```
`claim_data_conflicts` examples (facts only): `["Reason is ORDER_NEVER_ARRIVED but order.delivery_status is DELIVERED"]`, `["Requested quantity 2 exceeds ordered quantity 1"]`, `["Requested amount 450000 exceeds item price 299900"]`.
**How RITOS uses it:** Intake reads `ticket`; Verification reads `order/transaction/refund_ledger`; Policy reads `refund_policy/derived_facts`; Duplicate agent reads `related_tickets/refund_ledger`; Risk reads `customer/refund_history`. Stable keys; additions are non-breaking, removals bump `context_version`.
Errors: 401, 404 `NOT_FOUND`.

### `GET /api/ritos/evidence/:evidenceId/download`
Streams the file. RITOS-key only. Use for later vision analysis.

## 2. Decision callback
### `POST /api/ritos/refund-decision`  (Idempotency-Key required)
**Request:**
```json
{
  "ticket_id": "RIT-2026-000123",
  "decision": "APPROVED",
  "refund_percentage": 100,
  "refund_amount_minor": 299900,
  "reason": "Eligible under product refund policy; evidence provided; within window.",
  "confidence_score": 0.96,
  "processed_by": "RITOS",
  "requires_human_review": false,
  "agent_trace": [
    { "agent": "intake", "output": { "category": "damaged_item" }, "ms": 410 },
    { "agent": "policy", "output": { "eligible": true }, "ms": 120 }
  ]
}
```
`decision`: `APPROVED | PARTIALLY_APPROVED | REJECTED | HUMAN_REVIEW`.
**ShopFlow behavior:**
1. Validate; ticket must be `PENDING_RITOS` or `PROCESSING` (else 409). Replay with same key returns the stored response.
2. Guardrails (ShopFlow protects its ledger, not the decision logic): `refund_amount_minor <= remaining_refundable_minor`, else 422 `AMOUNT_EXCEEDS_REFUNDABLE`. If `decision=APPROVED|PARTIALLY_APPROVED` and the ticket already has a refund that exhausts the ledger, 409 `DUPLICATE_REFUND`.
3. Insert `refund_decisions` row, transition ticket (`APPROVED` / `PARTIALLY_APPROVED` / `REJECTED` / `HUMAN_REVIEW`), `approval_source=AUTO` for approvals, write audit event, create customer notification.
4. If `EXECUTION_OWNER=shopflow` and the decision is an approval, run the refund execution (section 4) automatically.
**Response 200:** `{ "ticket_id": "...", "status": "APPROVED", "next": "AWAIT_REFUND_EXECUTION" }` (or `"next": "HUMAN_REVIEW_QUEUE"` / `"CLOSED"`).
**How RITOS uses it:** the Decision Agent posts this once per ticket.

### `POST /api/ritos/refund-tickets/:ticketId/status`
RITOS reports processing started: `{ "status": "PROCESSING" }`. Only `PROCESSING` allowed here.

## 3. Human review (ShopFlow internal, session-auth, role SUPPORT_ANALYST/ADMIN)
### `POST /api/admin/refunds/:ticketId/human-decision`
```json
{ "action": "APPROVE|REJECT|MODIFY", "refund_amount_minor": 250000, "note": "Partial due to visible wear" }
```
Ticket must be `HUMAN_REVIEW`. Writes a new `refund_decisions` row (`processed_by: HUMAN:<userId>`), transitions the ticket, emits `refund.human.decided`, and (if `EXECUTION_OWNER=shopflow`) runs execution. `MODIFY` requires an amount <= remaining refundable and creates `PARTIALLY_APPROVED` unless the amount equals the full remaining amount.

## 4. Mock refund execution
### `POST /api/payments/refund`  (RITOS key or internal; Idempotency-Key required)
```json
{ "transaction_id": "TXN-884321", "amount_minor": 299900, "ticket_id": "RIT-2026-000123" }
```
**Response 200 (SUCCESS):**
```json
{ "refund_id": "REF-99382", "status": "SUCCESS", "transaction_id": "TXN-884321",
  "amount_minor": 299900, "currency": "INR", "estimated_credit_time": "2-5 business days" }
```
Rules:
- Locks the payment row; computes remaining refundable; rejects over-refund with 422 `AMOUNT_EXCEEDS_REFUNDABLE`.
- Same `Idempotency-Key` -> same response, no second `refund_transactions` row. Same ticket + same amount with a **different** key while one is SUCCESS/PENDING -> 409 `DUPLICATE_REFUND` (returns the existing `refund_id`).
- Payment must be `PAID` or `PARTIALLY_REFUNDED`, else 422 `PAYMENT_NOT_PAID`.
- Admin failure simulation: if the admin has set `simulate_refund_failure` on the ticket or payment, return 502 `{status:"FAILED"}` once, mark ticket `FAILED`; a retry with the **same** key after the flag is cleared succeeds.
- On success: ticket -> `REFUND_INITIATED` -> `REFUND_PROCESSING` -> `REFUNDED` (mock provider resolves after ~3 s, background job), payment status updated, notification created, event `refund.execution.completed`.

### `GET /api/payments/refund/:refundId`
Status poll for RITOS reconciliation: `{ refund_id, status, amount_minor, transaction_id, ticket_id, updated_at }`.

## 5. Notifications from RITOS
### `POST /api/ritos/notifications`
`{ "ticket_id": "...", "title": "Refund approved", "body": "₹2,999 refund initiated. Expected credit: 2-5 business days.", "channel": "IN_APP" }` -> stored and shown to the customer. In `MOCK_RITOS` mode ShopFlow generates equivalent notifications itself.

## 6. Resource endpoints for RITOS
All GET, RITOS-key auth (customer-scoped versions exist for the UI under `/api/me/...`).
| Endpoint | Returns |
|---|---|
| `/api/orders/:orderId` | order summary |
| `/api/orders/:orderId/details` | order + items + payment + delivery + tickets on the order |
| `/api/orders/:orderId/refund-eligibility` | **facts** only: `{ days_since_delivery, within_return_window, policy_type, evidence_required, remaining_refundable_minor, existing_tickets }`; no verdict field |
| `/api/customers/:customerId` | profile + counts (+ `risk_metadata` for RITOS key only) |
| `/api/customers/:customerId/refund-history` | all tickets with outcomes and refunded amounts |
| `/api/products/:productId` | product |
| `/api/products/:productId/refund-policy` | active structured policy |
| `/api/transactions/:transactionId` | payment + `refund_ledger` + refund_transactions |
| `/api/refunds/:ticketId` | ticket (RITOS key or owner) |
| `/api/refunds/:ticketId/context` | alias of the primary context endpoint |
| `/api/refunds?status=PENDING_RITOS&limit=50&cursor=` | polling fallback if webhooks are not used |

## 7. Customer/UI endpoints (session auth)
`POST /api/auth/register|login|logout`, `GET /api/me`, `GET /api/products`, `GET /api/products/:id`, `GET/POST/PATCH/DELETE /api/cart`, `POST /api/checkout` (creates order + mock payment; `payment_method` in `UPI|CARD|NETBANKING|COD`; a magic test card or UPI id `fail@mock` yields FAILED), `GET /api/me/orders`, `GET /api/me/orders/:id`, `POST /api/me/orders/:id/refund-tickets` (multipart: fields + up to 5 files), `GET /api/me/refund-tickets`, `GET /api/me/refund-tickets/:id` (sanitized + timeline), `GET /api/me/notifications`, `POST /api/me/notifications/:id/read`.

**Create ticket validation:** order belongs to caller; order item belongs to order; reason and requested_action are valid enums; `requested_amount_minor` between 1 and item total; max 5 files, 5 MB each, `image/jpeg|png|webp|application/pdf`; no ticket if the item already has an active (non-REJECTED, non-FAILED) ticket whose amounts exhaust the ledger (return 409 with the existing ticket id; the customer is told, but suspicious repeat attempts are still visible to RITOS via `related_tickets` when allowed by policy). On success: status `PENDING_RITOS`, policy snapshot stored, event `refund.ticket.created` emitted, response includes the ticket id.

Enums: reason = `PRODUCT_DAMAGED, PRODUCT_DEFECTIVE, WRONG_PRODUCT, MISSING_ITEM, NOT_AS_DESCRIBED, DUPLICATE_CHARGE, ORDER_NEVER_ARRIVED, LATE_DELIVERY, CHANGED_MIND, INCORRECT_QUANTITY, BILLING_ISSUE, OTHER`; requested_action = `FULL_REFUND, PARTIAL_REFUND, REPLACEMENT, EXCHANGE, RETURN`.

Because a second ticket for the same transaction must still be possible to *record* for RITOS to flag (Scenario 7), the duplicate-ticket block above applies only to **UI creation when the ledger is fully refunded and the previous ticket is REFUNDED**. Seeded data and the admin "create ticket as customer" tool bypass this so the duplicate scenario is demonstrable.

## 8. Admin/demo endpoints (session auth, ADMIN)
`PATCH /api/admin/orders/:id/status`, `POST /api/admin/orders/:id/simulate-delivery` (sets DELIVERED with `delivered_at` = now or a chosen past date), `POST /api/admin/tickets/:id/simulate-refund-failure` (toggle), `GET /api/admin/ritos/exchanges?ticketId=` (request/response log), `POST /api/admin/refunds/:ticketId/resend-to-ritos`, `POST /api/admin/demo/reset-and-seed`.

## 9. Webhook to RITOS (outbound)
`POST {RITOS_BASE_URL}/webhooks/shopflow`
Headers: `X-ShopFlow-Signature: sha256=<HMAC of body with SHOPFLOW_OUTBOUND_KEY>`, `X-ShopFlow-Event-Id`.
Body: `{ "event_id": "...", "event_type": "refund.ticket.created", "occurred_at": "...", "ticket_id": "RIT-2026-000123", "context_url": "{SHOPFLOW_BASE_URL}/api/ritos/refund-tickets/RIT-2026-000123/context" }`.
Retry with exponential backoff (1s, 5s, 30s, 5m, 30m), then mark `FAILED` and surface in `/admin/ritos`. RITOS must treat deliveries as at-least-once and dedupe on `event_id`.
