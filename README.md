# RITOS — Refund Intelligence & Ticket Orchestration System

A white-first, professional development foundation for an automation-first refund-ticket operations platform. It includes a React + TypeScript operations workspace, FastAPI backend, SQLAlchemy persistence, role-based authorization, customer-raised ticket intake, an eight-specialist automation registry coordinated by a central orchestrator, conservative duplicate checks, mock refund approvals/execution, audit events, analytics, and Docker Compose for PostgreSQL/Redis/Celery.

> **Financial safety:** The included provider is a MOCK provider. No real money is moved. Real provider adapters require documented APIs, credentials, signed webhooks, and a security review. Demo data is synthetic.

## Quick start (Windows, no Docker required)

### 1. Backend
```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
copy .env.example .env
python -m app.seed
uvicorn app.main:app --reload --port 8000
```
Open API docs at http://127.0.0.1:8000/docs.

If `py -3.12` is unavailable, use `python -m venv .venv` with Python 3.11+.

### 2. Frontend (new terminal)
```powershell
cd frontend
npm install
copy .env.example .env
npm run dev
```
Open the URL printed by Vite (normally http://localhost:5173).

### Development demo users
The seeder reads `SEED_PASSWORD` from `backend/.env`; default is `ChangeMe123!` for local development only.
- `customer@ritos.local` — customer
- `agent@ritos.local` — support agent
- `refunds@ritos.local` — refund operations
- `risk@ritos.local` — risk analyst
- `lead@ritos.local` — supervisor
- `finance@ritos.local` — finance approver
- `admin@ritos.local` — administrator
- `audit@ritos.local` — auditor

Use the configured seed password. Never use these accounts in production.

## Docker Compose
Docker is optional for local development. For PostgreSQL + Redis + the optional Celery worker:
```powershell
copy .env.example .env
docker compose up --build
```
Then seed from the backend container:
```powershell
docker compose exec api python -m app.seed
```
Services: frontend `5173`, API `8000`, PostgreSQL `5432`, Redis `6379`, worker. The local SQLite path runs the initial ticket automation synchronously. The Celery worker entrypoint is provided for queued processing when Redis is available; scheduled SLA policies, durable retries/dead-letter handling and automatic queue dispatch require further integration and deployment tests.

## Deployment

See `docs/DEPLOYMENT.md` for Vercel + Render setup. `render.yaml`, `frontend/vercel.json`, and `.github/workflows/verify.yml` are included. These files prepare a staging deployment; they do not establish a live deployment or real-payment readiness.

## Ecommerce website integration

See `docs/ECOMMERCE_INTEGRATION.md` for the server-to-server ticket intake endpoint and payload. Configure `ECOMMERCE_WEBHOOK_SECRET` in both backend environments; never put it in frontend JavaScript. Tickets are accepted only for a mapped RITOS customer and a transaction already present in the trusted transaction source.

## What works in this build
- Password hashing, JWT authentication, role-aware frontend navigation, backend role checks.
- Customer ticket creation/listing with ownership checks.
- Staff ticket queue, filters, detail, comments/internal notes, assignment, escalation, status updates.
- Rule-based issue classification with confidence and explanations.
- Ticket submission runs a persisted central automation pipeline: transaction verification, classification, duplicate-candidate check, risk indicators, conservative eligibility-candidate assessment, priority and routing.
- Automation API endpoints: `GET /api/v1/automation/agents`, `GET /api/v1/automation/summary`, and `POST /api/v1/automation/tickets/{ticket_id}/run`.
- Operations UI includes an Agent Orchestration view backed by API-derived automation counts.
- Optional Celery worker entrypoint at `app.worker`; worker service is defined in Docker Compose.
- Duplicate-ticket candidates include exact customer + transaction-ID linkage even when the reported issue category differs; no automatic closure from a duplicate flag alone.
- Priority and queue routing with security-sensitive reports protected from AI downgrades.
- Synthetic transaction verification adapter with explicit provider-unavailable/unknown states.
- Refund request, finance approval/rejection, mock execution, stable idempotency key, persisted operation and audit event.
- Analytics from persisted records, audit log, health endpoint, OpenAPI docs.
- Responsive operations UI with dashboard, ticket queue, ticket creation, role selector/login and ticket detail actions.

## Deliberate limitations (do not mistake these for production readiness)
- Email verification, password reset delivery, MFA, production refresh-token rotation/revocation, malware scanning, signed provider webhooks, real payment integration, full durable Celery orchestration, scheduled SLA enforcement, dead-letter processing, semantic embeddings/LLM copilot, notification delivery, and Playwright E2E coverage are not production-ready in this development implementation.
- The local mock transaction/provider data is synthetic and must never be used to make real financial decisions.
- `execute` is only available for approved refunds and only calls the mock provider. It is not a real payment integration.
- RBAC is a starter matrix; before production, add a formal permissions registry, organization/tenant isolation, CSRF strategy appropriate to deployment, secret management, security testing, backups, monitoring, and independent review.

## Useful commands
```powershell
# Backend tests
cd backend
pytest -q

# Frontend
cd frontend
npm run dev
npm run build
```

## AI automation safety

The orchestration layer coordinates eight specialist components with a central orchestrator. Automation is deterministic-first: source-of-truth payment checks and versioned policy rules control eligibility; classifier confidence and risk flags are advisory; duplicate tickets and duplicate payment/refund records are distinct concepts; exceptions require human review; refund approval and execution are separate roles/actions. The current intelligence is rules-based with explicit evidence fields, not a claim of a trained or autonomous LLM system. See `docs/AI_AUTOMATION.md`.

## Architecture
- `frontend/`: React, TypeScript, Vite, API client, role-aware workspace.
- `backend/app/api.py`: versioned endpoints.
- `backend/app/models.py`: persisted entities.
- `backend/app/services.py`: classification, priority, routing, duplicate checks, mock refunds.
- `backend/app/agents.py`: eight specialist definitions and central deterministic-first ticket orchestrator.
- `backend/app/worker.py`: optional Celery worker tasks.
- `backend/app/security.py`: password hashing and JWT.
- `backend/app/seed.py`: synthetic transactions and development users.
- `docker-compose.yml`: optional local infrastructure.

## Verification status

Run `scripts/verify-release.ps1` on Windows or `scripts/verify-release.sh` on macOS/Linux to execute the local verification sequence. See `RELEASE_VERIFICATION.md` for evidence-backed verification status and known release blockers. The packaging environment could run the backend unit suite, but frontend dependency installation timed out; therefore a frontend production build and browser E2E run are not certified by this release artifact. Do not claim production payment readiness until all stated blockers are closed.

## Data and status integrity
Ticket classification, risk signals, eligibility, approval, and execution are separate concepts. The app never treats customer text as proof of payment. A refund is marked `REFUNDED` only after the mock provider confirms it. Provider uncertainty must be reconciled before retrying.
