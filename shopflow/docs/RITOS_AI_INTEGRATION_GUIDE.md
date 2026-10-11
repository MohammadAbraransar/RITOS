# RITOS Integration Guide for AI Agents & Developers

This document is a complete, self-contained specification designed to allow an **autonomous AI coding agent** (or human engineering team) to connect **RITOS** (Refund Intelligence & Orchestration System) to **ShopFlow** with zero ambiguity.

---

## 1. System Boundary and Roles

| Responsibility | Owner | Details |
| :--- | :--- | :--- |
| **System of Record (SoR)** | **ShopFlow** | Owns database, customer accounts, catalog, orders, payments, file storage, and audit logs. |
| **Execution of Payouts** | **ShopFlow** | Enforces row locks (`FOR UPDATE`), duplicate/over-refund prevention, and banking settlement. |
| **Customer Interface** | **ShopFlow** | Renders storefront, orders, claim filing forms, and real-time status timelines. |
| **Intelligence & Decision Engine** | **RITOS** | Ingests claim context, policy rules, and multimodal evidence. Computes fraud risk, confidence score, and adjudication decision. |

> **Non-Negotiable Invariant**: Customers **NEVER** see internal AI metadata. RITOS fields such as `risk_metadata`, `confidence_score`, and `agent_trace` are strictly internal to RITOS and ShopFlow staff admins.

---

## 2. Integration Architecture

Two integration patterns are supported:

### Pattern A: Event-Driven Webhooks (Recommended)
```
1. Customer files ticket on ShopFlow -> Ticket saved as PENDING_RITOS
2. ShopFlow Outbox fires Webhook  ---> POST ${RITOS_BASE_URL}/webhook/refund-tickets
3. RITOS fetches full context facts -> GET  ${SHOPFLOW_BASE_URL}/api/ritos/refund-tickets/:id/context
4. RITOS downloads image/evidence   -> GET  ${SHOPFLOW_BASE_URL}/api/ritos/evidence/:id/download
5. RITOS computes decision & posts  -> POST ${SHOPFLOW_BASE_URL}/api/ritos/refund-decision
6. ShopFlow executes payment payout & updates customer timeline
```

### Pattern B: Polling Worker (Fallback)
If RITOS cannot host a publicly reachable webhook endpoint:
```
1. RITOS polls pending queue       -> GET  ${SHOPFLOW_BASE_URL}/api/refunds?status=PENDING_RITOS
2. RITOS processes each ticket     -> (Follows steps 3, 4, 5, 6 above)
```

---

## 3. Environment Configuration

### ShopFlow Configuration (`.env`)
```env
# Disable mock decisions to allow real RITOS integration
MOCK_RITOS="false"

# The base URL of your RITOS instance
RITOS_BASE_URL="http://localhost:8000"

# The shared secret bearer token for API authorization
RITOS_API_KEY="ritos_dev_key_secret_2026"

# Base URL of ShopFlow
SHOPFLOW_BASE_URL="http://localhost:3000"
```

### RITOS Configuration (`.env` or Config)
```env
SHOPFLOW_BASE_URL="http://localhost:3000"
RITOS_API_KEY="ritos_dev_key_secret_2026"
PORT=8000
```

---

## 4. API Endpoints Specification

### 4.1. Webhook ShopFlow Sends to RITOS
- **Trigger**: Customer submits refund request or staff clicks "Resend to RITOS".
- **Method**: `POST`
- **Path**: `${RITOS_BASE_URL}/webhook/refund-tickets`
- **Headers**:
  ```http
  Content-Type: application/json
  Authorization: Bearer ritos_dev_key_secret_2026
  ```
- **Request Body**:
  ```json
  {
    "event_id": "EVT-2026-000001",
    "event_type": "refund.ticket.created",
    "timestamp": "2026-10-11T17:45:00.000Z",
    "ticket_id": "RIT-2026-000001",
    "status": "PENDING_RITOS"
  }
  ```
- **Expected RITOS Response**: HTTP `200 OK` or HTTP `202 Accepted`.

---

### 4.2. Fetch Refund Ticket Context (Dossier Read)
RITOS calls this endpoint to get all facts needed to make an AI decision.
- **Method**: `GET`
- **Path**: `http://localhost:3000/api/ritos/refund-tickets/{ticketId}/context`
- **Headers**:
  ```http
  Authorization: Bearer ritos_dev_key_secret_2026
  ```
