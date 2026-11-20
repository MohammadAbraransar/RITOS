const API: string = import.meta.env.VITE_API_URL
if (!API) throw new Error('VITE_API_URL is not set (see frontend/.env.example)')
// API host without the /api/v1 prefix (webhook and integration URLs shown in the desk)
export const API_ROOT = API.replace(/\/api\/v1\/?$/, '')

export type PayoutAction = 'propose' | 'propose_supervised' | 'approve' | 'execute' | 'reconcile'
// Server-side policy (backend/app/permissions.py): what this user may do and which roles may do each step
export type Permissions = { payout: Record<PayoutAction, boolean>; payout_roles: Record<PayoutAction, string[]> }
export type User = { id:string; email:string; full_name:string; role:string; permissions?: Permissions }
export type NextStep = { action: PayoutAction; roles: string[]; excluded_user_ids: string[]; can_act: boolean } | null

export type Ticket = {
  id: string
  ticket_number: string
  customer_id: string
  transaction_id: string
  order_id?: string | null
  claimed_amount: number
  currency: string
  description: string
  category: string
  confidence: number
  priority: string
  queue: string
  status: string
  payment_verification: string
  refund_status: string
  duplicate_of_id?: string | null
  assigned_to_id?: string | null
  recommended_action: string
  classification_evidence: Record<string, any>
  decision_bucket?: string
  assigned_desk?: string
  customer_name?: string | null
  customer_phone?: string | null
  customer_email?: string | null
  item_name?: string | null
  item_category?: string | null
  purchase_date?: string | null
  customer_message_draft?: string | null
  policy_evaluation_reason?: string | null
  proof_required?: string | null
  proof_status?: string
  proof_request_sent_at?: string | null
  rejection_notice_sent_at?: string | null
  refund_decided_at?: string | null
  created_at: string
  updated_at: string
  comments?: { id: string; author_id: string; body: string; internal: boolean; created_at: string }[]
  // Customer view only (staff get the full record instead)
  customer_status?: CustomerClaimStatus
  reason?: string | null
  reason_label?: string | null
  details?: string | null
  product_sku?: string | null
}

// Customer portal (backend/app/purchases.py): every value here comes from the ledger order, never from the customer
export type EligibilityStatus = 'ELIGIBLE' | 'ITEM_PROBLEM_ONLY' | 'NEEDS_REVIEW' | 'NOT_REFUNDABLE' | 'EXPIRED'
  | 'REFUNDED' | 'ALREADY_CLAIMED' | 'UNAVAILABLE'
export type Purchase = {
  purchase_id: string | null
  transaction_id: string
  order_id: string
  currency: string
  purchased_at: string
  quantity: number | null
  amount: number
  product: { sku: string; name: string; category: string; brand: string | null; image_url: string | null } | null
  eligibility: {
    status: EligibilityStatus
    claimable: boolean
    message: string
    refundable_amount: number
    return_window_days: number | null
    days_elapsed: number | null
    window_ends_at: string | null
    existing_claim: { id: string; ticket_number: string } | null
    reason_code: string | null
  }
}
export type IntegrationsOverview = {
  shopflow: { connected: boolean; base_url: string }
  credentials: {
    store_api_key: { configured: boolean; development_default: boolean }
    ecommerce_secret: { configured: boolean }
    gateway_webhook_secret: { configured: boolean }
  }
  deliveries: { sent: number; pending: number; failed: number }
  inbound: { last_received_at: string | null; last_24h: number }
  payments: { provider: string; live: boolean }
  mcp: { supported: boolean; servers: number; reason: string }
}
export type InboundEventRow = { id: string; source: string; event_type: string; store_ticket: string | null; outcome: string | null; received_at: string | null }
export type McpStatus = { supported: boolean; servers: any[]; reason: string }

export type ClaimReason ={ code: string; label: string; item_problem: boolean; details_required: boolean }
export type CustomerClaimStatus = {
  code: 'UNDER_REVIEW' | 'ACTION_NEEDED' | 'REFUND_IN_PROGRESS' | 'REFUNDED' | 'NOT_APPROVED' | 'CLOSED'
  label: string
  description: string
}

let token = localStorage.getItem('ritos_token') || ''
export function setToken(value: string) {
  token = value
  if (value) localStorage.setItem('ritos_token', value)
  else localStorage.removeItem('ritos_token')
}
export function getToken() {
  return token
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(`${API}${path}`, { ...options, headers })
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const data = await response.json()
      message = typeof data.detail === 'string' ? data.detail : message
    } catch {}
    throw new Error(message)
  }
  return response.status === 204 ? (undefined as T) : response.json()
}

