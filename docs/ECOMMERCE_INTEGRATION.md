# Ecommerce-to-RITOS ticket integration

## Architecture

The browser must never call the shared-secret webhook directly. Your ecommerce **backend** should send a server-to-server POST to `POST /api/v1/integrations/ecommerce/tickets` after a customer submits a refund form. RITOS authenticates the shared secret, maps the customer by an existing active customer account, validates the payload, verifies the transaction against its own trusted transaction source, persists the ticket, and runs the automation pipeline.

## Configure

Set `ECOMMERCE_WEBHOOK_SECRET` to a long random secret in the RITOS backend environment and set the same secret in your ecommerce backend environment. Never commit it or expose it in `VITE_*` variables. Use HTTPS in deployed environments. Configure CORS separately for the dashboard frontend; CORS is not webhook authentication.

## Request example

```http
POST /api/v1/integrations/ecommerce/tickets
Content-Type: application/json
X-RITOS-Webhook-Secret: <server-side-secret>
```

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

The customer must already be provisioned/mapped in RITOS and the transaction ID must exist in RITOS' trusted transaction source. An ecommerce request cannot create trusted payment facts merely by claiming a payment succeeded. `202` means the request was accepted and processed by this synchronous intake pipeline; inspect the response for ticket ID and automation result.

## Important integration work before production

- Implement customer identity mapping/provisioning between the ecommerce backend and RITOS.
- Connect RITOS' transaction adapter to the authoritative payment/order provider; do not rely on demo SQLite transaction rows.
- Add webhook event IDs and a persisted idempotency table if the ecommerce platform retries delivery; the current endpoint is authenticated but does not yet persist a provider event ID for delivery deduplication.
- Add request signing/timestamp validation or mTLS, rate limiting, monitoring, secrets rotation, and replay protection.
- Set a real production database, TLS, backups, least-privilege secrets, and monitoring.

## Workflow and human control

1. Customer raises the ticket on ecommerce.
2. RITOS verifies the transaction, checks exact transaction-ID duplicate linkage, classifies, assesses risk, applies eligibility checks, and routes the case.
3. Missing evidence, mismatched transaction/customer/amount, suspicious reports, and possible duplicates are sent to human exception review; a duplicate flag does not automatically reject or close the ticket.
4. An authorized refund operator initiates a refund request; required approval rules remain separate.
5. The authorized operator executes only an approved refund. The current adapter is a mock and moves no real money.
6. Admin monitors automation and audit activity.
