# Staging deployment: Vercel + Render

This is a staging/demo deployment guide. It does not turn the mock payment provider into a real payment integration.

## 1. Push the project to GitHub

Commit the full `RITOS` directory, including `.github/workflows/verify.yml`, `render.yaml`, and `frontend/vercel.json`. Push to a private repository if it contains non-public project details. Confirm GitHub Actions succeeds before deploying.

## 2. Deploy the backend and PostgreSQL on Render

1. In Render, create a new Blueprint and select the repository containing `render.yaml`.
2. Review the generated `ritos-api` service and `ritos-db` database. Create them.
3. In the API service environment, set `CORS_ORIGINS` to the exact Vercel origin, for example `https://your-ritos-dashboard.vercel.app` (no path, comma-separated if needed).
4. Set `ECOMMERCE_WEBHOOK_SECRET` to a long random secret. Configure the same secret only in the ecommerce **backend** environment. Do not put it in any `VITE_` variable.
5. Set `SEED_PASSWORD` to a unique temporary strong password only if you intend to run the demo seeder. Do not use demo accounts for real users.
6. Check Render logs and `https://YOUR-RENDER-SERVICE.onrender.com/health`. It must report `database: reachable`.
7. Open `/docs` and verify the OpenAPI schema is reachable.

The application currently creates tables at startup. Do not connect this starter to an existing production database; reviewed Alembic migrations are a release blocker for production data.

## 3. Deploy the frontend on Vercel

1. Import the same repository into Vercel.
2. Set **Root Directory** to `frontend`.
3. Build command: `npm run build`. Output directory: `dist`.
4. Add environment variable `VITE_API_URL=https://YOUR-RENDER-SERVICE.onrender.com/api/v1` for Production and Preview environments as appropriate.
5. Deploy, then copy the actual Vercel origin into Render's `CORS_ORIGINS` and redeploy the backend.
6. Refresh the dashboard and verify login, `/auth/me`, ticket listing, and the browser network panel. Do not place server secrets in Vercel `VITE_*` variables.

## 4. Ecommerce server-to-server connection

After a refund ticket is persisted in the ecommerce backend, that backend should POST to:

`https://YOUR-RENDER-SERVICE.onrender.com/api/v1/integrations/ecommerce/tickets`

Headers: `Content-Type: application/json` and `X-RITOS-Webhook-Secret: <server-side secret>`.

Example body:

```json
{
  "customer_email": "customer@example.com",
  "transaction_id": "PAYMENT-12345",
  "order_id": "ORDER-12345",
  "claimed_amount": "1499.00",
  "currency": "INR",
  "description": "My cancelled order has not been refunded."
}
```

The customer and transaction must already exist in RITOS' trusted source. A successful HTTP response does not establish refund eligibility; inspect the automation result and ticket state. Add delivery-event idempotency/replay protection before relying on retries in production.

## 5. Smoke test checklist

- `/health` returns 200 and reports a reachable database.
- `/docs` loads.
- Login with a seeded development account works only if the seeder was intentionally run.
- A customer can create a ticket and only see their own tickets.
- Staff can triage and view private notes only through authorized endpoints.
- A duplicate transaction is flagged for review, not automatically rejected.
- A refund cannot be executed before approval.
- The mock provider is visibly identified as mock and is never treated as a real payment gateway.
- Browser console and Render logs contain no unhandled errors.
- Verify the exact production frontend origin is allowed by CORS.

Do not enable real refunds until provider sandbox, replay/idempotency, concurrency, reconciliation, audit, and independent security tests pass.
