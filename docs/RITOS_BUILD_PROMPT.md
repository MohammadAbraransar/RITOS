# RITOS — Build Prompt: Current State and Remaining Work

You are continuing work on **RITOS (Refund Intelligence & Triage Orchestration System)** in the repository
`https://github.com/MohammadAbraransar/RITOS.git`, branch **`port/layout`**. The governing specification is
`tanush.txt` (with `tanush1.txt`) in the repository root. Read it before changing anything.

This prompt tells you (1) the rules you must not break, (2) what is already built and verified, and
(3) exactly what remains, in priority order, with acceptance criteria.

---

## 1. Non-negotiable rules

1. **Never fake a result.** No hardcoded verdicts, invented confidence scores, invented IDs (invoice, AWB,
   serial), filename-based "verification", or customer text treated as proof. If something was not actually
   checked, report `inconclusive` / `not_assessable` / `NOT_CONFIGURED` and route to a human.
2. **Deterministic code owns money, dates, thresholds and routing.** Vision/AI output is a recorded assessment
   only. The decision arbiter (`backend/app/agents/decision_agent.py`) is the only place that routes a claim.
3. **No paid AI models.** Semantic vision uses the free local OpenCLIP provider (`VISION_PROVIDER=clip`) or none.
4. **Thresholds live in configuration** (`backend/app/config.py`, overridable from `.env`) or versioned database
   rows (`return_policies`), never as literals inside logic.
5. **Four-eyes:** proposer, approver and executor of a refund are three different users. No role is exempt.
6. **Never commit secrets.** `.env` files are git-ignored; `.env.example` files contain placeholders and
   `__GENERATE__` markers only. Customer evidence (`backend/evidence_store/`) is git-ignored.
7. **Tests must test real behaviour.** A test that passes because the code returns a fixed answer is a defect.
   Synthetic images are allowed only as clearly labelled test data; vision verdicts in tests come from an
   explicit test double.
8. **Do not edit files another agent is editing.** Work on `port/layout`, commit in small reviewed steps,
   never force-push, never rewrite history.

---

## 2. Environment and workflow

- **Run everything with pnpm from the repo root.** No `.bat` files.
  - `pnpm bootstrap` — Python venv, packages, `.env` files (secrets generated), migrations, demo data if empty
  - `pnpm dev` — split-pane terminal (mprocs): `links`, `api` :8000, `desk` :5173, `shop` :3000; Ctrl+C stops all
  - `pnpm db:migrate` — RITOS Alembic + ShopFlow Prisma migrations
  - `pnpm db:seed` — resets BOTH demo databases (store data + RITOS ticket history; users kept)
  - `pnpm stop` — frees ports
- **Database:** one Supabase project (region `ap-northeast-2`), two Postgres schemas:
  `ritos` (SQLAlchemy + Alembic, `backend/migrations/`) and `shopflow` (Prisma, `shopflow/prisma/migrations/`).
  RITOS uses the session pooler (5432) with `DB_SCHEMA=ritos`; ShopFlow uses the transaction pooler (6543,
  `pgbouncer=true&schema=shopflow`) plus `DIRECT_URL` (5432). Raw SQL in ShopFlow must be schema-qualified via
  `shopflow/src/server/db-schema.ts` (the transaction pooler does not keep `search_path`).
- **Tests:** `cd backend && ..\.venv\Scripts\python -m pytest -q` (SQLite temp DB via `tests/conftest.py`);
  `cd frontend && npm run build`; `cd shopflow && npx tsc --noEmit -p .`.

---

## 3. What is already built (verified)

### 3.1 Integration and orchestration (committed on `port/layout`)
- ShopFlow store → RITOS via the store's transactional outbox; RITOS fetches the claim context from the store
  (store is the source of truth), runs the workflow, and queues callbacks (STATUS / NOTIFICATION / DECISION)
  in its own outbox with ordered, retried delivery (`backend/app/outbox.py`).
- Idempotent webhook intake per `event_id` (`inbound_events`), concurrent duplicates answered as replays.
- RITOS returns 503 (store retries) when the store context is slow or missing; it never invents claim facts.
- Store ticket-number reuse after a store reset archives the old RITOS ticket instead of merging.
- Every run and step persisted (`workflow_runs`, `workflow_steps`); humans resume waiting runs.
- Supabase migrations: Alembic `0001_initial`; Prisma `0_init` + `1_ticket_sequence`.

### 3.2 Honesty pass and nine-agent pipeline (implemented in the working tree, not yet committed)
Pipeline order (`backend/app/agents/__init__.py`), each step persisted:

