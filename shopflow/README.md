# ShopFlow

ShopFlow is a modern, high-reliability e-commerce platform and the **System of Record** for **RITOS** (Refund Intelligence & Orchestration System).

---

## 1. System Boundary and Architecture

ShopFlow and RITOS maintain a strict, decoupled boundary:

```
+-----------------------------------------------------------------------------------+
|                                     SHOPFLOW                                      |
|                               (System of Record)                                  |
|                                                                                   |
|  - Customer Webstore (Products, Cart, Checkout, Order Tracking)                   |
|  - Customer Refund Requests & Timeline Updates                                    |
|  - Relational Database (PostgreSQL 16) with Strict Constraints                    |
|  - Idempotent Refund Execution & Ledger Safety (FOR UPDATE row locks)             |
|  - Outbox Pattern (Transactional Integration Events Dispatcher)                   |
|  - Staff Console (/admin, /admin/review, /admin/ritos, /admin/data)               |
+-----------------------------------------------------------------------------------+
                                  |                 ^
             Outbox Webhook /     |                 |  POST /api/ritos/refund-decision
             GET /api/refunds     |                 |  (Decision Callback)
             (Context Dispatch)   v                 |
+-----------------------------------------------------------------------------------+
|                                      RITOS                                        |
|                          (AI Decision & Orchestration)                            |
|                                                                                   |
|  - Claim Comprehension & Multimodal Evidence Inspection                           |
|  - Policy Engine & Fact Derivation Verification                                   |
|  - Fraud & Risk Scoring (Velocity, Risk Tier, Return Abuse)                       |
|  - Confidence Calibration & Auto-Approval vs Human Review Routing                 |
+-----------------------------------------------------------------------------------+
```

### Non-Negotiable Invariants
1. **Zero Data Leakage**: Customer-facing APIs strictly whitelist fields using Zod output schemas (`src/server/schemas/customer.ts`). Customers **never** see `risk_metadata`, `confidence_score`, `agent_trace`, or internal model reasoning.
2. **Ledger Integrity**: Refund transactions are executed within serializable/row-locked PostgreSQL transactions (`SELECT ... FOR UPDATE`), preventing duplicate or concurrent over-refunds.
3. **Audit Trail**: Every state transition, human adjudication, and external webhook exchange is logged immutably in `audit_events`.

---

## 2. Quick Start and Setup

### Prerequisites
- Node.js 18.x or 20.x
- Docker & Docker Compose
- npm 9+

### 1. Clone & Install
```bash
git clone https://github.com/bangarukondabollapally/shopflow.git
cd shopflow
npm install
```

### 2. Environment Configuration
Copy the sample environment file:
```bash
cp .env.example .env
```

### 3. Launch PostgreSQL
```bash
docker compose up -d shopflow-postgres
```

### 4. Database Schema & Seed
```bash
npx prisma generate
npx prisma db push
npm run db:seed
```

