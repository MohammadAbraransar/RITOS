# RITOS — Implementation Roadmap & Execution Sequence

**Document Date:** 2026-10-12  
**Governing Documents:** `RITOS_Antigravity_CLI_Implementation_Playbook.md` & `docs/RITOS_BUILD_PROMPT.md`  
**Current Branch:** `port/layout`

---

## 1. Roadmap Milestones Overview

| Phase | Milestone | Priority | Status | Description |
|:---|:---|:---|:---|:---|
| **Phase 0** | Repository Audit & Baseline | P0 | **COMPLETED** | Verified Git tree, test baseline, and executed commands. |
| **Phase 1** | Foundation & Data Integrity | P0 | **COMPLETED** | Double-entry ledger models, foreign keys, constraints, Alembic migrations `0001` & `0002`. |
| **Phase 2** | Minimum E2E Adjudication | P0 | **COMPLETED** | Nine-agent pipeline, deterministic arbiter precedence, CS-1/CS-2/CS-3 routing. |
| **Phase 3** | Honesty Pass Completion | P0 | **COMPLETED** | Ownership enforcement on evidence upload, disk storage via SHA-256, no base64 in ticket JSON, four-eyes settlement with `Idempotency-Key`, dual-custody UI stages. |
| **Phase 4** | Real Semantic Vision | P1 | **IN PROGRESS** | OpenCLIP provider setup (`VISION_PROVIDER=clip`), threshold configs, uncalibrated score preservation. |
| **Phase 5** | Human Review Governance | P1 | **PLANNED** | Supervisor SLA escalation jobs, reviewer override audit logs, independent appeal assignment. |
| **Phase 6** | Reliability & Observability | P2 | **PLANNED** | End-to-end correlation ID propagation, outbox dead-letter queue manual retry, structured JSON logging. |
| **Phase 7** | Release Gates Verification | P0 | **ONGOING** | PostgreSQL concurrency tests, multi-session settlement lock verification, release sign-off report. |

---

## 2. Milestone Deep-Dive: Completed Honesty Pass (Item 4.1)

### Work Done & Verified:
1. **Four-Eyes Separation of Duties (`backend/app/finance.py`):**
   - Three distinct users enforced: Proposer ≠ Approver ≠ Executor.
   - Administrators are explicitly subject to four-eyes rules without exemption.
   - All tests in `backend/tests/test_production_integrity.py` pass.
2. **Idempotent Settlement Execution:**
   - Required `Idempotency-Key` header on `/api/v1/refunds/{id}/execute`.
   - Matching key + same payload replays stored result.
   - Matching key + conflicting payload returns HTTP 409 Conflict.
3. **Gateway Timeout & Reconciliation:**
   - Unhandled provider timeout transitions to `RECONCILIATION_REQUIRED`.
   - Blind re-execution is rejected with HTTP 409.
   - `/refunds/{id}/reconcile` queries provider and settles once.
4. **Secure Evidence Upload (`backend/app/api.py`):**
   - Customer ownership verified (`customer_id == user.id`); unauthorized access rejected.
   - Files saved via `evidence_store.save_evidence` under SHA-256 in private disk storage.
   - Corrupt/invalid files flagged with `lifecycle_status = REJECTED`.
   - No base64 data written into `Ticket.classification_evidence` JSON.
5. **Database Migrations:**
   - Revision `a53b14ae1135` (`0002_honesty_and_settlement`) applied to Supabase PostgreSQL.
   - `alembic check` verifies zero pending schema diffs.
6. **Frontend Cockpit Integration (`frontend/src/App.tsx` & `api.ts`):**
   - Added Stage 2 Execution Queue in Finance Approvals view.
   - `api.executeRefund` automatically includes `Idempotency-Key: exec-<refundId>`.
   - Displays real 9 specialist agents, honest uncalibrated visual confidence, and decision arbiter reason codes & reviewer checklist.

---

## 3. Next Milestone: Real Semantic Vision (Item 4.2)

### Objectives:
- Support local `open_clip_torch` model evaluation when `VISION_PROVIDER=clip` is set in `.env`.
- Compare customer defect images against store product reference images in `shopflow/public/images/products/*.jpg`.
- Record raw cosine similarity scores alongside configured threshold boundaries in `visual_analysis.raw_scores`.
- Never invent percentages or convert similarity scores into probabilistic certainty.
- When provider is unconfigured or unavailable, cleanly emit `inconclusive` or `processing_failed` and route to CS-2.

---

## 4. Next Milestone: Human Review Governance (Item 4.3)

### Objectives:
- Mandatory structured reason codes on reviewer overrides.
- Customer appeal workflow that records immutable dispute history and re-runs the adjudication pipeline.
- Automatic SLA monitoring: overdue reviews escalate to the supervisor queue (`lead@ritos.local`).
- Strict reviewer independence: the appeal reviewer cannot be the original adjudicating reviewer.
