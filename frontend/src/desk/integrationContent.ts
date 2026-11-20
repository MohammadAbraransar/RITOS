// Reference content for the Developer Integrations console: endpoints, auth methods, events and code samples.
// Everything here documents existing backend routes (backend/app/api.py, shopflow.py, outbox.py); nothing is invented.
import type { CodeSample } from './CodeBlock'

export type Endpoint = { method: 'GET' | 'POST'; url: string; purpose: string }

export const storeInbound = (apiRoot: string): Endpoint => ({
  method: 'POST', url: `${apiRoot}/api/v1/webhook/refund-tickets`, purpose: 'ShopFlow sends refund events here',
})

export const storeOutbound = (shopUrl: string): Endpoint[] => [
  { method: 'GET', url: `${shopUrl}/api/ritos/refund-tickets/{ticket_id}/context`, purpose: 'RITOS reads the claim: order, payment, policy, delivery, photos' },
  { method: 'POST', url: `${shopUrl}/api/ritos/refund-decision`, purpose: 'RITOS sends approve / reject; the store pays approved refunds' },
  { method: 'POST', url: `${shopUrl}/api/ritos/refund-tickets/{ticket_id}/status`, purpose: 'RITOS marks a claim as being reviewed by a person' },
  { method: 'POST', url: `${shopUrl}/api/ritos/notifications`, purpose: 'Customer messages shown on the store order' },
]

export const claimsApi = (apiRoot: string): Endpoint => ({
  method: 'POST', url: `${apiRoot}/api/v1/integrations/ecommerce/ticket`, purpose: 'Create a refund claim; RITOS routes it and returns the desk and decision',
})

// Events the store webhook accepts (shopflow.handle_event)
export const STORE_EVENTS: [string, string][] = [
  ['refund.ticket.created', 'A new claim: RITOS reads it from the store and runs every check'],
  ['refund.evidence.added', 'The customer added photos: RITOS checks the claim again'],
  ['refund.execution.completed', 'The store paid the refund: the claim is marked refunded'],
  ['refund.execution.failed', 'The store could not pay: the claim needs a person'],
  ['refund.human.decided', 'Someone decided in the store admin: RITOS records it'],
]

export type AuthMethod = { name: string; usedBy: string; header: string; credential: 'jwt' | 'store_api_key' | 'ecommerce_secret' | 'gateway_webhook_secret' }
export const AUTH_METHODS: AuthMethod[] = [
  { name: 'Staff sign-in', usedBy: 'The RITOS desk and staff scripts', header: 'Authorization: Bearer <token from POST /api/v1/auth/login>', credential: 'jwt' },
  { name: 'Store API key', usedBy: 'ShopFlow → store webhook; RITOS → ShopFlow calls', header: 'Authorization: Bearer <RITOS_API_KEY>', credential: 'store_api_key' },
  { name: 'Claims API secret', usedBy: 'Other stores → claims API', header: 'X-Ecommerce-Secret: <ECOMMERCE_WEBHOOK_SECRET>', credential: 'ecommerce_secret' },
  { name: 'Payment webhook signature', usedBy: 'Payment provider → /api/v1/finance/webhooks/{provider}', header: 'X-Gateway-Signature: sha256=<HMAC of the body>', credential: 'gateway_webhook_secret' },
]

export const CLAIM_FIELDS: [string, string, string][] = [
  ['customer_email', 'Yes', 'Must match a customer account in RITOS'],
  ['transaction_id, order_id', 'Yes', "The store's payment and order references"],
  ['claimed_amount', 'Yes', 'Amount to refund; never more than what is left of the payment'],
  ['description', 'Yes', "The customer's own words (5 characters or more)"],
  ['item_name, item_category', 'Recommended', 'The category decides the return policy'],
  ['purchase_date', 'Recommended', 'ISO date; starts the return window'],
  ['transaction_amount, payment_status', 'New payments only', 'Registers a payment RITOS has not seen before'],
]

export const storeEventSamples = (apiRoot: string): CodeSample[] => [
  { label: 'cURL', language: 'bash', code:
`curl -X POST '${apiRoot}/api/v1/webhook/refund-tickets' \\
  -H 'Content-Type: application/json' \\
  -H "Authorization: Bearer $RITOS_API_KEY" \\
  -d '{
    "event_id": "EVT-1042",
    "event_type": "refund.ticket.created",
    "ticket_id": "RIT-2026-000101",
    "status": "PENDING_RITOS"
  }'` },
  { label: 'Payload', language: 'json', code:
`{
  "event_id": "EVT-1042",
  "event_type": "refund.ticket.created",
  "ticket_id": "RIT-2026-000101",
  "status": "PENDING_RITOS"
}` },
]

