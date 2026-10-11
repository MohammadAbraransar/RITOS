# RITOS — Refund Intelligence & Ticket Orchestration System

A functional development implementation of an intelligent refund-ticket operations platform. It includes a React + TypeScript frontend, FastAPI backend, SQLAlchemy persistence, role-based authorization, ticket triage, duplicate checks, SLA-aware priority, mock refund approvals/execution, audit events, analytics, and Docker Compose for PostgreSQL/Redis.

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
Docker is optional for local development. For PostgreSQL + Redis:
```powershell
copy .env.example .env
docker compose up --build
```
Then seed from the backend container:
```powershell
docker compose exec api python -m app.seed
```
Services: frontend `5173`, API `8000`, PostgreSQL `5432`, Redis `6379`. The current API can run against SQLite for the easiest local setup; set `DATABASE_URL` to the provided PostgreSQL URL to use PostgreSQL. Redis is provisioned for the next background-worker integration; core triage is currently run safely in the API process.

## What works in this build
- Password hashing, JWT authentication, role-aware frontend navigation, backend role checks.
- Customer ticket creation/listing with ownership checks.
- Staff ticket queue, filters, detail, comments/internal notes, assignment, escalation, status updates.
- Rule-based issue classification with confidence and explanations.
- Duplicate-ticket candidates based on transaction, customer, issue category and normalized text; no automatic closure from text similarity alone.
- Priority and queue routing with security-sensitive reports protected from AI downgrades.
- Synthetic transaction verification adapter with explicit provider-unavailable/unknown states.
- Refund request, finance approval/rejection, mock execution, stable idempotency key, persisted operation and audit event.
- Analytics from persisted records, audit log, health endpoint, OpenAPI docs.
- Responsive operations UI with dashboard, ticket queue, ticket creation, role selector/login and ticket detail actions.

## Deliberate limitations (do not mistake these for production readiness)
- Email verification, password reset delivery, MFA, production refresh-token rotation, malware scanning, signed provider webhooks, real payment integration, true durable Celery workflows, dead-letter processing, semantic embeddings/LLM copilot, and Playwright E2E coverage are not enabled in this first runnable implementation.
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

## Architecture
- `frontend/`: React, TypeScript, Vite, API client, role-aware workspace.
- `backend/app/api.py`: versioned endpoints.
- `backend/app/models.py`: persisted entities.
- `backend/app/services.py`: classification, priority, routing, duplicate checks, mock refunds.
- `backend/app/security.py`: password hashing and JWT.
- `backend/app/seed.py`: synthetic transactions and development users.
- `docker-compose.yml`: optional local infrastructure.

## Data and status integrity
Ticket classification, risk signals, eligibility, approval, and execution are separate concepts. The app never treats customer text as proof of payment. A refund is marked `REFUNDED` only after the mock provider confirms it. Provider uncertainty must be reconciled before retrying.