- **Response Format (`application/json`)**:
  ```json
  {
    "ticket": {
      "id": "RIT-2026-000001",
      "reason": "PRODUCT_DAMAGED",
      "requested_action": "FULL_REFUND",
      "requested_amount_minor": 299900,
      "description": "Left ear cup arrived cracked and broken in package",
      "status": "PENDING_RITOS",
      "created_at": "2026-10-11T17:45:00.000Z"
    },
    "customer": {
      "id": "usr_aarav_01",
      "name": "Aarav Sharma",
      "email": "aarav@example.com",
      "phone": "+91 98765 43210",
      "account_age_days": 180,
      "total_orders_count": 8,
      "total_spent_minor": 4500000,
      "refunds_count_30d": 0,
      "refund_ratio_lifetime": 0.05,
      "risk_tier": "LOW",
      "account_flags": []
    },
    "order": {
      "id": "ORD-2026-000125",
      "status": "DELIVERED",
      "ordered_at": "2026-10-06T10:00:00.000Z",
      "delivered_at": "2026-10-07T14:30:00.000Z",
      "days_since_delivery": 4,
      "shipping_address": {
        "city": "Bengaluru",
        "state": "Karnataka",
        "pincode": "560001"
      }
    },
    "product": {
      "id": "PROD-001",
      "name": "Nimbus Wireless Noise-Cancelling Headphones",
      "sku": "NIM-NC-001",
      "category": "Electronics",
      "unit_price_minor": 299900,
      "policy_snapshot": {
        "return_window_days": 30,
        "policy_type": "REPLACEMENT_AND_REFUND",
        "refund_percentage": 100,
        "evidence_required_reasons": ["PRODUCT_DAMAGED", "DEFECTIVE"],
        "human_approval_threshold_minor": 1000000
      }
    },
    "evidence": [
      {
        "id": "evi_01",
        "type": "IMAGE",
        "filename": "damage.jpg",
        "mime": "image/jpeg",
        "size_bytes": 145000,
        "download_url": "http://localhost:3000/api/ritos/evidence/evi_01/download"
      }
    ],
    "derived_facts": {
      "within_return_window": true,
      "evidence_provided": true,
      "evidence_required_by_policy": true,
      "requires_human_approval_by_threshold": false,
      "customer_velocity_flag": false,
      "remaining_refundable_minor": 299900,
      "claim_data_conflicts": []
    }
  }
  ```

---

### 4.3. Download Multimodal Evidence File
- **Method**: `GET`
- **Path**: `http://localhost:3000/api/ritos/evidence/{evidenceId}/download`
- **Headers**:
  ```http
  Authorization: Bearer ritos_dev_key_secret_2026
  ```
- **Response**: Binary image (`image/jpeg`, `image/png`) or PDF (`application/pdf`).

---

### 4.4. Submit AI Refund Decision (Decision Callback)
RITOS sends its final adjudication back to ShopFlow.
- **Method**: `POST`
- **Path**: `http://localhost:3000/api/ritos/refund-decision`
- **Headers**:
  ```http
  Content-Type: application/json
  Authorization: Bearer ritos_dev_key_secret_2026
  Idempotency-Key: <unique-uuid-per-decision-attempt>
  ```
- **Request Body**:
  ```json
  {
    "ticket_id": "RIT-2026-000001",
    "decision": "APPROVED",
    "refund_amount_minor": 299900,
    "confidence_score": 0.96,
    "reasoning": "Damage verified from photo, claim submitted 4 days after delivery (well within 30-day window), customer has clean purchase history.",
    "recommended_action": "FULL_REFUND",
    "risk_tier": "LOW",
    "agent_trace": {
      "model": "gpt-4o",
      "steps": [
        "check_return_window: PASS",
        "vision_evidence_check: DAMAGE_CONFIRMED",
        "fraud_velocity_score: 0.02"
      ],
      "execution_duration_ms": 1150
    }
  }
  ```

#### Decision Field Definitions:
- `decision` *(string, required)*:
  - `"APPROVED"`: Full or standard refund. ShopFlow automatically executes bank/UPI payout.
  - `"PARTIALLY_APPROVED"`: Partial refund (e.g. restocking fee or partial return). `refund_amount_minor` must be specified.
  - `"REJECTED"`: Claim denied. Ticket marked `REJECTED`, explanation shown to customer.
  - `"HUMAN_REVIEW"`: Escalates claim to human support analyst at `http://localhost:3000/admin/review`.
- `refund_amount_minor` *(number, required)*: Amount in paise (1 INR = 100 paise).
- `confidence_score` *(number, 0.0 to 1.0)*: AI model confidence.
- `reasoning` *(string)*: Explanation for the decision.
- `recommended_action` *(string)*: `"FULL_REFUND"`, `"PARTIAL_REFUND"`, `"REPLACEMENT"`, `"STORE_CREDIT"`, or `"NO_ACTION"`.
- `Idempotency-Key` *(header, required)*: Any retry with the same key returns the existing decision without double-executing payouts (`Idempotent-Replayed: true`).

---

### 4.5. Optional: Send Notification to Customer Timeline
RITOS can push progress updates or notes directly onto the customer's live tracking view.
- **Method**: `POST`
- **Path**: `http://localhost:3000/api/ritos/notifications`
- **Headers**:
  ```http
  Content-Type: application/json
  Authorization: Bearer ritos_dev_key_secret_2026
  ```