export const STORE_EVENT_RESPONSE: CodeSample[] = [{ label: '200 OK (trimmed)', language: 'json', code:
`{
  "status": "SUCCESS",
  "message": "Event processed by RITOS orchestrator",
  "data": {
    "ticket_id": "RIT-2026-000101",
    "ritos_ticket_number": "RIT-2026-000101",
    "assigned_desk": "CS_1",
    "decision_bucket": "GENUINE_REFUNDABLE",
    "next_action": "AUTO_APPROVE",
    "decision": "APPROVED",
    "refund_amount_minor": 299900
  }
}` }]

export const claimSamples = (url: string): CodeSample[] => [
  { label: 'Node.js', language: 'javascript', code:
`// Your store's backend: send a refund claim to RITOS
const response = await fetch('${url}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Ecommerce-Secret': process.env.RITOS_ECOMMERCE_SECRET,
  },
  body: JSON.stringify({
    order_id: order.id,
    transaction_id: order.paymentReference,
    customer_email: customer.email,
    customer_name: customer.name,
    item_name: item.title,
    item_category: item.category,
    claimed_amount: item.price,
    purchase_date: order.createdAt,
    description: refundRequest.reason,
    // Only for payments RITOS has not seen before:
    transaction_amount: order.paidAmount,
    payment_status: order.paymentStatus,
  }),
});

const claim = await response.json();
console.log(claim.ticket_number, claim.assigned_desk);` },
  { label: 'Python', language: 'python', code:
`# Your store's backend: send a refund claim to RITOS
import os
import requests

response = requests.post(
    "${url}",
    headers={"X-Ecommerce-Secret": os.environ["RITOS_ECOMMERCE_SECRET"]},
    json={
        "order_id": order.id,
        "transaction_id": order.payment_reference,
        "customer_email": customer.email,
        "customer_name": customer.name,
        "item_name": item.title,
        "item_category": item.category,
        "claimed_amount": float(item.price),
        "purchase_date": order.created_at.isoformat(),
        "description": refund_request.reason,
        # Only for payments RITOS has not seen before:
        "transaction_amount": float(order.paid_amount),
        "payment_status": order.payment_status,
    },
    timeout=30,
)
response.raise_for_status()
claim = response.json()
print(claim["ticket_number"], claim["assigned_desk"])` },
  { label: 'cURL', language: 'bash', code:
`curl -X POST '${url}' \\
  -H 'Content-Type: application/json' \\
  -H "X-Ecommerce-Secret: $RITOS_ECOMMERCE_SECRET" \\
  -d '{
    "order_id": "ORD-1042",
    "transaction_id": "TXN-1042",
    "customer_email": "customer@example.com",
    "item_name": "Nimbus Wireless Headphones",
    "item_category": "AUDIO",
    "claimed_amount": 2999,
    "description": "Left ear cup stopped working after a week."
  }'` },
]

export const CLAIM_RESPONSE: CodeSample[] = [{ label: '200 OK', language: 'json', code:
`{
  "status": "INGESTED_AND_TRIAGED",
  "ticket_id": "6f1c2a7e-0b9d-4c55-9a8e-2f3b1d4e5a60",
  "ticket_number": "RIT-ECOM-7609E3",
  "decision_bucket": "EXCEPTIONAL_PROOF_NEEDED",
  "assigned_desk": "CS_2",
  "policy_evaluation_reason": "Photo evidence is required for this claim type."
}` }]

// How MCP servers will plug into agent orchestration (planned; not implemented in this build)
export const MCP_FLOW: [string, string][] = [
  ['Register a server', 'An Administrator adds a remote MCP server (Streamable HTTP). Its URL is validated and its credentials are stored on the RITOS server, never in the browser.'],
  ['Discover tools and resources', 'RITOS lists what the server offers and shows each tool with its description and inputs. Nothing is usable yet.'],
  ['Grant tools to agents', 'Each RITOS agent gets an explicit allow-list. No agent sees a tool it was not granted, and new tools start disabled.'],
  ['Run tools under control', 'Calls go through RITOS, which checks the grant and the caller. Tools marked sensitive need a person to approve them, like payouts do today.'],
  ['Trace every call', 'Each call is recorded with the agent, the claim, inputs, result or error and duration, and appears in Activity & Logs.'],
]
export const MCP_CONFIG: [string, string][] = [
  ['Connection', 'Server URL, transport and timeouts; checked before it is saved'],
  ['Authentication', 'OAuth or an access token, kept server-side and shown only as set / not set'],
  ['Health', 'Reachability and the last successful call'],
  ['Availability', 'Enable or disable a server or a single tool without deleting it'],
]
