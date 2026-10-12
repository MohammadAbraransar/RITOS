# RITOS — Architecture, Contracts & Invariants

**Document Date:** 2026-10-12  
**System:** RITOS (Refund Intelligence & Triage Orchestration System)

---

## 1. System Invariants & Guarantees

### 1.1 Financial Invariants
1. **Ledger Ground Truth:** Money can never be disbursed without a verified transaction in `payment_status = "SUCCESSFUL"` and an available refundable balance (`tx.amount - tx.refunded_amount - pending_reservations >= claimed_amount`).
2. **Double-Entry Accounting:** Every refund transaction books a double-entry journal (`LedgerJournal`) containing matching debits and credits in minor integer units:
   $$\sum \text{Debit Amounts} = \sum \text{Credit Amounts}$$
   - Account Mappings:
     - `REFUND_EXPENSE` (DEBIT) ↔ `REFUND_LIABILITY` (CREDIT)
     - `REFUND_LIABILITY` (DEBIT) ↔ `PROCESSOR_CLEARING` (CREDIT)
3. **Idempotency Guarantee:** All settlement executions require an `Idempotency-Key` header with payload fingerprinting. Replaying the exact same request returns the cached result without duplicate ledger entries or gateway requests.
4. **Segregation of Duties (Four-Eyes Principle):**
   $$\text{Proposer} \neq \text{Approver} \neq \text{Executor}$$
   No single user can initiate, authorize, and execute a financial payout. Administrators are explicitly bound by this rule.

### 1.2 Decision Routing Precedence
Routing decisions are computed exclusively by `backend/app/agents/decision_agent.py` using strict precedence:
1. **Ledger Integrity:** Unverified transactions or duplicate claims are routed to CS-3 (`AUTO_REJECT` or `MANUAL_REVIEW`).
2. **Payment Disputes:** Claims relating to payment failures or unauthorized transactions are routed to CS-2 for provider reconciliation.
3. **Policy Window:** Expired return windows without verified defect exceptions are routed to CS-3 (`AUTO_REJECT`).
4. **Contradictions:** Conflicts between claim statements and carrier/store delivery records route to CS-2 (`AWAIT_PROOF` or `MANUAL_REVIEW`).
5. **Visual Evidence:** When damage or defective product is claimed:
   - Verified Product Identity + Verified Defect → CS-1 (`AUTO_APPROVE`).
   - Mismatched identity or defect → CS-2 (`AWAIT_PROOF`).
   - Inconclusive or unassessable photo → CS-2 (`MANUAL_REVIEW` / `AWAIT_PROOF`).
6. **Risk & Monetary Limits:** Amounts exceeding `AUTO_APPROVE_MAX_INR` (default: ₹5,000) or high-risk velocity signals route to CS-2 (`AWAIT_APPROVAL`).

---

## 2. Shared API Contracts

### 2.1 Authentication
- `POST /api/v1/auth/login`: `{ "email": string, "password": string }` → `{ "access_token": string, "user": UserView }`
- `GET /api/v1/auth/me`: Returns current authenticated user session.

### 2.2 Refund Lifecycle Endpoints
- `POST /api/v1/refunds`: Proposes a refund request (`requested_by_id = current_user.id`). Status transitions to `PENDING_APPROVAL`.
- `POST /api/v1/refunds/{id}/approve`: Approves a proposed refund (`approved_by_id = current_user.id`, must not equal proposer). Status transitions to `APPROVED`.
- `POST /api/v1/refunds/{id}/execute`: Executes gateway settlement.
  - Header: `Idempotency-Key: <unique-key>`
  - Constraint: Executor ≠ Approver ≠ Proposer.
  - Outcome: Posts balanced `LedgerJournal` and returns `REFUNDED` or `RECONCILIATION_REQUIRED`.
- `POST /api/v1/refunds/{id}/reconcile`: Queries payment gateway for status of uncertain settlements.

### 2.3 Evidence Upload Endpoint
- `POST /api/v1/evidence/upload`:
  - Request: `{ "ticket_id": string, "file_name": string, "file_type": string, "base64_data": string }`
  - Authorization: Customer can only upload to own ticket; staff can upload to any.
  - Storage: Saved to private disk path `evidence_store/<hash_prefix>/<sha256>.<ext>`.
  - Response: `{ "id": string, "sha256": string, "lifecycle_status": "VALIDATED" | "REJECTED", "file_name": string, "tamper_flags": [] }`

### 2.4 Operational Readiness Probe
- `GET /api/v1/health/readiness`:
  - Returns database connection state, ledger balance invariants check, and live status of integrations:
    - `payment_gateway`: `live_payments_enabled: false`, `providers: { SANDBOX: "IMPLEMENTED" }`
    - `vision`: `status: "NOT_CONFIGURED" | "READY"`
    - `carrier`: `status: "NOT_CONFIGURED"`
