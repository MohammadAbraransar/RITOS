# RITOS — Engineering Audit & Architecture Baseline

**Document Date:** 2026-10-12  
**Target Repository:** `https://github.com/MohammadAbraransar/RITOS.git`  
**Current Branch:** `port/layout`  
**Commit State:** Working tree with honesty pass extensions  
**System:** RITOS (Refund Intelligence & Triage Orchestration System)

---

## 1. Executive Summary

This engineering audit assesses the current state of RITOS in accordance with the **RITOS Antigravity CLI Implementation Playbook** and **`docs/RITOS_BUILD_PROMPT.md`** (the work initiated by Claude). 

Strict non-negotiable rules are enforced across all layers:
- **No Hardcoding:** Zero synthetic verdicts, zero invented confidence scores, zero hardcoded IDs, and no mock strings standing in for real checks. When external services or providers are unavailable or unconfigured, the system explicitly reports `NOT_CONFIGURED` / `inconclusive` and routes to human review.
- **Deterministic Authority:** Financial movements, return window dates, currency validation, balance calculations, and final desk routing are owned strictly by deterministic code, never by LLMs or heuristics.
- **Four-Eyes Separation of Duties:** Payout requests require three distinct users (Requester / Proposer ≠ Approver ≠ Executor). Administrators are strictly subject to this constraint.
- **Balanced Double-Entry Bookkeeping:** All money movements are tracked in immutable minor integer currency units with debits equal to credits.

---

## 2. Existing Stack & Repository Structure

### 2.1 Backend (`/backend`)
- **Framework:** FastAPI with Pydantic v2 schemas and request validation.
- **Database Layer:** SQLAlchemy 2.0 ORM with PostgreSQL (Supabase `ritos` schema) and temporary SQLite for unit testing.
- **Migrations:** Alembic configured for schema-isolated multi-tenant operations (`DB_SCHEMA=ritos`).
- **Pipeline:** 9 specialist adjudication agents running sequentially under `Central Workflow Orchestrator`.
- **Integrations:** ShopFlow store outbox/webhook integration, SANDBOX payment gateway adapter, Pillow image inspection.

### 2.2 Frontend (`/frontend`)
- **Framework:** React 18 + TypeScript + Vite.
- **State Management & UI:** Single-page enterprise cockpit with dark/navy aesthetic, role-based navigation tabs (CS-1, CS-2, CS-3, Finance Approver, Supervisor, Administrator, Customer Portal).
- **Communication:** Clean REST client (`frontend/src/api.ts`) connecting to `/api/v1`.

### 2.3 Store Integration (`/shopflow`)
- **Framework:** Next.js 14 App Router + TypeScript + Tailwind CSS.
- **Database:** Prisma ORM connected to PostgreSQL Supabase (`shopflow` schema) via transaction pooler.
- **Outbox Engine:** Transactional outbox sending refund intake events to RITOS and receiving status/decision callbacks.

---

## 3. Nine-Specialist Agent Pipeline Analysis

The pipeline enforces data dependencies where each specialist produces a persisted `WorkflowStep`:

| Step | Agent ID | Component | Operational Mode | Authority & Guardrails |
|:---|:---|:---|:---|:---|
| 1 | `ledger_ground_truth` | Agent 1 | Deterministic SQL | Verifies transaction existence, currency match, customer ownership, and available balance after pending reservations. Detects duplicate claims. Ledger is authoritative; customer claims are never treated as proof. |
| 2 | `logistics_verification` | Agent 5 | Carrier Adapter | Inspects carrier milestones. Distinguishes carrier-confirmed data from merchant records. Reports `NOT_CONFIGURED` when live carrier API is missing. |
| 3 | `claim_analysis` | Agent 3 | Taxonomy Rules | Maps customer text to controlled categories; checks for factual contradictions (e.g. signed delivery vs claimed non-receipt). No synthetic confidence percentages. |
| 4 | `evidence_verification` | Agent 7 | Pillow / OpenCLIP | Magic bytes check, image quality gates (blur, exposure, blankness), difference hash duplicate detection, product identity (7A) and defect (7B) verification. Uncalibrated scores; no synthetic certainty. |
| 5 | `policy_enforcement` | Agent 2 | Versioned Rules | Applies category return windows (Electronics: 7d, Apparel: 14d, Perishable: 0d) and merchant defect exceptions against versioned policy records. Exceptions require a verified defect. |
| 6 | `risk_assessment` | Agent 4 | Velocity Engine | Calculates 30/90/365-day claim velocity, account age, and high-value thresholds. Signals are human review flags, not proof of fraud. |
| 7 | `decision_arbiter` | Agent 6 | Deterministic FSM | Sole routing authority. Evaluates strict precedence: Ledger -> Policy -> Contradictions -> Evidence -> Risk/Amount. Routes to CS-1 (Auto-Approve), CS-2 (Human Review/Proof), or CS-3 (Denial). |
| 8 | `review_coordination` | Agent 9 | Least-Loaded SLA | Assigns least-loaded reviewer of the required role, sets SLA due time, compiles required evidence checklist and permitted actions. |
| 9 | `customer_communication`| Agent 8 | State Templates | Drafts customer message reflecting true case stage. Never promises payout prior to financial settlement. |

---

## 4. Current Baseline Command Results

All verification commands executed directly in the project environment:

1. **Backend Tests (`pytest backend/tests -q`):**
   - **Result:** `88 passed, 17 warnings in 19.50s` (100% pass rate).
   - **Coverage:** Double-entry journal balance invariants, four-eyes separation of duties, gateway timeout reconciliation, webhook HMAC verification & replay protection, evidence quality & upload ownership, policy defect exceptions, readiness probes, deterministic arbiter precedence.

2. **Database Migrations (`alembic check`):**
   - **Result:** `No new upgrade operations detected` on Supabase PostgreSQL.
   - **Revisions:** `0001_initial` and `0002_honesty_and_settlement` (`a53b14ae1135`) successfully applied to `ritos` schema.

3. **Frontend Build (`npm run build` in `frontend`):**
   - **Result:** Built in 4.34s without errors (`tsc -b && vite build`).

4. **ShopFlow Typecheck (`npx tsc --noEmit -p .` in `shopflow`):**
   - **Result:** Completed with exit code 0; clean type safety.

---

## 5. Security & Operational Boundary Gaps

1. **Live Payment Gateway Keys:** Currently running in verified `SANDBOX` mode with explicit failure and timeout reconciliation. Live Razorpay/Stripe keys require external merchant credentials.
2. **Carrier Logistics Provider:** Live carrier tracking (FedEx/Delhivery/Bluedart) reports `NOT_CONFIGURED` because live carrier credentials are not configured in `.env`.
3. **Malware Scanning:** File uploads are validated via magic bytes, decompression bomb limits, and size checks; ClamAV daemon is currently not running locally.
