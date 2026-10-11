# ShopFlow <-> RITOS API: Sample Requests

This guide provides tested, copy-pasteable `curl` commands for every RITOS endpoint defined in `docs/02_API_CONTRACT.md`.

## Authentication & Headers

- All RITOS endpoints require the Bearer token:
  `-H "Authorization: Bearer dev-ritos-secret-key-12345"`
- Mutating endpoints (`POST /api/ritos/refund-decision`, `POST /api/payments/refund`) require a unique UUID in:
  `-H "Idempotency-Key: <uuid>"`
- Content type is always JSON unless downloading binary files:
  `-H "Content-Type: application/json"`
- Base URL defaults to `http://localhost:3000`.

---

## 1. Primary Refund Context

### `GET /api/ritos/refund-tickets/:ticketId/context`
Fetch the complete 360-degree adjudication context for a refund ticket in one call.

```bash
curl -X GET "http://localhost:3000/api/ritos/refund-tickets/RIT-2026-000100/context" \
  -H "Authorization: Bearer dev-ritos-secret-key-12345" \
  -H "Accept: application/json"
```

### Context Alias
```bash
curl -X GET "http://localhost:3000/api/refunds/RIT-2026-000100/context" \
  -H "Authorization: Bearer dev-ritos-secret-key-12345"
```

---

## 2. Evidence Download

### `GET /api/ritos/evidence/:evidenceId/download`
Streams evidence file bytes (JPEG/PNG/PDF) for vision analysis or human review.

```bash
curl -X GET "http://localhost:3000/api/ritos/evidence/EVD-000100/download" \
  -H "Authorization: Bearer dev-ritos-secret-key-12345" \
  --output downloaded_evidence.jpg
```

---

## 3. Decision Callback

### `POST /api/ritos/refund-decision`
Post an automated adjudication decision from RITOS to ShopFlow.

#### Approved Decision
```bash
curl -X POST "http://localhost:3000/api/ritos/refund-decision" \
  -H "Authorization: Bearer dev-ritos-secret-key-12345" \
  -H "Idempotency-Key: 7b3112a2-89e4-4d83-b541-e945c7867201" \
  -H "Content-Type: application/json" \
  -d '{
    "ticket_id": "RIT-2026-000100",
    "decision": "APPROVED",
    "refund_percentage": 100,
    "refund_amount_minor": 299900,
    "reason": "Eligible under product refund policy; clear evidence of transit damage; within return window.",
    "confidence_score": 0.96,
    "processed_by": "RITOS",
    "requires_human_review": false,
    "agent_trace": [
      { "agent": "intake", "output": { "category": "damaged_item" }, "ms": 250 },
      { "agent": "policy", "output": { "eligible": true }, "ms": 110 },
      { "agent": "risk", "output": { "risk_score": 0.05 }, "ms": 80 }
    ]
  }'
```

#### Routing to Human Review
```bash
curl -X POST "http://localhost:3000/api/ritos/refund-decision" \
  -H "Authorization: Bearer dev-ritos-secret-key-12345" \
  -H "Idempotency-Key: 8c4223b3-9af5-5e94-c652-fa56d8978312" \
  -H "Content-Type: application/json" \
  -d '{
    "ticket_id": "RIT-2026-000105",
    "decision": "HUMAN_REVIEW",
    "refund_percentage": 100,
    "refund_amount_minor": 7499900,
    "reason": "High-value smartphone claim without unboxing video requires human verification.",
    "confidence_score": 0.52,
    "processed_by": "RITOS",
    "requires_human_review": true,
    "agent_trace": [
      { "agent": "policy", "output": { "high_value_hold": true }, "ms": 120 }
    ]
  }'
```

---

## 4. Ticket Status Update

### `POST /api/ritos/refund-tickets/:ticketId/status`
Notify ShopFlow that RITOS orchestration has commenced.

```bash
curl -X POST "http://localhost:3000/api/ritos/refund-tickets/RIT-2026-000100/status" \
  -H "Authorization: Bearer dev-ritos-secret-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "PROCESSING"
  }'
```

---

## 5. Refund Execution (Payout)

### `POST /api/payments/refund`
Trigger mock payment provider refund transaction with concurrency and over-refund guardrails.

```bash
curl -X POST "http://localhost:3000/api/payments/refund" \
  -H "Authorization: Bearer dev-ritos-secret-key-12345" \
  -H "Idempotency-Key: 19283746-beef-4321-abcd-fedcba098765" \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_id": "TXN-10100",
    "amount_minor": 299900,
    "ticket_id": "RIT-2026-000100"
  }'
```

### `GET /api/payments/refund/:refundId`
Poll status of a refund transaction.

```bash
curl -X GET "http://localhost:3000/api/payments/refund/REF-10100" \
  -H "Authorization: Bearer dev-ritos-secret-key-12345"
```

---

## 6. Notifications

### `POST /api/ritos/notifications`
Dispatch an in-app or webhook notification to the customer.

```bash
curl -X POST "http://localhost:3000/api/ritos/notifications" \
  -H "Authorization: Bearer dev-ritos-secret-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "ticket_id": "RIT-2026-000100",
    "title": "Refund Approved",
    "body": "₹2,999 refund initiated. Expected credit: 2-5 business days.",
    "channel": "IN_APP"
  }'
```

---

## 7. Resource Endpoints

### Orders
```bash
# Order summary
curl -X GET "http://localhost:3000/api/orders/ORD-10100" \
  -H "Authorization: Bearer dev-ritos-secret-key-12345"

# Full order details with items, payment, and delivery
curl -X GET "http://localhost:3000/api/orders/ORD-10100/details" \
  -H "Authorization: Bearer dev-ritos-secret-key-12345"

# Objective refund eligibility facts
curl -X GET "http://localhost:3000/api/orders/ORD-10100/refund-eligibility" \
  -H "Authorization: Bearer dev-ritos-secret-key-12345"
```

### Customers
```bash
# Customer profile (includes risk_metadata for authorized RITOS key)
curl -X GET "http://localhost:3000/api/customers/CUS-10001" \
  -H "Authorization: Bearer dev-ritos-secret-key-12345"

# Customer historical refund tickets
curl -X GET "http://localhost:3000/api/customers/CUS-10001/refund-history" \
  -H "Authorization: Bearer dev-ritos-secret-key-12345"
```

### Products & Policies
```bash
# Product details
curl -X GET "http://localhost:3000/api/products/PROD-001" \
  -H "Authorization: Bearer dev-ritos-secret-key-12345"

# Active structured refund policy
curl -X GET "http://localhost:3000/api/products/PROD-001/refund-policy" \
  -H "Authorization: Bearer dev-ritos-secret-key-12345"
```

### Transactions & Refunds
```bash
# Transaction detail with refund ledger
curl -X GET "http://localhost:3000/api/transactions/TXN-10100" \
  -H "Authorization: Bearer dev-ritos-secret-key-12345"

# Ticket details
curl -X GET "http://localhost:3000/api/refunds/RIT-2026-000100" \
  -H "Authorization: Bearer dev-ritos-secret-key-12345"

# Polling queue for pending tickets (polling fallback)
curl -X GET "http://localhost:3000/api/refunds?status=PENDING_RITOS&limit=50" \
  -H "Authorization: Bearer dev-ritos-secret-key-12345"
```
