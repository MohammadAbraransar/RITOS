# RITOS — Evidence-Based Release Verification Report

**Release Candidate:** RITOS Production Candidate 2.0.0 (Honesty & Financial Integrity Pass)  
**Governing Directives:** `tanush1.txt` (Final Production Engineering Directive), `tanush.txt`, `RITOS_BUILD_PROMPT.md`  
**Target Repository:** `https://github.com/MohammadAbraransar/RITOS.git`  
**Primary Branch:** `port/layout`  
**Execution Timestamp:** 2026-10-12  

---

## 1. Verified Checks in this Environment

All results below are derived from commands actually executed in this working tree:

| Verification Gate | Result | Command & Concrete Execution Evidence |
|:---|:---|:---|
| **Backend Test Suite** | **PASS (88/88)** | `python -m pytest backend/tests -q` $\rightarrow$ **88 passed**, 17 warnings in 8.43s (100% pass rate). |
| **Financial Integrity & Four-Eyes** | **PASS** | Parameterized test `test_separation_of_duties_on_execution`: Approver executing, Proposer executing, and Admin executing are all refused with HTTP 409. |
| **Double-Entry Ledger Invariants** | **PASS** | `test_double_entry_journal_is_perfectly_balanced`: Debit sum equals Credit sum in minor units (249,900 minor units). Reversal journals compensate accurately. |
| **Idempotency & Replay Protection** | **PASS** | `test_idempotency_replay_vs_payload_conflict`: Identical key + payload replays stored result; differing payload raises HTTP 409 Conflict. Mandatory key required on `/execute`. |
| **Gateway Timeout & Reconciliation** | **PASS** | `test_gateway_timeout_requires_reconciliation_before_anything_else`: Simulated timeout transitions to `RECONCILIATION_REQUIRED`; blind second payout refused (HTTP 409); `/reconcile` settles safely. |
| **Evidence Lifecycle & Ownership** | **PASS** | `test_evidence_upload_ownership_and_lifecycle`: Customer ownership verified; raw bytes saved under SHA-256 on disk; invalid bytes marked `REJECTED`; zero base64 stored in ticket JSON. |
| **Database Migrations** | **PASS** | `alembic check` $\rightarrow$ `No new upgrade operations detected` on Supabase PostgreSQL (`DB_SCHEMA=ritos`). Head revision: `a53b14ae1135`. |
| **Frontend Production Build** | **PASS** | `npm run build` in `/frontend` $\rightarrow$ `tsc -b && vite build` built cleanly in 4.34s with zero compilation errors. |
| **ShopFlow Store Typecheck** | **PASS** | `npx tsc --noEmit -p .` in `/shopflow` $\rightarrow$ clean exit code 0. |
| **Deterministic Arbiter Precedence** | **PASS** | `test_decision_arbiter_routing_precedence`: 14 parameterized boundary cases verify fixed precedence (Ledger $\rightarrow$ Payment Disputes $\rightarrow$ Policy $\rightarrow$ Contradictions $\rightarrow$ Evidence $\rightarrow$ Risk/Amount). |

---

## 2. Integration Status Register (Zero Simulation Rule)

Per `tanush1.txt` Directive 6 ("Never simulate a production success"):

| External Integration | Operational Status | Reality & Fallback Behavior |
|:---|:---|:---|
| **Payment Gateway: SANDBOX** | **IMPLEMENTED** | Fully functional local sandbox adapter exercising reserve, commit, timeout recovery, and webhooks. Clearly labeled `SANDBOX` in UI and API. |
| **Payment Gateway: Live Providers** | **NOT_CONFIGURED** | Stripe and Razorpay adapters explicitly return `NOT_CONFIGURED` / `NOT_IMPLEMENTED`. The system never reports fake successful live payouts. |
| **Computer Vision Engine** | **CONFIGURED (LOCAL)** | Quality gates (blur, exposure, blankness, magic bytes) and difference hash near-duplicate detection active. Semantic comparison uses local OpenCLIP or cleanly reports `inconclusive` without invented confidence. |
| **Carrier Logistics API** | **NOT_CONFIGURED** | Live tracking API is absent; Agent 5 explicitly reports `NOT_CONFIGURED` and uses merchant fulfillment records labeled as merchant data. |
| **Malware Scanning** | **UNAVAILABLE** | File magic-byte checks and image decompression bomb guards are enforced; dedicated ClamAV daemon is currently not running in this environment. |

---

## 3. Financial Safety Policy & Operational Guarantees

1. **No Unverified Disbursements:** Customer statements, AI classifications, and risk scores **never** authorize money movement. A refund can only be proposed when the ledger confirms a successful transaction and sufficient available balance.
2. **Four-Eyes Separation of Duties:**
   $$\text{Requester} \neq \text{Finance Approver} \neq \text{Settlement Executor}$$
   No single individual, including system administrators, can execute an end-to-end payout unilaterally.
3. **Immutable Double-Entry Books:** Every settled refund creates immutable journal entries. If a payout is revoked or disputed, a compensating reversal journal is posted; original entries are never deleted or modified.
4. **Idempotent Execution:** Every payout execution requires an `Idempotency-Key` header with request payload fingerprinting to prevent double-spending under retries or network replays.

---

## 4. Deployment Instructions

### Prerequisites
- Node.js 18+ and pnpm
- Python 3.11+
- PostgreSQL database (Supabase or self-hosted)

### One-Command Setup
```bash
# 1. Bootstrap Python venv, Node dependencies, and database migrations
pnpm bootstrap

# 2. Start all services in split-pane environment (API: 8000, Desk: 5173, Shop: 3000)
pnpm dev
```

### Manual Individual Commands
```bash
# Backend API
cd backend
..\.venv\Scripts\python -m uvicorn app.main:app --port 8000 --reload

# Frontend Desk Cockpit
cd frontend
npm run dev

# ShopFlow E-Commerce Store
cd shopflow
npm run dev -- -p 3000
```

---

## 5. Prioritized List of Remaining Production Blockers

To promote this verified release candidate to live customer payment processing:

1. **Production Merchant Gateway Credentials:** Acquire and configure live Razorpay / Stripe merchant keys in `.env` (`LIVE_PAYMENTS_ENABLED=true` must remain `false` until keys and contracts are validated).
2. **Carrier Tracking Provider:** Integrate an active commercial tracking API (e.g., Delhivery, FedEx, Shiprocket) with live webhook ingestion.
3. **Antivirus Daemon:** Deploy a ClamAV daemon container for streaming file inspection during evidence upload.
4. **Calibrated Semantic Vision Benchmark:** Run evaluation benchmarks on historical merchant photo returns to calibrate confidence thresholds before enabling automated defect approvals.
