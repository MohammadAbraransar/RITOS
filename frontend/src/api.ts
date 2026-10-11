const API = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

export type User = { id:string; email:string; full_name:string; role:string }

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
  executeRefund: (id: string) => request<any>(`/refunds/${id}/execute`, { method: 'POST' }),
  audit: () => request<any[]>('/admin/audit-logs'),
  users: () => request<User[]>('/admin/users'),
  automationSummary: () => request<any>('/automation/summary'),
  automationAgents: () => request<any>('/automation/agents'),
  runAutomation: (id: string) => request<any>(`/automation/tickets/${id}/run`, { method: 'POST' }),
  runAllAutomation: () => request<any>('/automation/run-all', { method: 'POST' }),
  customerTransactions: () => request<any[]>('/customer/transactions'),

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
  authorizePayout: (ticketId: string) =>
    request<any>(`/tickets/${ticketId}/authorize-payout`, {
      method: 'POST'
    })
}