### 5. Start Development Server
```bash
npm run dev
```
The application will be running at [http://localhost:3000](http://localhost:3000).

---

## 3. Environment Variables Reference

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/shopflow?schema=public` | PostgreSQL connection string |
| `DIRECT_URL` | `postgresql://postgres:postgres@localhost:5432/shopflow?schema=public` | Direct database connection string (for migrations) |
| `SESSION_SECRET` | `secret-must-be-at-least-32-chars-long-for-iron-session` | 32+ character key for secure cookie encryption |
| `RITOS_API_KEY` | `ritos_dev_key_secret_2026` | Shared secret for RITOS Bearer token authentication |
| `MOCK_RITOS` | `true` | When `true`, built-in deterministic rules orchestrator evaluates tickets |
| `RITOS_BASE_URL` | `http://localhost:4000` | Target URL of real RITOS instance when `MOCK_RITOS=false` |
| `MOCK_SETTLE_MS` | `3000` | Milliseconds before mock bank refund settles (`0` in automated test suites) |
| `UPLOAD_DIR` | `./uploads` | Local directory for uploaded refund evidence |

---

## 4. Demo Seed Accounts

All seed accounts share the default password: **`Demo@1234`**

| Role | Email | Password | Persona & Purpose |
| :--- | :--- | :--- | :--- |
| **Customer** | `aarav@example.com` | `Demo@1234` | VIP customer (low return rate, high lifetime value) |
| **Customer** | `priya@example.com` | `Demo@1234` | Frequent shopper (moderate orders) |
| **Customer** | `rohit@example.com` | `Demo@1234` | High return velocity customer (flagged in Scenario 5) |
| **Support Analyst**| `support@shopflow.test`| `Demo@1234` | Tier-2 support specialist with `/admin/review` queue access |
| **Administrator** | `admin@shopflow.test` | `Demo@1234` | Full access to operations, simulator controls, and data reset |

---

## 5. Seed Scenarios Matrix (docs/03 §3)

ShopFlow comes pre-seeded with 10 representative benchmark scenarios:

| # | Ticket ID | Customer | Product / Issue | RITOS Decision | Expected Resolution |
| :- | :--- | :--- | :--- | :--- | :--- |
| **1** | `RIT-2026-000101` | Aarav Sharma | Nimbus Headphones (Damaged) | `APPROVED` | Full refund auto-executed; ticket `REFUNDED` |
| **2** | `RIT-2026-000102` | Aarav Sharma | Organic Cotton Bedding (Disliked) | `PARTIALLY_APPROVED` | Policy specifies 80% refund (20% restocking fee applied) |
| **3** | `RIT-2026-000103` | Priya Patel | Silk Sleep Mask (Final Sale Item) | `REJECTED` | Final sale policy violation; ticket `REJECTED` |
| **4** | `RIT-2026-000104` | Neha Gupta | Minimalist Ceramic Mug (Day 42 claim) | `REJECTED` | 30-day window expired (`within_return_window=false`) |
| **5** | `RIT-2026-000105` | Rohit Verma | Mechanical Keyboard (Velocity hold) | `HUMAN_REVIEW` | 4th refund in 30 days; routed to analyst |
| **6** | `RIT-2026-000110` | Vikram Rao | Apex Pro Smartphone (₹64,999 claim) | `HUMAN_REVIEW` | High-value threshold (> ₹10,000) requires manual sign-off |
| **7** | `RIT-2026-000112` | Aarav Sharma | Yoga Mat (Duplicate refund attempt) | `REJECTED` | Sibling `RIT-2026-000111` already refunded 100% balance |
| **8** | `RIT-2026-000113` | Meera Iyer | Stainless Cookware (Claim conflict) | `HUMAN_REVIEW` | Claim states "Never Arrived", but carrier confirmed "Delivered" |
| **9** | `RIT-2026-000114` | Sneha Kulkarni| Bamboo Cutlery (No proof uploaded) | `HUMAN_REVIEW` | Missing mandatory damage photo; hold for evidence |
| **10**| `RIT-2026-000120` | Aarav Sharma | Espresso Machine (Arrived defective) | `APPROVED` | Valid proof, within window, VIP profile -> auto-approved |

---

## 6. How to Connect a Real RITOS Instance

To transition from the built-in mock orchestrator to a live external RITOS agent:

### 1. Update Environment Variables in `.env`
```env
MOCK_RITOS="false"
RITOS_BASE_URL="https://your-ritos-service.internal"
RITOS_API_KEY="your-production-secret-token"
```

### 2. Interaction Modes Supported
1. **Transactional Webhooks (Primary)**:
   - When a customer submits a refund, ShopFlow saves an event in `integration_events` (status: `PENDING`).
   - The outbox dispatcher posts the event payload to `${RITOS_BASE_URL}/webhook/refund-tickets`.
   - RITOS reads full contextual facts via `GET /api/ritos/refund-tickets/:ticketId/context`.
2. **Polling Worker (Fallback)**:
   - RITOS can poll `GET /api/refunds?status=PENDING_RITOS` with `Authorization: Bearer <RITOS_API_KEY>`.
3. **Decision Ingestion**:
   - RITOS posts decisions to ShopFlow at `POST /api/ritos/refund-decision` with `Idempotency-Key: <uuid>`.
   - If auto-approved, ShopFlow initiates the payment refund immediately.

Detailed curl examples for all endpoints can be found in [`docs/SAMPLE_REQUESTS.md`](file:///c:/Career/NextGen%20Project/ShopFlow/docs/SAMPLE_REQUESTS.md).

---

## 7. Automated Test Suite

### Unit & Integration Tests (Vitest)
Executes state-machine checks, ledger guards, concurrency simulations, context contract validations, and customer sanitization scans:
```bash
npm run test
```

### End-to-End Tests (Playwright)
Validates the complete browser-driven demo flows (Happy Path & Exception Path):
```bash
npm run test:e2e
```

### Static Typecheck & Lint
```bash
npx tsc --noEmit
npm run lint
```
