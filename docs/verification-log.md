# RITOS — Verification Log & Evidence Register

**Document Date:** 2026-10-12  
**Target Repository:** `https://github.com/MohammadAbraransar/RITOS.git`  
**Current Branch:** `port/layout`

---

## 1. Test Suite Verification Summary

| Suite / Test File | Tests Run | Passed | Failed | Execution Time | Coverage Scope |
|:---|:---|:---|:---|:---|:---|
| `backend/tests/test_production_integrity.py` | 27 | 27 | 0 | ~14.0s | Double-entry invariants, four-eyes separation of duties, idempotency replay vs conflict, gateway timeout & reconciliation, webhook HMAC, evidence upload ownership & rejection, policy defect exceptions, readiness probes. |
| `backend/tests/test_workflow.py` | 31 | 31 | 0 | ~3.0s | End-to-end nine-agent pipeline execution, outbox message queuing, retry delivery, ticket state transitions. |
| `backend/tests/test_agents.py` | 18 | 18 | 0 | ~1.5s | Agent 1 through 9 individual component unit tests. |
| `backend/tests/test_services.py` | 12 | 12 | 0 | ~0.9s | Issue classification, priority calculations, refund key stability, 3-bucket desk evaluation. |
| **Total Backend Test Suite** | **88** | **88** | **0** | **19.50s** | **100% Pass Rate** |

---

## 2. Invariant Verification Evidence

### 2.1 Double-Entry Balance Invariant
- **Assertion:** Debits strictly equal Credits in integer minor units.
- **Result:** `test_double_entry_journal_is_perfectly_balanced` passed.
  - Debit: 249,900 minor units (`₹2,499.00`).
  - Credit: 249,900 minor units (`₹2,499.00`).
  - Reversal journals compensate accurately and mark original journal as `REVERSED`.

### 2.2 Four-Eyes Separation of Duties
- **Assertion:** Proposer ≠ Approver ≠ Executor.
- **Result:** `test_separation_of_duties_on_execution` tested with parameterized combinations:
  - Approver acting as Executor: Refused with HTTP 409 (`Separation of duties: Proposer, Approver, and Executor must be 3 different users`).
  - Proposer acting as Executor: Refused with HTTP 409.
  - Admin who approved acting as Executor: Refused with HTTP 409.

### 2.3 Idempotency Enforcement & Payload Fingerprinting
- **Assertion:** Replaying matching `Idempotency-Key` returns original cached result; changing payload with same key returns HTTP 409.
- **Result:** `test_idempotency_replay_vs_payload_conflict` passed.
- **Execution Key:** `/api/v1/refunds/{id}/execute` without `Idempotency-Key` returns HTTP 400.

### 2.4 Evidence Upload Security & Storage
- **Assertion:** Customers cannot upload evidence to other customers' tickets. Bad files are marked `REJECTED`. No base64 written to ticket JSON.
- **Result:** `test_evidence_upload_ownership_and_lifecycle` passed.
  - Valid PNG: decoded, stored under SHA-256 in private store, `lifecycle_status = VALIDATED`.
  - Non-image bytes: `lifecycle_status = REJECTED`.
  - Ticket JSON contains zero base64 payload strings.

---

## 3. Database Migration Status

- **Alembic Revisions:**
  - `0001_initial`
  - `a53b14ae1135` (`0002_honesty_and_settlement`)
- **Verification Command:** `alembic check`
- **Output:**
  ```text
  INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
  INFO  [alembic.runtime.migration] Will assume transactional DDL.
  No new upgrade operations detected.
  ```

---

## 4. Build & Static Analysis Checks

1. **Frontend Vite Build:**
   - Command: `npm run build` in `/frontend`
   - Output: `built in 4.34s` (zero errors).
2. **ShopFlow Typecheck:**
   - Command: `npx tsc --noEmit -p .` in `/shopflow`
   - Output: Clean exit code 0.
