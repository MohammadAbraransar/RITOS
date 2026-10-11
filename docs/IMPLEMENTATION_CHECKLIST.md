# RITOS Implementation & Verification Checklist

## Local development (Windows, no Docker)
1. Install Python 3.11+ and Node.js 20+.
2. Backend: `cd backend`; `py -m venv .venv`; `.\.venv\Scripts\Activate.ps1`; `pip install -r requirements.txt`; copy `.env.example` to `.env`; `python -m app.seed`; `python -m pytest -q`; `uvicorn app.main:app --reload --port 8000`.
3. Frontend in another terminal: `cd frontend`; `npm install`; copy `.env.example` to `.env`; `npm run build`; `npm run dev`.
4. Visit `http://localhost:5173`; API docs at `http://localhost:8000/docs`.
5. Development users and default password are listed in README. Override `SEED_PASSWORD` before seeding. Never reuse development credentials in production.

## Docker environment
1. Copy root `.env.example` to `.env` and replace all local secrets.
2. `docker compose up --build`.
3. Seed with `docker compose exec api python -m app.seed`.
4. Inspect API docs and health; inspect worker logs using `docker compose logs -f worker`.

## Acceptance gates before production
- [ ] Frontend strict TypeScript build and lint pass in a clean environment.
- [ ] API tests for all eight roles, ownership boundaries, approval controls, expired/revoked sessions.
- [ ] Concurrent refund tests prove one provider operation per idempotency key.
- [ ] Provider timeout test reconciles original operation before any retry.
- [ ] Signed webhook verification and duplicate-event handling.
- [ ] Database migration path tested against clean PostgreSQL.
- [ ] Worker dispatch, retry limits, dead-letter/recovery and scheduled SLA jobs exercised.
- [ ] Notifications have provider delivery states, retry handling and safe templates.
- [ ] Playwright workflows pass for customer, exception review, risk, finance, admin and auditor.
- [ ] Secret management, HTTPS, CORS, rate limiting, session revocation, tenant isolation and attachment scanning reviewed.
- [ ] Backup/restore, retention, incident response and monitoring verified.
- [ ] Real payment provider credentials and test-mode contract verified before any production execution.

## Safety boundary
This repository uses synthetic transactions and a mock payment provider. It does not transfer real funds. Real provider integration and production authorization require a separate implementation and review.