| Step | Agent | File | What it really does |
|---|---|---|---|
| 1 | Agent 1 Ledger ground truth | `agents/ledger_agent.py` | Transaction, customer, currency (`CURRENCY_MISMATCH`), balance **after pending reservations** (`INSUFFICIENT_REFUNDABLE_BALANCE`), duplicate claims |
| 2 | Agent 5 Logistics | `agents/logistics_agent.py` | Carrier record if present, else store order record **labelled as such**; carrier integration reported `NOT_CONFIGURED` |
| 3 | Agent 3 Claim intent | `agents/claim_reason_agent.py` | Store-selected reason first, text rules refine it; reports matched terms, no invented confidence; contradictions |
| 4 | Agent 7 Identity + defect | `proof_reader.py`, `vision.py`, `agents/product_identity_agent.py`, `agents/defect_verification_agent.py` | Magic bytes, size/pixel limits, SHA-256, quality gates (blur, exposure, blank, resolution), dHash duplicates; identity/defect verdicts **only** from the vision provider, compared with the store's real product photos |
| 5 | Agent 2 Policy | `agents/policy_agent.py` | Store policy snapshot or versioned `return_policies` row; reason codes `POLICY_WITHIN_WINDOW`, `POLICY_WINDOW_EXPIRED`, `POLICY_FINAL_SALE`, `POLICY_DATE_UNKNOWN`, `POLICY_DEFECT_UNVERIFIED`, `POLICY_DEFECT_EXCEPTION`, `POLICY_MISSING`; merchant defect exception only for a **verified** defect; no statutory rule assumed |
| 6 | Agent 4 Risk | `agents/risk_agent.py` | 30/90/365-day velocity, account age, amount vs configured limit; signals are review flags, not fraud |
| 7 | Agent 6 Arbiter | `agents/decision_agent.py` | Fixed precedence ledger → payment-issue reconciliation → policy → contradictions → evidence → risk/amount; `reason_codes`, `rule_version`, `required_evidence`, `reviewer_checklist`, `permitted_actions` |
| 8 | Agent 9 Review coordinator | `agents/review_agent.py` | Least-loaded reviewer of the right role, SLA due time from config |
| 9 | Agent 8 Communication | `agents/communication_agent.py` | States the true case stage; never says "refunded" before settlement; timeline only if `REFUND_SETTLEMENT_DAYS` is configured |

Routing outcomes: CS-1 `AUTO_APPROVE` only when every check passes; CS-2 for anything uncertain (with checklist);
CS-3 `AUTO_REJECT` only for authoritative ineligibility (duplicate, already refunded, expired window, final sale).
Payment disputes (refund not received, double charge, unauthorized) go to CS-2 for provider reconciliation.

Other pieces:
- `backend/app/evidence_store.py`: private storage under SHA-256, lifecycle `UPLOADED → VALIDATED →
  DEFECT_CHECKED → ADJUDICATED` (+ `REJECTED`, `AWAITING_CUSTOMER`, `AWAITING_REVIEW`, `PROCESSING_FAILED`),
  near-duplicate detection across claims. Store photo bytes are downloaded at intake (`shopflow.fetch_store_evidence`).
- Decision trace on every run (`decision_trace` in the orchestrator result): transaction facts, policy id/version,
  identity and defect status, vision model version, risk, routing rule version, outcome.
- `backend/app/finance.py` rebuilt:
  - three-phase settlement (reserve + commit → gateway call with no locks → record), required `Idempotency-Key`
    with payload fingerprint, replay returns the stored result;
  - four-eyes enforced at execution (executor ≠ proposer ≠ approver, no admin exemption);
  - `UNKNOWN` gateway outcome → `RECONCILIATION_REQUIRED`, no blind retry; `reconcile_settlement` asks the provider;
  - HMAC-SHA256 webhooks (`GATEWAY_WEBHOOK_SECRET`; no secret = reject all), replay protection via `inbound_events`;
  - SANDBOX adapter labelled SANDBOX everywhere; Stripe/Razorpay report `NOT_CONFIGURED` / `NOT_IMPLEMENTED`;
  - balanced-journal invariant checked against persisted entries.
- API: `/refunds` and the desk payout buttons (`authorize-payout`, `cs1/.../direct-refund`, `cs1/.../manual-decide`)
  **propose** a refund; money moves only via `/refunds/{id}/approve` (different user) and `/refunds/{id}/execute`
  (third user). New `/refunds/{id}/reconcile`, `/finance/webhooks/{provider}`. Readiness reports real
  integration states (gateway, vision, carrier, legal rules), outbox failures and ledger balance.
- Config added (`backend/app/config.py`): vision thresholds, evidence dir, review SLA hours, settlement days,
  webhook secret.

