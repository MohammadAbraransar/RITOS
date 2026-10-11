# RITOS Feature Status — Engineering Handoff

Status labels: **Implemented** = code exists and local test/build evidence is available; **Partial** = development implementation with explicit limitations; **Not production-ready** = requires provider credentials, security review, or operational deployment evidence.

| Area | Status | Notes |
|---|---|---|
| React/TypeScript operations UI | Partial | Existing dashboard and role-aware workspace; frontend dependency install/build must be verified in the target environment. |
| FastAPI versioned API and OpenAPI | Implemented | `/api/v1`; interactive docs at `/docs`. |
| Password hashing and access-token login | Partial | Password hashing and JWT access token; production refresh rotation/revocation, email verification, reset delivery and MFA are not complete. |
| Eight application roles | Partial | Customer, support, refund operations, risk, supervisor, finance approver, administrator, auditor. Fine-grained tenant/permission registry needs hardening. |
| Customer ticket creation and ownership checks | Implemented | Authenticated customer identity is used; transaction is checked against seeded/internal transaction data. |
| Transaction data fetching | Partial | Internal synthetic transaction adapter; real provider integration requires credentials and API docs. |
| Classification and priority | Implemented (rules baseline) | Explainable keyword/rule classifier; no claim of production ML accuracy. |
| Duplicate ticket matching | Partial | Conservative relationship matching; candidate link does not auto-close tickets. Semantic embedding evaluation is not complete. |
| Risk indicators | Partial | Signals only, not proof of fraud or an automatic denial. |
| Eligibility policy | Partial | Orchestrator identifies eligible candidates; full versioned configurable policy and jurisdiction-specific rules require configuration. |
| Refund approval and execution | Partial | Mock provider only, with stable idempotency key and approval checks. No real money is moved. |
| Reconciliation | Partial | Mock reconciliation endpoint; signed webhooks/provider event deduplication not implemented. |
| Central orchestrator + 8 specialist registry | Implemented (development baseline) | Eight specialist components declared; six analysis steps run in the ticket pipeline; refund execution and reconciliation run only in their authorized lifecycle endpoints. |
| Background worker | Partial | Celery worker entrypoint and Compose service included; queue dispatch/periodic SLA jobs and recovery policies still need integration and tests. |
| Automation observability | Partial | Persisted pipeline events and backend-derived summary endpoint. |
| Analytics and audit trail | Partial | Database-backed overview and audit log endpoints; retention/export controls need production policy. |
| Notifications | Not production-ready | Customer notification providers/templates and delivery status need implementation. |
| Upload safety | Not production-ready | Malware scanning and strict production attachment pipeline not enabled. |
| Test coverage | Partial | Backend unit tests exist; API authorization/concurrency/provider failure tests and Playwright end-to-end suite remain to be completed. |
| Docker Compose | Partial | PostgreSQL, Redis, API, worker and frontend services configured; deployment must be exercised in an environment with Docker. |
| Real provider / production deployment | Not production-ready | Requires provider credentials, signed webhook verification, secrets management, independent security review, monitoring, backups and deployment validation. |

## Verified in this work session
- Existing backend unit tests: `python -m pytest -q` passed before changes (4 tests).
- After changes, rerun `python -m pytest -q` and inspect output before release.
- Frontend `npm install` timed out in this environment; frontend build and browser E2E are therefore **not verified**.

Never interpret mock-provider completion or seeded synthetic transactions as real refunds or real customer data.


## Ecommerce intake update (2026-10-11)
- Added authenticated server-to-server `POST /api/v1/integrations/ecommerce/tickets`.
- Requires a configured `ECOMMERCE_WEBHOOK_SECRET`, an existing mapped customer, and a transaction already present in the trusted transaction source.
- Exact customer + transaction ID is now a duplicate linkage signal even when the reported issue category differs. The system flags/links the case; it does not automatically reject or close it.
- Added `docs/ECOMMERCE_INTEGRATION.md` with request payload and deployment requirements.
- Backend test suite currently passes 9 tests. Frontend production build is not verified in this environment because npm dependency installation timed out.
- Production blockers remain: actual provider adapter and webhook reconciliation, persistent inbound event idempotency/replay protection, notification delivery, policy administration UI/storage, production-grade session revocation/MFA, and browser end-to-end tests.