export const api = {
  login: (email: string, password: string) =>
    request<{ access_token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),
  me: () => request<User>('/auth/me'),
  tickets: (params = '') => request<{ items: Ticket[]; total: number }>('/tickets' + params),
  ticket: (id: string) => request<Ticket>(`/tickets/${id}`),
  createTicket: (data: unknown) => request<Ticket>('/tickets', { method: 'POST', body: JSON.stringify(data) }),
  updateTicket: (id: string, data: unknown) => request<Ticket>(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  comment: (id: string, body: string, internal = false) =>
    request(`/tickets/${id}/comments`, { method: 'POST', body: JSON.stringify({ body, internal }) }),
  escalate: (id: string) => request<Ticket>(`/tickets/${id}/escalate`, { method: 'POST' }),
  analytics: () => request<any>('/analytics/overview'),
  refunds: () => request<any[]>('/refunds'),
  createRefund: (ticket_id: string, amount: number, reason: string) =>
    request<any>('/refunds', { method: 'POST', body: JSON.stringify({ ticket_id, amount, reason }) }),
  approveRefund: (id: string, reason: string) =>
    request<any>(`/refunds/${id}/approve`, { method: 'POST', body: JSON.stringify({ reason }) }),
  rejectRefund: (id: string, reason: string) =>
    request<any>(`/refunds/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  executeRefund: (id: string, idempotencyKey?: string) =>
    request<any>(`/refunds/${id}/execute`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey || `exec-${id}` }
    }),
  reconcileRefund: (id: string) =>
    request<any>(`/refunds/${id}/reconcile`, { method: 'POST' }),
  // Re-send a store message (e.g. an approval that did not reach the store); Administrator or Supervisor
  retryOutbox: (messageId: string) => request<any>(`/integrations/outbox/${messageId}/retry`, { method: 'POST' }),
  // Messages to the store (latest 200): Administrator, Supervisor, Auditor
  listOutbox: () => request<any[]>('/integrations/outbox'),
  // Deliver due messages now instead of waiting for the background worker: Administrator, Supervisor
  deliverOutbox: () => request<{ attempted: any[] }>('/integrations/outbox/deliver', { method: 'POST' }),
  // Developer Integrations console (read-only; Administrator, Supervisor, Auditor). Credentials: configured or not, never values.
  integrationsOverview: () => request<IntegrationsOverview>('/integrations/overview'),
  integrationEvents: () => request<InboundEventRow[]>('/integrations/events'),
  mcpServers: () => request<McpStatus>('/integrations/mcp'),
  audit: () => request<any[]>('/admin/audit-logs'),
  users: () => request<User[]>('/admin/users'),
  automationSummary: () => request<any>('/automation/summary'),
  automationAgents: () => request<any>('/automation/agents'),
  runAutomation: (id: string) => request<any>(`/automation/tickets/${id}/run`, { method: 'POST' }),
  runAllAutomation: () => request<any>('/automation/run-all', { method: 'POST' }),
  customerTransactions: () => request<any[]>('/customer/transactions'),
  customerPurchases: () => request<{ items: Purchase[]; reasons: ClaimReason[] }>('/customer/purchases'),
  // Portal claim: the server derives product, category, amount and order from the purchase
  submitClaim: (data: { transaction_id: string; purchase_id: string; reason: string; description?: string; evidence_images?: string[] }) =>
    request<Ticket>('/tickets', { method: 'POST', body: JSON.stringify(data) }),

  // 3-Bucket CS Desks & eCommerce Webhook
  desksSummary: () => request<any>('/desks/summary'),
  cs1DirectRefund: (id: string) => request<any>(`/cs1/tickets/${id}/direct-refund`, { method: 'POST' }),
  cs1ManualDecide: (id: string, decision: string, reason: string) =>
    request<any>(`/cs1/tickets/${id}/manual-decide`, { method: 'POST', body: JSON.stringify({ decision, reason }) }),
  cs2SendProofRequest: (id: string, message: string, proof_type?: string) =>
    request<any>(`/cs2/tickets/${id}/send-proof-request`, { method: 'POST', body: JSON.stringify({ message, proof_type }) }),
  cs3SendRejectionNotice: (id: string, message: string, reason?: string) =>
    request<any>(`/cs3/tickets/${id}/send-rejection-notice`, { method: 'POST', body: JSON.stringify({ message, reason }) }),
  ecommerceTicketIntake: (payload: any, secret?: string) =>
    request<any>('/integrations/ecommerce/ticket', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: secret ? { 'X-Ecommerce-Secret': secret } : {}
    }),
  shopflowStatus: () => request<any>('/integrations/shopflow/status'),
  shopflowSync: () => request<any>('/integrations/shopflow/sync', { method: 'POST' }),
  shopflowWebhook: (payload: any) =>
    request<any>('/webhook/refund-tickets', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  proofAction: (ticketId: string, action: string, note?: string) =>
    request<any>(`/tickets/${ticketId}/proof-action`, {
      method: 'POST',
      body: JSON.stringify({ action, note })
    }),
  payoutsAwaitingAuthorization: () => request<Ticket[]>('/payouts/awaiting-authorization'),
  ticketTimeline: (id: string) => request<{ history: any[]; store_delivery?: any }>(`/tickets/${id}/timeline`),
  authorizePayout: (ticketId: string) =>
    request<any>(`/tickets/${ticketId}/authorize-payout`, {
      method: 'POST'
    }),
  ledgerAccounts: () => request<any[]>('/finance/ledger/accounts'),
  ledgerJournals: () => request<any[]>('/finance/ledger/journals'),
  settlements: () => request<any[]>('/finance/settlements'),
  uploadEvidence: (ticket_id: string, file_name: string, file_type: string, base64_data: string) =>
    request<any>('/evidence/upload', {
      method: 'POST',
      body: JSON.stringify({ ticket_id, file_name, file_type, base64_data })
    }),
  verifyEvidence: (payload: any) =>
    request<any>('/evidence/verify', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  products: () => request<any[]>('/catalog/products'),
  policies: () => request<any[]>('/policies'),
  healthReadiness: () => request<any>('/health/readiness')
}