**Test status:** 78 of 80 backend tests pass. The 2 failures are expected and are fixed by the pending finance
test update (item 4.1): the four-eyes error wording changed and readiness no longer has the fake `gateway_mode`.

---

## 4. What remains (do in this order)

### 4.1 Finish the honesty pass (~1.5–2 h)
1. Replace `test_separation_of_duties_approver_cannot_execute` and the readiness assertion with tests for: executor
   = approver / proposer / approving admin all refused; settlement posts one balanced journal and replays
   idempotently; `sandbox_timeout` → `RECONCILIATION_REQUIRED`, second execute refused, reconcile → `REFUNDED`;
   `sandbox_fail` → `FAILED` with nothing booked; execute without `Idempotency-Key` → 400; webhook bad signature
   → 401, valid → applied, replay → `DUPLICATE_IGNORED`, no secret → rejected; readiness reports
   `live_payments_enabled: false` and carrier `NOT_CONFIGURED`.
2. `/evidence/upload`: store bytes with `evidence_store.save_evidence`, enforce ownership (customers only their
   own tickets; staff any), reject invalid files as `REJECTED`, stop writing base64 into ticket JSON.
3. **Alembic migration `0002`** for the tables added after `0001` (ledger, settlement attempts, idempotency,
   products, variants, reference images, evidence files, return policies, carrier shipments). Verify with
   `alembic check` on SQLite and on Supabase.
4. Desk UI (`frontend/src/App.tsx`, `frontend/src/api.ts`): show `REFUND_PROPOSED` and the approve/execute steps,
   the nine agents, reason codes and reviewer checklist, `visual_confidence: null` as "not calibrated"; send
   `Idempotency-Key: exec-<refundId>` on execute.
5. Live end-to-end on Supabase with `pnpm dev`; then commit to `port/layout`.
   **Acceptance:** all backend tests pass, frontend builds, ShopFlow typechecks, live run shows change-of-mind →
   CS-1, defect without verified photo → CS-2 with checklist, expired window → CS-3, and a proposed refund
   settles only after approve + execute by different users.

### 4.2 Real vision (~1–2 h)
Install `open_clip_torch torch` in `.venv`, set `VISION_PROVIDER=clip`, verify identity against
`shopflow/public/images/products/*.jpg` and defect prompts per claim type. Record raw scores and thresholds;
never present them as probabilities. **Acceptance:** right product → identity `verified` or `inconclusive`;
a different product's photo → `mismatch` or `inconclusive`; provider unavailable → `processing_failed` → CS-2.

### 4.3 Human review governance (~3–4 h)
Reviewer overrides with mandatory reason codes; customer appeals and evidence resubmission that re-run the
workflow with immutable history; SLA escalation job (overdue review → supervisor queue); reviewer independence
(appeal reviewer ≠ original reviewer). **Acceptance:** tests for override audit trail, appeal re-run, SLA breach.

### 4.4 Reliability (~2–3 h)
Request correlation ID propagated API → workflow → outbox → journal; one error schema; rate limiting on public
and webhook routes; dead-letter view and manual retry for failed outbox messages; structured logs.

### 4.5 Dashboards (lean ~4–6 h, full ~10–16 h)
Lean: add a finance view (settlement queue, four-eyes approve/execute, journal viewer, reconciliation queue)
and a review queue (assigned reviewer, SLA, checklist) to the existing UI. Full: five role dashboards
(customer, support, supervisor, finance, admin) with server-side pagination, loading/error/empty states, and no
fabricated metrics.

### 4.6 Release gates and documentation (~3–4 h)
Concurrency tests on real Postgres (two settlements on one refund, two claims on one balance); migration
validation; security checks; deployment, backup/restore, secret-rotation and incident runbooks; final
evidence-based release report listing verified, blocked and pending items.

### 4.7 Blocked by external inputs (build adapters that report `unavailable`, list in the release report)
Live payment gateway (needs sandbox keys, e.g. Razorpay test mode), carrier tracking API (needs account),
calibrated vision confidence (needs labelled images), jurisdiction legal rules (needs a maintained source),
malware scanning (needs ClamAV).

**Estimated remaining effort:** 4.1 ≈ 2 h; 4.2–4.6 ≈ 14–20 h with lean dashboards or 20–30 h with full
dashboards. Independent tracks (vision, finance UI, review governance, reliability, dashboards) can run in
parallel if each owns separate files.

---

## 5. Definition of done (from tanush.txt)

RITOS accepts a real refund request, reconciles it against actual records, compares submitted evidence with the
purchased product and claimed defect, produces an explainable and reproducible routing decision, enforces human
and financial authorization, and executes or tracks a properly accounted refund without duplicate settlement.
Never claim production readiness, verified accuracy, or payment success without execution evidence.