- **Request Body**:
  ```json
  {
    "ticket_id": "RIT-2026-000001",
    "channel": "IN_APP",
    "title": "Photo Evidence Verified",
    "message": "Our automated inspection confirmed packaging damage. Processing payout."
  }
  ```

---

## 5. Complete Ready-to-Run Integration Code

### Python (FastAPI / Requests) Example for RITOS
```python
import os
import requests
from fastapi import FastAPI, Header, HTTPException, Request

app = FastAPI(title="RITOS Integration Server")

SHOPFLOW_BASE_URL = os.getenv("SHOPFLOW_BASE_URL", "http://localhost:3000")
RITOS_API_KEY = os.getenv("RITOS_API_KEY", "ritos_dev_key_secret_2026")

headers = {
    "Authorization": f"Bearer {RITOS_API_KEY}",
    "Content-Type": "application/json"
}

@app.post("/webhook/refund-tickets")
async def handle_refund_webhook(payload: dict):
    ticket_id = payload.get("ticket_id")
    if not ticket_id:
        raise HTTPException(status_code=400, detail="Missing ticket_id")

    print(f"[RITOS] Received ticket webhook for: {ticket_id}")

    # 1. Fetch full context dossier from ShopFlow
    ctx_res = requests.get(
        f"{SHOPFLOW_BASE_URL}/api/ritos/refund-tickets/{ticket_id}/context",
        headers=headers
    )
    if not ctx_res.ok:
        raise HTTPException(status_code=502, detail="Failed to fetch context from ShopFlow")

    context = ctx_res.json()
    derived = context.get("derived_facts", {})
    ticket = context.get("ticket", {})
    customer = context.get("customer", {})

    # 2. Decision Logic Example
    if not derived.get("within_return_window"):
        decision = "REJECTED"
        amount = 0
        reason = "Claim filed outside the allowed return window."
    elif customer.get("refunds_count_30d", 0) >= 3:
        decision = "HUMAN_REVIEW"
        amount = ticket.get("requested_amount_minor", 0)
        reason = "High return velocity detected. Escalated for human inspection."
    else:
        decision = "APPROVED"
        amount = ticket.get("requested_amount_minor", 0)
        reason = "Verified within return window and approved by automated policy."

    # 3. Post decision back to ShopFlow
    idempotency_key = f"ritos-dec-{ticket_id}"
    decision_payload = {
        "ticket_id": ticket_id,
        "decision": decision,
        "refund_amount_minor": amount,
        "confidence_score": 0.95,
        "reasoning": reason,
        "recommended_action": "FULL_REFUND" if decision == "APPROVED" else "NO_ACTION",
        "risk_tier": customer.get("risk_tier", "LOW")
    }

    dec_res = requests.post(
        f"{SHOPFLOW_BASE_URL}/api/ritos/refund-decision",
        json=decision_payload,
        headers={**headers, "Idempotency-Key": idempotency_key}
    )

    print(f"[RITOS] Decision submitted: {decision} (HTTP {dec_res.status_code})")
    return {"status": "ok", "decision": decision}
```

---

### Node.js / TypeScript Example for RITOS
```typescript
import express from "express";

const app = express();
app.use(express.json());

const SHOPFLOW_URL = process.env.SHOPFLOW_BASE_URL || "http://localhost:3000";
const API_KEY = process.env.RITOS_API_KEY || "ritos_dev_key_secret_2026";

app.post("/webhook/refund-tickets", async (req, res) => {
  const { ticket_id } = req.body;
  console.log(`[RITOS] Processing ticket: ${ticket_id}`);

  // 1. Fetch Context
  const contextRes = await fetch(`${SHOPFLOW_URL}/api/ritos/refund-tickets/${ticket_id}/context`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const context = await contextRes.json();

  // 2. Perform AI / Policy evaluation
  const isApproved = context.derived_facts?.within_return_window;

  // 3. Post Decision Callback
  const decisionRes = await fetch(`${SHOPFLOW_URL}/api/ritos/refund-decision`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
      "Idempotency-Key": `dec-${ticket_id}-${Date.now()}`,
    },
    body: JSON.stringify({
      ticket_id,
      decision: isApproved ? "APPROVED" : "REJECTED",
      refund_amount_minor: isApproved ? context.ticket.requested_amount_minor : 0,
      confidence_score: 0.97,
      reasoning: isApproved ? "Approved by automated policy." : "Outside return window.",
      recommended_action: isApproved ? "FULL_REFUND" : "NO_ACTION",
    }),
  });

  return res.json({ success: true });
});

app.listen(8000, () => console.log("RITOS listening on port 8000"));
```

---

## 6. Testing Your Integration

1. Start your RITOS agent on port `8000`.
2. Clean ShopFlow database:
   ```bash
   npm run db:clean
   ```
3. Run ShopFlow:
   ```bash
   npm run dev
   ```
4. Place an order on `http://localhost:3000` -> mark as DELIVERED in `/admin/orders` -> click **"Request Refund"**.
5. Watch your RITOS server logs receive the webhook, fetch the context, and post the decision!
