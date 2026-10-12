# RITOS — Operations, Integrations & Runbook

**Document Date:** 2026-10-12  
**System:** RITOS (Refund Intelligence & Triage Orchestration System)

---

## 1. Integrations Status Register

| Integration | Provider / Mode | Current Status | Operational Behavior |
|:---|:---|:---|:---|
| **Payment Gateway** | `SANDBOX` | **IMPLEMENTED** | Processes mock payouts with idempotency, simulated timeouts, and failure branches. |
| **Payment Gateway** | `Razorpay` / `Stripe` | **NOT_CONFIGURED** | Requires live merchant API keys (`RAZORPAY_KEY_ID`, `STRIPE_API_KEY`). Reports `NOT_CONFIGURED` without raising mock successes. |
| **Store Engine** | `ShopFlow` | **INTEGRATED** | Outbox pattern with transactional callbacks. Tickets linked via `store_ticket_id`. |
| **Computer Vision** | `OpenCLIP` / `Pillow` | **CONFIGURED / LOCAL** | Validates image quality, difference hash duplicates. Uses local OpenCLIP when `VISION_PROVIDER=clip` is set, else reports `inconclusive`. |
| **Carrier Tracking** | `Carrier API` | **NOT_CONFIGURED** | Reports `NOT_CONFIGURED`. Uses store fulfillment milestones labeled as merchant-supplied facts. |
| **Malware Scanner** | `ClamAV` | **BLOCKED** | Safe magic-byte and decompression guards enabled; ClamAV daemon requires external infrastructure. |

---

## 2. Environment Configuration Reference

Required environment variables in `.env` (overriding `backend/app/config.py`):

```bash
# Database (Supabase PostgreSQL)
DATABASE_URL="postgresql://postgres:[PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres"
DB_SCHEMA="ritos"

# Application Security
SECRET_KEY="__GENERATE_HEX_32__"
RITOS_API_KEY="__GENERATE_HEX_32__"
GATEWAY_WEBHOOK_SECRET="__GENERATE_HEX_32__"

# Adjudication Limits
AUTO_APPROVE_MAX_INR=5000
VISION_PROVIDER="clip"   # or "none"
VISION_MIN_SIDE_PX=120
VISION_MIN_BLUR_VARIANCE=15.0
EVIDENCE_DIR="evidence_store"

# Integration URLs
SHOPFLOW_BASE_URL="http://localhost:3000"
```

---

## 3. Operational Runbooks

### 3.1 Developer & Demo Startup
To launch the full unified development environment:
```bash
pnpm bootstrap   # installs venv, node_modules, runs database migrations
pnpm dev         # launches split-pane runner (API :8000, Desk :5173, Shop :3000)
```

### 3.2 Gateway Timeout Incident Response
When a settlement attempt experiences a network timeout:
1. Status is marked `RECONCILIATION_REQUIRED`.
2. Do **NOT** attempt a blind re-execution.
3. Access the Finance Cockpit or call `POST /api/v1/refunds/{id}/reconcile`.
4. RITOS queries the gateway adapter using the saved `provider_reference`.
5. If the gateway confirmed the payout, RITOS posts the ledger journal and transitions to `REFUNDED`.
6. If the gateway declined or never received the attempt, RITOS marks `FAILED` and restores the balance.

### 3.3 Database Migrations
To inspect and apply forward migrations:
```bash
cd backend
..\.venv\Scripts\python -m alembic check
..\.venv\Scripts\python -m alembic upgrade head
```
