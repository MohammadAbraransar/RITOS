import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BadgeCheck, Bell,
  BookOpen, BrainCircuit, Check, CheckCircle2, ChevronDown, ChevronRight,
  CircleDollarSign, Clock3, Command, Copy, Database, ExternalLink, FileText,
  Filter, Gauge, Headphones, HelpCircle, Info, LayoutDashboard, Lock, LogOut,
  Mail, Menu, MessageSquare, Phone, Play, Plus, RefreshCw, Search, Send,
  Shield, ShieldAlert, Sparkles, Ticket as TicketIcon, Users, WalletCards, X, Zap,
  Camera, Cpu, GitFork, UploadCloud, Trash2
} from 'lucide-react'
import { api, getToken, setToken, type Ticket, type User } from './api'
import { isClosedStatus, priorityRank } from './logic'

export { isClosedStatus, priorityRank }

const roles = [
  { label: 'CS-1 (Fast-Track)', role: 'cs_1', email: 'cs1@ritos.local', icon: CheckCircle2, desc: 'Genuine in-policy refunds' },
  { label: 'CS-2 (Exceptions)', role: 'cs_2', email: 'cs2@ritos.local', icon: AlertTriangle, desc: 'Missing proof & damage' },
  { label: 'CS-3 (Denials)', role: 'cs_3', email: 'cs3@ritos.local', icon: X, desc: 'Policy rejection notices' },
  { label: 'Administrator', role: 'administrator', email: 'admin@ritos.local', icon: Command, desc: 'Webhooks & system config' },
  { label: 'Supervisor', role: 'supervisor', email: 'lead@ritos.local', icon: Shield, desc: 'Omnichannel desk oversight' },
  { label: 'Finance Approver', role: 'finance_approver', email: 'finance@ritos.local', icon: CircleDollarSign, desc: 'Settlement authorization' },
  { label: 'Customer Portal', role: 'customer', email: 'customer@ritos.local', icon: Users, desc: 'Self-service claims' }
]

const AGENT_CATALOG = [
  { id: 'transaction_data_fetcher', name: 'Transaction Data Fetcher', mode: 'Deterministic SQL / Provider', purpose: 'Fetches trusted ledger records for claimed transaction ID and validates amount, currency, and customer ownership.', guardrail: 'Customer statements never establish payment proof; ledger is ground truth.' },
  { id: 'duplicate_intelligence', name: 'Duplicate Intelligence', mode: 'Heuristic Matching', purpose: 'Detects repeated customer tickets for the same transaction ID to prevent redundant investigation efforts.', guardrail: 'Never auto-closes or auto-rejects cases; links related tickets for human verification.' },
  { id: 'issue_classifier', name: 'Issue Classification', mode: 'NLP / Rule Extraction', purpose: 'Classifies customer complaint into standardized operational categories with confidence rating and evidence tokens.', guardrail: 'Confidence score is a triage signal, never an authorization for money movement.' },
  { id: 'risk_assessment', name: 'Risk & Fraud Signals', mode: 'Multi-Factor Scoring', purpose: 'Evaluates transaction and claim history to flag high-severity anomalies like unauthorized payment reports.', guardrail: 'Risk indicators are review flags, not proof of fraud. Never auto-penalizes customers.' },
  { id: 'eligibility_policy', name: 'Refund Eligibility & Policy', mode: 'Deterministic Rules', purpose: 'Evaluates eCommerce product category return windows (Electronics: 7d, Apparel: 14d, Perishable: 0d).', guardrail: 'Conservative policy: only marks eligibility for human review; cannot trigger payout.' },
  { id: 'routing_sla', name: 'Routing & SLA Agent', mode: 'Queue Table & Priority Engine', purpose: 'Assigns tickets to CS-1 (Genuine), CS-2 (Exceptions/Proof), or CS-3 (Ineligible/Non-refundable).', guardrail: 'Security-sensitive categories (unauthorized payments) cannot be downgraded from P1.' },
  { id: 'refund_execution', name: 'Refund Execution Adapter', mode: 'Idempotent Provider Adapter', purpose: 'Submits authorized payout requests to payment gateway using SHA-256 idempotency key protection.', guardrail: 'Strict segregation of duties: Requester ≠ Approver ≠ Executor. Prevents double-spend.' },
  { id: 'reconciliation_communication', name: 'Reconciliation & Communication', mode: 'Event Publisher & Audit Dispatch', purpose: 'Reconciles asynchronous gateway settlement webhooks, updates ticket status, and logs immutable audit trails.', guardrail: 'Stateless replay safety; audit events are strictly append-only.' }
]

const navFor = (role: string) => {
  if (role === 'cs_1') {
    return [
      ['CS-1 Dashboard', 'dashboard'],
      ['🟢 CS-1 Genuine Queue', 'cs1_desk'],
      ['My Desk Tickets', 'tickets']
    ]
  }
  if (role === 'cs_2') {
    return [
      ['CS-2 Dashboard', 'dashboard'],
      ['🟡 CS-2 Exception Queue', 'cs2_desk'],
      ['My Desk Tickets', 'tickets']
    ]
  }
  if (role === 'cs_3') {
    return [
      ['CS-3 Dashboard', 'dashboard'],
      ['🔴 CS-3 Denial Queue', 'cs3_desk'],
      ['My Desk Tickets', 'tickets']
    ]
  }
  if (role === 'customer') {
    return [
      ['Overview', 'dashboard'],
      ['My Claims', 'tickets'],
      ['File New Claim', 'new'],
      ['Refunds', 'refunds']
    ]
  }
  if (role === 'finance_approver') {
    return [
      ['Finance Dashboard', 'dashboard'],
      ['💰 Finance Approvals Queue', 'finance_queue'],
      ['Settlement Register', 'refunds'],
      ['Audit Trail', 'audit']
    ]
  }
  // Administrator and Supervisor: Full omnichannel visibility & controls
  return [
    ['Executive Command', 'dashboard'],
    ['🟢 CS-1 Genuine Desk', 'cs1_desk'],
    ['🟡 CS-2 Exception Desk', 'cs2_desk'],
    ['🔴 CS-3 Denial Desk', 'cs3_desk'],
    ['💰 Finance Approvals Queue', 'finance_queue'],
    ['All Team Tickets Queue', 'tickets'],
    ['🛒 eCommerce Integration Hub', 'ecommerce'],
    ['8 Specialist Agents Registry', 'automation'],
    ['Settlement Register', 'refunds'],
    ['Security Audit Trail', 'audit']
  ]
}

const roleTitle = (r: string) => roles.find(x => x.role === r)?.label || r
const money = (n: number, c = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: c, maximumFractionDigits: 2 }).format(n || 0)
const date = (d: string) => new Date(d).toLocaleString()

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('cs1@ritos.local')
  const [password, setPassword] = useState('ChangeMe123!')
  const [loginError, setLoginError] = useState('')
  const [busy, setBusy] = useState(false)

  const [page, setPage] = useState('dashboard')
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [metrics, setMetrics] = useState<any>(null)
  const [desks, setDesks] = useState<any>({ cs1_count: 0, cs2_count: 0, cs3_count: 0, resolved_count: 0, total_tickets: 0 })
  const [automation, setAutomation] = useState<any>(null)
  const [refunds, setRefunds] = useState<any[]>([])
  const [audit, setAudit] = useState<any[]>([])

  const [selected, setSelected] = useState<Ticket | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')

  const [notice, setNotice] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [showMobileNav, setShowMobileNav] = useState(false)
  const [showDocModal, setShowDocModal] = useState(false)
  const [activeAgentModal, setActiveAgentModal] = useState<any>(null)
  const [apiStatus, setApiStatus] = useState<'checking' | 'connected' | 'degraded'>('checking')

  const [pipelineLoading, setPipelineLoading] = useState(false)
  const [pipelineTrace, setPipelineTrace] = useState<any>(null)

  // Message drafting state in drawer
  const [draftMessage, setDraftMessage] = useState('')
  const [manualCancelReason, setManualCancelReason] = useState('')
  const [showCancelPrompt, setShowCancelPrompt] = useState(false)

  // eCommerce Webhook Simulator state
  const [simEcom, setSimEcom] = useState({
    order_id: 'ORD-9022',
    transaction_id: 'TXN-1002',
    customer_name: 'Pooja Verma',
    customer_phone: '+91-9876543220',
    item_name: 'Fastrack Smartwatch',
    item_category: 'ELECTRONICS',
    claimed_amount: '2499.00',
    description: 'Display is flickering and battery drains within 1 hour of delivery.'
  })
  const [ecomSimResult, setEcomSimResult] = useState<any>(null)

  const [form, setForm] = useState({
    transaction_id: 'TXN-1001',
    order_id: 'ORD-1001',
    item_name: 'Fastrack Smartwatch Reflex',
    item_category: 'ELECTRONICS',
    claimed_amount: '1500',
    currency: 'INR',
    category: 'DEFECTIVE_PRODUCT',
    description: 'Product received with display defect and erratic touch response out of the box.',
    custom_photo_base64: '' as string,
    custom_photo_name: '' as string,
    evidence_image_preset: 'stitching_loose_zipper.jpg'
  })

  const handleClaimFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const b64 = ev.target?.result as string
        setForm(prev => ({
          ...prev,
          custom_photo_base64: b64,
          custom_photo_name: file.name
        }))
      }
      reader.readAsDataURL(file)
    }
  }

  const [customerTxs, setCustomerTxs] = useState<any[]>([])
  const [runningAllAgents, setRunningAllAgents] = useState(false)
  const [allAgentsResult, setAllAgentsResult] = useState<any>(null)
  const [shopflowStatus, setShopflowStatus] = useState<any>(null)
  const [syncingShopflow, setSyncingShopflow] = useState(false)

  const [comment, setComment] = useState('')
  const [internal, setInternal] = useState(true)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundReason, setRefundReason] = useState('Verified refund request; please review.')
  const [decisionReason, setDecisionReason] = useState('Reviewed against verified transaction records.')

  const isCustomer = user?.role === 'customer'
  const canOperate = ['cs_1', 'cs_2', 'cs_3', 'refund_operations', 'finance_approver', 'administrator', 'supervisor', 'support_agent'].includes(user?.role || '')
  const nav = useMemo(() => navFor(user?.role || 'cs_1'), [user?.role])

  // Filtered ticket subsets for desks (Strict isolation)
  const cs1Tickets = useMemo(() => tickets.filter(t => t.decision_bucket === 'GENUINE_REFUNDABLE' || t.assigned_desk === 'CS_1'), [tickets])
  const cs2Tickets = useMemo(() => tickets.filter(t => t.decision_bucket === 'EXCEPTIONAL_PROOF_NEEDED' || t.assigned_desk === 'CS_2'), [tickets])
  const cs3Tickets = useMemo(() => tickets.filter(t => t.decision_bucket === 'NON_REFUNDABLE' || t.assigned_desk === 'CS_3'), [tickets])

  // Strictly segregated queue per operational role
  const displayedTickets = useMemo(() => {
    if (user?.role === 'cs_1') return cs1Tickets
    if (user?.role === 'cs_2') return cs2Tickets
    if (user?.role === 'cs_3') return cs3Tickets
    return tickets
  }, [tickets, user?.role, cs1Tickets, cs2Tickets, cs3Tickets])

  async function load() {
    try {
      const params = new URLSearchParams()
      if (search) params.set('q', search)
      if (statusFilter) params.set('status', statusFilter)
      if (priorityFilter) params.set('priority', priorityFilter)

      const [t, m, r, d, txs] = await Promise.all([
        api.tickets(params.toString() ? '?' + params.toString() : ''),
        isCustomer ? Promise.resolve(null) : api.analytics(),
        api.refunds(),
        isCustomer ? Promise.resolve(null) : api.desksSummary().catch(() => null),
        isCustomer ? api.customerTransactions().catch(() => []) : Promise.resolve([])
      ])
      setTickets(t.items)
      setMetrics(m)
      setRefunds(r)
      if (d) setDesks(d)
      if (txs) setCustomerTxs(txs)
      setApiStatus('connected')

      if (!isCustomer) {
        try {
          setAutomation(await api.automationSummary())
        } catch {
          setAutomation(null)
        }
      }
      if (['administrator', 'auditor', 'supervisor'].includes(user?.role || '')) {
        try {
          setAudit(await api.audit())
        } catch {}
      }
      if (!isCustomer) {
        api.shopflowStatus().then(setShopflowStatus).catch(() => setShopflowStatus(null))
      }
    } catch (e) {
      setApiStatus('degraded')
      setNotice((e as Error).message)
    }
  }

  useEffect(() => {
    if (getToken()) {
      api.me().then(setUser).catch(() => {
        setToken('')
        setUser(null)
      })
    }
  }, [])

  useEffect(() => {
    if (selected) {
      setRefundAmount(selected.claimed_amount ? String(selected.claimed_amount) : '')
      setDraftMessage(selected.customer_message_draft || '')
      setShowCancelPrompt(false)
      setManualCancelReason('')
    }
  }, [selected])

  useEffect(() => {
    if (user) {
      load()
    }
  }, [user, page, search, statusFilter, priorityFilter])

  async function login(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setLoginError('')
    try {
      const data = await api.login(email, password)
      setToken(data.access_token)
      setUser(data.user)
      setPage('dashboard')
    } catch (e) {
      setLoginError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function quickSwitch(targetEmail: string) {
    setBusy(true)
    try {
      const data = await api.login(targetEmail, 'ChangeMe123!')
      setToken(data.access_token)
      setUser(data.user)
      setSelected(null)
      setPipelineTrace(null)
      setNotice(`Switched session to ${data.user.full_name} (${roleTitle(data.user.role)})`)
      await load()
    } catch (err) {
      setNotice(`Role switch failed: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  function logout() {
    setToken('')
    setUser(null)
    setSelected(null)
    setPipelineTrace(null)
    setPage('dashboard')
  }

  async function refresh() {
    await load()
    setNotice('Data synced with database and desk queues.')
  }

  // --- CS-1 ACTIONS ---
  async function handleCS1DirectRefund(t: Ticket) {
    setBusy(true)
    try {
      const res = await api.cs1DirectRefund(t.id)
      setNotice(`✅ CS-1 Direct Refund Executed! Provider Reference: ${res.provider_reference}`)
      setSelected(res.ticket)
      await load()
    } catch (err) {
      setNotice(`CS-1 Refund Failed: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleCS1ManualDecide(t: Ticket, decision: 'APPROVE' | 'CANCEL') {
    if (decision === 'CANCEL' && !manualCancelReason.trim()) {
      setNotice('Please provide a reason for cancelling the refund.')
      return
    }
    setBusy(true)
    try {
      const reason = decision === 'APPROVE' ? 'CS-1 Manual Inspection Verified and Approved.' : manualCancelReason
      const res = await api.cs1ManualDecide(t.id, decision, reason)
      setNotice(decision === 'APPROVE' ? '✅ Refund Approved & Executed by CS-1!' : '❌ Refund Cancelled/Denied by CS-1.')
      setSelected(res.ticket)
      setShowCancelPrompt(false)
      await load()
    } catch (err) {
      setNotice(`Action Failed: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  // --- CS-2 ACTION: SEND PROOF REQUEST ---
  async function handleCS2SendProof(t: Ticket) {
    setBusy(true)
    try {
      const res = await api.cs2SendProofRequest(t.id, draftMessage || t.customer_message_draft || '', t.proof_required || undefined)
      setNotice(`📲 Proof Request Dispatched to ${res.destination}! Ticket moved to Awaiting Information.`)
      setSelected(res.ticket)
      await load()
    } catch (err) {
      setNotice(`Dispatch Failed: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  // --- CS-3 ACTION: SEND REJECTION NOTICE ---
  async function handleCS3SendRejection(t: Ticket) {
    setBusy(true)
    try {
      const res = await api.cs3SendRejectionNotice(t.id, draftMessage || t.customer_message_draft || '', t.policy_evaluation_reason || undefined)
      setNotice(`📩 Policy Rejection Notice Dispatched to ${res.destination}! Ticket marked Rejected.`)
      setSelected(res.ticket)
      await load()
    } catch (err) {
      setNotice(`Dispatch Failed: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  // --- CS-2 HUMAN-IN-THE-LOOP PROOF ACTIONS ---
  async function handleProofAction(t: Ticket, action: 'APPROVE_PROOF' | 'REQUEST_PROOF' | 'DENY', note: string) {
    setBusy(true)
    try {
      const res = await api.proofAction(t.id, action, note)
      setNotice(
        action === 'APPROVE_PROOF'
          ? '✅ Photo Proof Approved! Ticket promoted to CS-1 for payout.'
          : action === 'REQUEST_PROOF'
          ? '📩 Additional proof requested from customer.'
          : '❌ Claim denied based on photo proof inspection.'
      )
      setSelected(res.ticket)
      await load()
    } catch (err) {
      setNotice(`Proof Action Failed: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  // --- FINANCE PAYOUT AUTHORIZATION ---
  async function handleAuthorizePayout(t: Ticket) {
    setBusy(true)
    try {
      const res = await api.authorizePayout(t.id)
      setNotice(`💰 Gateway Payout Authorized & Executed! Ref: ${res.provider_reference} (${money(res.amount, t.currency)})`)
      setSelected(res.ticket)
      await load()
    } catch (err) {
      setNotice(`Payout Execution Failed: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  // --- ECOMMERCE WEBHOOK SIMULATION ---
  async function handleSimulateEcom() {
    setBusy(true)
    try {
      const payload = {
        ...simEcom,
        claimed_amount: Number(simEcom.claimed_amount),
        purchase_date: new Date().toISOString()
      }
      const res = await api.ecommerceTicketIntake(payload)
      setEcomSimResult(res)
      setNotice(`🚀 eCommerce Ticket Ingested! Ticket #${res.ticket_number} triaged to ${res.assigned_desk} (${res.decision_bucket}).`)
      await load()
    } catch (err) {
      setNotice(`eCommerce Simulation Failed: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  // --- FINANCE APPROVER ACTIONS ---
  async function handleApproveRefund(r: any) {
    setBusy(true)
    try {
      await api.approveRefund(r.id, 'Dual-custody verification approved by Finance.')
      setNotice(`✅ Refund #${r.id.slice(0, 8).toUpperCase()} Approved by Finance Approver!`)
      await load()
    } catch (err) {
      setNotice(`Approval Failed: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleRejectRefund(r: any) {
    setBusy(true)
    try {
      await api.rejectRefund(r.id, 'Disapproved by Finance Approver audit check.')
      setNotice(`❌ Refund #${r.id.slice(0, 8).toUpperCase()} Rejected by Finance Approver.`)
      await load()
    } catch (err) {
      setNotice(`Rejection Failed: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  // --- AUTOMATION ORCHESTRATION ---
  async function handleRunAllAgents() {
    setRunningAllAgents(true)
    try {
      const res = await api.runAllAutomation()
      setAllAgentsResult(res)
      setNotice(`🤖 AI Orchestrator: 8 Specialist Agents executed across ${res.processed_count} active tickets!`)
      await load()
    } catch (err) {
      setNotice(`Multi-Agent Run Failed: ${(err as Error).message}`)
    } finally {
      setRunningAllAgents(false)
    }
  }

  function handleRequestRefundForOrder(tx: any) {
    setForm(prev => ({
      ...prev,
      transaction_id: tx.id,
      order_id: tx.order_id,
      claimed_amount: String(Number(tx.amount) - Number(tx.refunded_amount)),
      currency: tx.currency,
      description: `Refund requested for Order ${tx.order_id} (${tx.id}).`
    }))
    setPage('new')
  }

  // --- SHOPFLOW ACTIONS ---
  async function handleSyncShopflow() {
    setSyncingShopflow(true)
    try {
      const res = await api.shopflowSync()
      if (res.status === 'DISCONNECTED') {
        setNotice(`⚠️ ShopFlow Status: ${res.message}`)
      } else {
        setNotice(`🔄 ShopFlow Sync Completed: Processed ${res.synced_count} pending claim(s).`)
      }
      await load()
    } catch (err) {
      setNotice(`ShopFlow Sync Failed: ${(err as Error).message}`)
    } finally {
      setSyncingShopflow(false)
    }
  }

  async function handleSimulateShopflowWebhook() {
    setBusy(true)
    try {
      const samplePayload = {
        event_id: `EVT-${Date.now()}`,
        event_type: 'refund.ticket.created',
        ticket_id: 'RIT-2026-000001',
        status: 'PENDING_RITOS'
      }
      const res = await api.shopflowWebhook(samplePayload)
      setNotice(`🚀 ShopFlow Webhook Ingested! Adjudicated ${res.data?.ticket_id} to ${res.data?.assigned_desk} (${res.data?.decision}).`)
      await load()
    } catch (err) {
      setNotice(`ShopFlow Webhook Simulation Note: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function submitTicket(e: FormEvent) {
    e.preventDefault()
    try {
      const evidence = form.custom_photo_base64
        ? [form.custom_photo_base64]
        : (form.evidence_image_preset ? [form.evidence_image_preset] : [])
      const created = await api.createTicket({
        transaction_id: form.transaction_id,
        order_id: form.order_id,
        claimed_amount: Number(form.claimed_amount),
        currency: form.currency,
        description: form.description,
        item_name: form.item_name,
        item_category: form.item_category,
        evidence_images: evidence
      })
      setShowNew(false)
      setPage('tickets')
      await load()
      setNotice(`✓ Claim ${created.ticket_number} submitted! Triage & computer vision inspection complete.`)
    } catch (e) {
      setNotice((e as Error).message)
    }
  }

  async function triggerAutomation(t: Ticket) {
    setPipelineLoading(true)
    try {
      const result = await api.runAutomation(t.id)
      setPipelineTrace(result)
      const refreshed = await api.ticket(t.id)
      setSelected(refreshed)
      await load()
      setNotice(`Pipeline completed: Routed to ${result.assigned_desk} (${result.decision_bucket}).`)
    } catch (e) {
      setNotice(`Automation run failed: ${(e as Error).message}`)
    } finally {
      setPipelineLoading(false)
    }
  }

  async function doUpdate(t: Ticket, data: unknown) {
    try {
      const updated = await api.updateTicket(t.id, data)
      setSelected(updated)
      await load()
      setNotice('Ticket updated successfully.')
    } catch (e) {
      setNotice((e as Error).message)
    }
  }

  async function addComment(e: FormEvent) {
    e.preventDefault()
    if (!selected || !comment.trim()) return
    try {
      await api.comment(selected.id, comment, internal && !isCustomer)
      setComment('')
      setSelected(await api.ticket(selected.id))
      await load()
      setNotice('Comment recorded in case ledger.')
    } catch (e) {
      setNotice((e as Error).message)
    }
  }

  // --- SIGN IN VIEW ---
  if (!user) {
    return (
      <div className="login-shell">
        <div className="login-container">
          {/* LEFT ART & BRAND SHOWCASE */}
          <div className="login-art">
            <div className="login-art-top">
              <div className="login-brand-badge">
                <div className="login-brand-icon">
                  <Command size={22} />
                </div>
                <div>
                  <div className="login-brand-title">RITOS</div>
                  <span className="login-brand-tag">ECOM OPS GOVERNANCE</span>
                </div>
              </div>

              {/* RITOS FULL ABBREVIATION BANNER */}
              <div className="login-abbreviation-box">
                <h3>Full System Specification</h3>
                <p>
                  <strong>RITOS</strong>: <strong>R</strong>efund <strong>I</strong>ntelligence &amp; <strong>T</strong>riage <strong>O</strong>rchestration <strong>S</strong>ystem
                </p>
              </div>

              <div className="login-hero-text">
                <h1>
                  Autonomous Refund Operations.<br />
                  <span>Governed by Ledger Proof.</span>
                </h1>
                <p>
                  Multi-agent deterministic pipeline arbitrating eCommerce returns, computer vision defect inspection, and four-eyes financial settlement.
                </p>
              </div>

              {/* 3 CORE ARCHITECTURE PILLARS */}
              <div className="login-pillars-grid">
                <div className="login-pillar-item">
                  <Shield size={16} color="#38bdf8" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Ledger Ground Truth:</strong> Real-time payment gateway ledger audits eliminate duplicate and ghost refund losses.
                  </div>
                </div>
                <div className="login-pillar-item">
                  <Camera size={16} color="#34d399" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Pillow Vision Engine:</strong> Computer vision inspects physical tears, cracks, and EXIF tamper tokens.
                  </div>
                </div>
                <div className="login-pillar-item">
                  <CircleDollarSign size={16} color="#f472b6" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Four-Eyes Governance:</strong> Segregation of duties prevents unauthorized money movement.
                  </div>
                </div>
              </div>
            </div>

            {/* STAT STRIP */}
            <div className="login-stat-strip">
              <div>
                <div className="login-stat-val" style={{ color: '#38bdf8' }}>0%</div>
                <div className="login-stat-lbl">Hallucination Risk</div>
              </div>
              <div>
                <div className="login-stat-val" style={{ color: '#34d399' }}>&lt; 3s</div>
                <div className="login-stat-lbl">Multi-Agent Triage</div>
              </div>
              <div>
                <div className="login-stat-val" style={{ color: '#f472b6' }}>100%</div>
                <div className="login-stat-lbl">Idempotent Payouts</div>
              </div>
            </div>

            <div className="login-foot" style={{ marginTop: '20px' }}>
              RITOS CORE ENGINE · PRODUCTION GRADE · LOCAL ACTIVE
            </div>
          </div>

          {/* RIGHT SIGN IN PANEL */}
          <div className="login-panel">
            <form className="login-card" onSubmit={login}>
              <div className="eyebrow" style={{ color: 'var(--primary-700)', fontWeight: 800 }}>WORKSPACE ACCESS</div>
              <h2>Sign in to Operational Hub</h2>
              <p>Select any desk persona below for 1-click credential configuration:</p>

              {loginError && <div className="error-box"><AlertTriangle size={15} /> {loginError}</div>}

              {/* 1-CLICK PERSONA PICKER */}
              <div className="divider-text" style={{ margin: '0 0 10px' }}>SELECT DESK PERSONA</div>
              <div className="role-pills-grid" style={{ marginBottom: '18px' }}>
                {roles.map(r => (
                  <button
                    type="button"
                    key={r.role}
                    className={`role-pill-btn ${email === r.email ? 'active' : ''}`}
                    onClick={() => {
                      setEmail(r.email)
                      setPassword('ChangeMe123!')
                    }}
                  >
                    <strong style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <r.icon size={13} /> {r.label}
                    </strong>
                    <small style={{ color: 'var(--text-muted)' }}>{r.desc}</small>
                  </button>
                ))}
              </div>

              <label>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="e.g. cs1@ritos.local"
              />

              <label style={{ marginTop: '10px' }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />

              <button className="primary full" disabled={busy} style={{ marginTop: '16px' }}>
                {busy ? 'Authenticating…' : 'Sign in to RITOS Workspace'}
              </button>

              <div className="hint" style={{ marginTop: '14px', textAlign: 'center' }}>
                Enterprise Default Password: <code>ChangeMe123!</code>
              </div>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className={`sidebar ${showMobileNav ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-mark"><Command size={22} /></span>
          <span>RITOS</span>
          <span className="brand-tag">OPS</span>
        </div>

        <div className="workspace-label">ACTIVE ROLE</div>
        <div className="workspace-switch">
          <div className="workspace-icon"><Headphones size={18} /></div>
          <div>
            <strong>{roleTitle(user.role)}</strong>
            <small>{user.email}</small>
          </div>
          <ChevronDown size={14} />
        </div>

        <div className="nav-label">OPERATIONS & DESKS</div>
        <nav>
          {nav.map(([label, key]) => {
            const count =
              key === 'cs1_desk' ? desks?.cs1_count :
              key === 'cs2_desk' ? desks?.cs2_count :
              key === 'cs3_desk' ? desks?.cs3_count :
              key === 'tickets' ? tickets.length : null

            return (
              <button
                key={key}
                className={`nav-item ${page === key ? 'active' : ''}`}
                onClick={() => {
                  setPage(key)
                  setSelected(null)
                  setShowMobileNav(false)
                }}
              >
                {key === 'dashboard' ? <LayoutDashboard size={17} /> :
                 key === 'cs1_desk' ? <CheckCircle2 size={17} color="#059669" /> :
                 key === 'cs2_desk' ? <AlertTriangle size={17} color="#d97706" /> :
                 key === 'cs3_desk' ? <X size={17} color="#e11d48" /> :
                 key === 'tickets' ? <TicketIcon size={17} /> :
                 key === 'refunds' ? <CircleDollarSign size={17} /> :
                 key === 'ecommerce' ? <ExternalLink size={17} color="#2563eb" /> :
                 key === 'automation' ? <BrainCircuit size={17} /> : <FileText size={17} />}
                <span>{label}</span>
                {count !== null && count !== undefined && count > 0 && (
                  <span className="nav-count">{count}</span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="secure-card">
            <div className="secure-icon"><ShieldCheckIcon /></div>
            <strong>AI Auto-Triage Active</strong>
            <p>Tickets sorted into CS-1, CS-2, & CS-3 with pre-drafted customer notifications.</p>
            <span className="secure-status"><i />eCom Webhook Ready</span>
          </div>

          <button className="profile" onClick={logout} title="Sign Out">
            <div className="avatar">
              {user.full_name.split(' ').map(x => x[0]).slice(0, 2).join('')}
            </div>
            <div className="profile-info">
              <strong>{user.full_name}</strong>
              <small>{roleTitle(user.role)}</small>
            </div>
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {showMobileNav && <div className="mobile-scrim" onClick={() => setShowMobileNav(false)} />}

      {/* Main Workspace Area */}
      <main className="main">
        {/* Topbar */}
        <header className="topbar">
          <div className="top-left">
            <button className="icon-btn mobile-menu" onClick={() => setShowMobileNav(!showMobileNav)}>
              <Menu size={20} />
            </button>
            <div className="crumb">
              <span>RITOS</span>
              <span>/</span>
              <strong>{nav.find(x => x[1] === page)?.[0] || page}</strong>
            </div>
          </div>

          <div className="top-actions">
            {/* Quick Desk / Role Switcher */}
            <div className="quick-role-bar">
              {roles.map(r => (
                <button
                  key={r.role}
                  className={`quick-role-btn ${user.role === r.role ? 'active' : ''}`}
                  onClick={() => quickSwitch(r.email)}
                  title={`Switch to ${r.label}`}
                >
                  <r.icon size={13} />
                  <span>{r.label.split(' ')[0]}</span>
                </button>
              ))}
            </div>

            <button className="doc-btn" onClick={() => setShowDocModal(true)}>
              <BookOpen size={15} />
              <span>System Docs</span>
            </button>

            <button className="icon-btn" title="Refresh records" onClick={refresh}>
              <RefreshCw size={17} />
            </button>

            <div className="top-avatar" title={`${user.full_name} (${roleTitle(user.role)})`}>
              {user.full_name.split(' ').map(x => x[0]).slice(0, 2).join('')}
            </div>
          </div>
        </header>

        {/* Dynamic Content */}
        <div className="content">
          {notice && (
            <div className="notice">
              <span>{notice}</span>
              <button onClick={() => setNotice('')}><X size={16} /></button>
            </div>
          )}

          {/* DASHBOARD - STRICTLY ROLE SEGREGATED */}
          {page === 'dashboard' && user.role === 'cs_1' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow" style={{ color: 'var(--emerald-700)' }}>🟢 CS-1 OPERATIONAL PIPELINE</div>
                  <h1>CS-1 Fast-Track Refund Workspace</h1>
                  <p>Verified against payment gateway records and in-policy return windows. Direct 1-click execution or manual inspection.</p>
                </div>
                <div className="heading-actions">
                  <button className="secondary" onClick={refresh}>
                    <RefreshCw size={15} /> Sync Queue
                  </button>
                  <span className="pill green" style={{ padding: '8px 14px', fontSize: '12px' }}>
                    {cs1Tickets.length} Genuine Cases Pending
                  </span>
                </div>
              </div>

              <div className="metric-grid" style={{ marginBottom: '24px' }}>
                <Metric icon={<CheckCircle2 />} label="Active Genuine Claims" value={cs1Tickets.length} note="Eligible for immediate refund" tone="green" />
                <Metric icon={<BadgeCheck />} label="Gateway Verification" value="100% MATCH" note="Double-entry ledger verified" tone="blue" />
                <Metric icon={<CircleDollarSign />} label="Settlement Execution" value="1-Click Direct" note="SHA-256 idempotency locked" tone="green" />
                <Metric icon={<Clock3 />} label="Average Triage SLA" value="< 3s" note="Real-time multi-agent arbitration" tone="blue" />
              </div>

              <SectionTitle title="CS-1 Genuine Queue" action="View Full Desk Queue" onAction={() => setPage('cs1_desk')} />
              <TicketTable tickets={cs1Tickets} onSelect={setSelected} />
            </>
          )}

          {page === 'dashboard' && user.role === 'cs_2' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow" style={{ color: 'var(--amber-700)' }}>🟡 CS-2 OPERATIONAL PIPELINE</div>
                  <h1>CS-2 Exceptions & Evidence Workspace</h1>
                  <p>Discrepancies, damaged merchandise, and claims requiring unboxing footage or proof of receipt.</p>
                </div>
                <div className="heading-actions">
                  <button className="secondary" onClick={refresh}>
                    <RefreshCw size={15} /> Sync Queue
                  </button>
                  <span className="pill amber" style={{ padding: '8px 14px', fontSize: '12px' }}>
                    {cs2Tickets.length} Exceptions Awaiting Proof
                  </span>
                </div>
              </div>

              <div className="metric-grid" style={{ marginBottom: '24px' }}>
                <Metric icon={<AlertTriangle />} label="Exception Cases" value={cs2Tickets.length} note="Requires customer verification" tone="amber" />
                <Metric icon={<MessageSquare />} label="AI Drafts Prepared" value={cs2Tickets.filter(t => t.customer_message_draft).length} note="Ready for 1-click dispatch" tone="blue" />
                <Metric icon={<Send />} label="Proof Requests Sent" value={cs2Tickets.filter(t => t.proof_request_sent_at).length} note="Dispatched to customer mobile" tone="green" />
                <Metric icon={<ShieldAlert />} label="High-Risk Signals" value={cs2Tickets.filter(t => t.priority === 'P1').length} note="P1 priority reviews" tone="rose" />
              </div>

              <SectionTitle title="CS-2 Exceptions Queue" action="View Full Desk Queue" onAction={() => setPage('cs2_desk')} />
              <TicketTable tickets={cs2Tickets} onSelect={setSelected} />
            </>
          )}

          {page === 'dashboard' && user.role === 'cs_3' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow" style={{ color: 'var(--rose-700)' }}>🔴 CS-3 OPERATIONAL PIPELINE</div>
                  <h1>CS-3 Denial & Ineligible Resolution Workspace</h1>
                  <p>Claims exceeding category return windows, non-returnable hygiene/perishables, or unverified transaction IDs.</p>
                </div>
                <div className="heading-actions">
                  <button className="secondary" onClick={refresh}>
                    <RefreshCw size={15} /> Sync Queue
                  </button>
                  <span className="pill red" style={{ padding: '8px 14px', fontSize: '12px' }}>
                    {cs3Tickets.length} Ineligible Cases
                  </span>
                </div>
              </div>

              <div className="metric-grid" style={{ marginBottom: '24px' }}>
                <Metric icon={<X />} label="Ineligible Cases" value={cs3Tickets.length} note="Disqualified by policy engine" tone="rose" />
                <Metric icon={<FileText />} label="Policy Explanations Drafted" value={cs3Tickets.filter(t => t.customer_message_draft).length} note="Legally compliant notices" tone="blue" />
                <Metric icon={<Send />} label="Denial Notices Sent" value={cs3Tickets.filter(t => t.rejection_notice_sent_at).length} note="Dispatched to customer" tone="green" />
                <Metric icon={<Shield />} label="Hard Policy Boundaries" value="100% Enforced" note="Category limits strictly applied" tone="amber" />
              </div>

              <SectionTitle title="CS-3 Ineligible Queue" action="View Full Desk Queue" onAction={() => setPage('cs3_desk')} />
              <TicketTable tickets={cs3Tickets} onSelect={setSelected} />
            </>
          )}

          {/* OMNICHANNEL COMMAND CENTER - ADMIN & SUPERVISOR ONLY */}
          {page === 'dashboard' && ['administrator', 'supervisor', 'support_agent', 'refund_operations'].includes(user.role) && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">ENTERPRISE AUTOMATION CONTROL PLANE</div>
                  <h1>Omnichannel Operations Command Center</h1>
                  <p>Real-time cross-desk triage, automated customer communications, and live eCommerce webhook integrations.</p>
                </div>
                <div className="heading-actions">
                  <button className="secondary" onClick={refresh}>
                    <RefreshCw size={15} /> Sync Queues
                  </button>
                  <button className="primary" onClick={() => setPage('ecommerce')}>
                    <ExternalLink size={15} /> eCommerce Webhook Hub
                  </button>
                </div>
              </div>

              {/* 3-Desk Action Cards */}
              <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '24px' }}>
                <div className="metric-card click-row" onClick={() => setPage('cs1_desk')}>
                  <div className="metric-top">
                    <span className="metric-icon green"><CheckCircle2 size={20} /></span>
                    <span className="pill green"><i />CS-1 DESK</span>
                  </div>
                  <div className="metric-value">{desks?.cs1_count ?? 0} Cases</div>
                  <div className="metric-label" style={{ fontWeight: 700, color: 'var(--emerald-700)', fontSize: '13px' }}>
                    Genuine & Refundable
                  </div>
                  <div className="metric-note" style={{ marginTop: '4px' }}>
                    Verified ledger & within policy. Direct 1-Click refund or manual verification.
                  </div>
                </div>

                <div className="metric-card click-row" onClick={() => setPage('cs2_desk')}>
                  <div className="metric-top">
                    <span className="metric-icon amber"><AlertTriangle size={20} /></span>
                    <span className="pill amber"><i />CS-2 DESK</span>
                  </div>
                  <div className="metric-value">{desks?.cs2_count ?? 0} Cases</div>
                  <div className="metric-label" style={{ fontWeight: 700, color: 'var(--amber-700)', fontSize: '13px' }}>
                    Exceptions & Proof Needed
                  </div>
                  <div className="metric-note" style={{ marginTop: '4px' }}>
                    Damaged item, box crushed, or size mismatch. Auto-drafted proof request ready.
                  </div>
                </div>

                <div className="metric-card click-row" onClick={() => setPage('cs3_desk')}>
                  <div className="metric-top">
                    <span className="metric-icon red"><X size={20} /></span>
                    <span className="pill red"><i />CS-3 DESK</span>
                  </div>
                  <div className="metric-value">{desks?.cs3_count ?? 0} Cases</div>
                  <div className="metric-label" style={{ fontWeight: 700, color: 'var(--rose-700)', fontSize: '13px' }}>
                    Non-Refundable / Denials
                  </div>
                  <div className="metric-note" style={{ marginTop: '4px' }}>
                    Past return window, fake transaction ID, or final sale hygiene. Auto-drafted polite notice.
                  </div>
                </div>
              </div>

              {/* Overall Metrics */}
              <div className="metric-grid">
                <Metric icon={<TicketIcon />} label="Total Ingested Tickets" value={tickets.length} note="Live database records" tone="blue" />
                <Metric icon={<CheckCircle2 />} label="Resolved / Settled" value={desks?.resolved_count ?? 0} note="Processed refunds or closed" tone="green" />
                <Metric icon={<BrainCircuit />} label="Automated Pipeline Runs" value={automation?.pipeline_runs ?? 0} note="AI evaluations completed" tone="blue" />
                <Metric icon={<CircleDollarSign />} label="Total Refund Volume" value={money(metrics?.refund_completed || 0)} note="Settled via gateway" tone="green" />
              </div>

              <SectionTitle title="Live Ingested Cases" action="View All Tickets" onAction={() => setPage('tickets')} />
              <TicketTable tickets={tickets.slice(0, 6)} onSelect={setSelected} />
            </>
          )}

          {/* FINANCE APPROVER CONTROL CENTER */}
          {page === 'dashboard' && user.role === 'finance_approver' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow" style={{ color: 'var(--emerald-700)' }}>
                    FOUR-EYES FINANCIAL GOVERNANCE & SETTLEMENT DISBURSEMENT
                  </div>
                  <h1>Finance Approver Control Center</h1>
                  <p>Dual-custody authorization for customer refunds, payment gateway transaction audits, and immutable disbursement reconciliation.</p>
                </div>
                <div className="heading-actions">
                  <button className="secondary" onClick={refresh}>
                    <RefreshCw size={15} /> Sync Ledger
                  </button>
                  <button className="secondary" onClick={() => setPage('refunds')}>
                    <CircleDollarSign size={15} /> Full Settlement Register
                  </button>
                  <button className="primary" onClick={() => setPage('audit')}>
                    <Shield size={15} /> Compliance Audit Trail
                  </button>
                </div>
              </div>

              {/* Finance Metrics */}
              <div className="metric-grid" style={{ marginBottom: '24px' }}>
                <Metric
                  icon={<CircleDollarSign />}
                  label="Total Settled Volume"
                  value={money(refunds.filter(r => r.status === 'REFUNDED').reduce((acc, r) => acc + (Number(r.amount) || 0), 0))}
                  note="Disbursed via payment gateway"
                  tone="green"
                />
                <Metric
                  icon={<AlertTriangle />}
                  label="Pending Approvals"
                  value={refunds.filter(r => r.status === 'PENDING_APPROVAL').length}
                  note="Awaiting second-pair-of-eyes signoff"
                  tone="amber"
                />
                <Metric
                  icon={<Clock3 />}
                  label="Queued Payout Value"
                  value={money(refunds.filter(r => r.status === 'PENDING_APPROVAL').reduce((acc, r) => acc + (Number(r.amount) || 0), 0))}
                  note="Authorized release pending"
                  tone="blue"
                />
                <Metric
                  icon={<BadgeCheck />}
                  label="Governance Lock"
                  value="100% ENFORCED"
                  note="Dual-custody separation of duties"
                  tone="green"
                />
              </div>

              {/* Dual-Custody Approval Queue */}
              <div className="panel table-panel" style={{ marginBottom: '28px' }}>
                <div className="panel-heading">
                  <div>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertTriangle size={18} color="var(--amber-600)" />
                      Dual-Custody Action Queue
                    </h3>
                    <p>These refund requests require second-pair-of-eyes authorization before money is released from the merchant account.</p>
                  </div>
                  <span className="pill amber" style={{ padding: '6px 12px', fontSize: '12px' }}>
                    {refunds.filter(r => r.status === 'PENDING_APPROVAL').length} Pending Dual-Custody Sign-off
                  </span>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>REFUND ID</th>
                        <th>TRANSACTION & TICKET</th>
                        <th>DISBURSEMENT AMOUNT</th>
                        <th>OPERATIONAL JUSTIFICATION</th>
                        <th>STATUS</th>
                        <th>REQUESTED AT</th>
                        <th>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {refunds.filter(r => r.status === 'PENDING_APPROVAL').map(r => (
                        <tr key={r.id}>
                          <td>
                            <span className="mono" style={{ fontWeight: 700, color: 'var(--navy-900)' }}>
                              {r.id.slice(0, 8).toUpperCase()}
                            </span>
                          </td>
                          <td>
                            <strong>{r.transaction_id}</strong>
                            <small className="subline mono">Ticket #{r.ticket_id?.slice(0, 8)}</small>
                          </td>
                          <td>
                            <strong className="amount" style={{ fontSize: '15px' }}>
                              {money(r.amount, r.currency)}
                            </strong>
                          </td>
                          <td>
                            <p style={{ margin: 0, fontSize: '12px', color: 'var(--navy-700)', maxWidth: '280px', lineHeight: 1.4 }}>
                              {r.reason}
                            </p>
                          </td>
                          <td>
                            <StatusPill value={r.status} />
                          </td>
                          <td>
                            <span className="date-cell">{date(r.created_at)}</span>
                          </td>
                          <td>
                            <div className="row-actions">
                              <button
                                className="primary compact"
                                onClick={() => handleApproveRefund(r)}
                                disabled={busy}
                                style={{ background: 'var(--emerald-700)', borderColor: 'var(--emerald-700)' }}
                                title="Authorize and sign-off payout"
                              >
                                <Check size={14} /> Approve Payout
                              </button>
                              <button
                                className="secondary compact"
                                onClick={() => handleRejectRefund(r)}
                                disabled={busy}
                                style={{ color: 'var(--rose-700)', borderColor: 'var(--rose-200)' }}
                                title="Reject and decline disbursement"
                              >
                                <X size={14} /> Reject Request
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!refunds.filter(r => r.status === 'PENDING_APPROVAL').length && (
                        <tr>
                          <td colSpan={7}>
                            <div className="empty" style={{ padding: '36px 16px' }}>
                              <span><BadgeCheck size={28} color="var(--emerald-600)" /></span>
                              <strong style={{ color: 'var(--navy-900)', marginTop: '8px' }}>Dual-Custody Queue Clear</strong>
                              <p>No refund requests currently require financial authorization. All pending disbursements have been processed.</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Settlement Ledger */}
              <div className="panel table-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Executed Settlement Register</h3>
                    <p>Recent payouts confirmed with gateway authorization references</p>
                  </div>
                  <button className="text-btn" onClick={() => setPage('refunds')}>
                    View All Settlements <ArrowUpRight size={14} />
                  </button>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>REFUND ID</th>
                        <th>TRANSACTION</th>
                        <th>SETTLED AMOUNT</th>
                        <th>PROVIDER REFERENCE</th>
                        <th>STATUS</th>
                        <th>TIMESTAMP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {refunds.filter(r => r.status === 'REFUNDED').slice(0, 5).map(r => (
                        <tr key={r.id}>
                          <td><span className="mono">{r.id.slice(0, 8).toUpperCase()}</span></td>
                          <td><span className="mono">{r.transaction_id}</span></td>
                          <td><strong className="amount">{money(r.amount, r.currency)}</strong></td>
                          <td><span className="mono" style={{ color: 'var(--primary-700)', fontWeight: 600 }}>{r.provider_reference || '—'}</span></td>
                          <td><span className="pill green"><i />SETTLED</span></td>
                          <td><span className="date-cell">{date(r.created_at)}</span></td>
                        </tr>
                      ))}
                      {!refunds.filter(r => r.status === 'REFUNDED').length && (
                        <tr>
                          <td colSpan={6}><Empty text="No settled payouts recorded yet." /></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* CUSTOMER PORTAL OVERVIEW - STRICT DATA ISOLATION */}
          {page === 'dashboard' && user.role === 'customer' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow" style={{ color: 'var(--primary-700)' }}>
                    CUSTOMER SELF-SERVICE REFUND PORTAL
                  </div>
                  <h1>Welcome, {user.full_name}</h1>
                  <p>Track your real-time return requests, inspect verified order receipts, or file an instant refund claim.</p>
                </div>
                <div className="heading-actions">
                  <button className="secondary" onClick={refresh}>
                    <RefreshCw size={15} /> Sync Claims
                  </button>
                  <button className="primary" onClick={() => setPage('new')}>
                    <Plus size={15} /> File New Claim
                  </button>
                </div>
              </div>

              {/* Customer Specific Metrics */}
              <div className="metric-grid" style={{ marginBottom: '24px' }}>
                <Metric
                  icon={<TicketIcon />}
                  label="My Active Claims"
                  value={tickets.filter(t => t.status !== 'RESOLVED' && t.status !== 'REJECTED').length}
                  note="Under review or in evidence triage"
                  tone="blue"
                />
                <Metric
                  icon={<CheckCircle2 />}
                  label="Refunds Credited"
                  value={refunds.filter(r => r.status === 'REFUNDED').length}
                  note="Successfully returned to your account"
                  tone="green"
                />
                <Metric
                  icon={<CircleDollarSign />}
                  label="Total Amount Credited"
                  value={money(refunds.filter(r => r.status === 'REFUNDED').reduce((acc, r) => acc + (Number(r.amount) || 0), 0))}
                  note="Processed via payment gateway"
                  tone="green"
                />
                <Metric
                  icon={<Database />}
                  label="Verified Orders on File"
                  value={customerTxs.length}
                  note="Linked to your registered account"
                  tone="blue"
                />
              </div>

              {/* My Active Claims Tracker */}
              <div className="panel table-panel" style={{ marginBottom: '28px' }}>
                <div className="panel-heading">
                  <div>
                    <h3>My Claims & Return Inquiries</h3>
                    <p>Live progress tracking of your refund claims across verification and review</p>
                  </div>
                  <button className="text-btn" onClick={() => setPage('tickets')}>
                    View All Claims <ArrowUpRight size={14} />
                  </button>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>CLAIM #</th>
                        <th>ORDER & PRODUCT</th>
                        <th>AMOUNT</th>
                        <th>STATUS</th>
                        <th>TRIAGE STAGE</th>
                        <th>SUBMITTED</th>
                        <th>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tickets.map(t => (
                        <tr key={t.id} onClick={() => setSelected(t)} className="click-row">
                          <td>
                            <div className="ticket-id">
                              <span className="ticket-symbol" style={{ background: 'var(--primary-50)', color: 'var(--primary-700)' }}>
                                <TicketIcon size={16} />
                              </span>
                              <div>
                                <strong>{t.ticket_number}</strong>
                                <small className="mono">{t.order_id || '—'}</small>
                              </div>
                            </div>
                          </td>
                          <td>
                            <strong>{t.item_name || t.category.replace(/_/g, ' ')}</strong>
                            <small className="subline">{t.item_category} · {t.description.slice(0, 40)}...</small>
                          </td>
                          <td>
                            <strong className="amount">{money(t.claimed_amount, t.currency)}</strong>
                          </td>
                          <td>
                            <StatusPill value={t.status} />
                          </td>
                          <td>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: t.status === 'RESOLVED' ? 'var(--emerald-700)' : t.status === 'REJECTED' ? 'var(--rose-700)' : 'var(--primary-700)' }}>
                              {t.status === 'RESOLVED' ? '✅ Refund Credited to Bank' :
                               t.status === 'REJECTED' ? '❌ Ineligible under Return Window' :
                               t.status === 'AWAITING_INFORMATION' ? '📲 Evidence / Proof Requested' :
                               '⚙ Automated AI Review'}
                            </span>
                          </td>
                          <td>
                            <span className="date-cell">{new Date(t.created_at).toLocaleDateString()}</span>
                          </td>
                          <td>
                            <button
                              className="secondary compact"
                              onClick={e => {
                                e.stopPropagation()
                                setSelected(t)
                              }}
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!tickets.length && (
                        <tr>
                          <td colSpan={7}>
                            <div className="empty" style={{ padding: '36px 16px' }}>
                              <span><TicketIcon size={28} color="var(--primary-600)" /></span>
                              <strong style={{ color: 'var(--navy-900)', marginTop: '8px' }}>No Active Claims</strong>
                              <p>You have not submitted any return claims yet. Select one of your verified purchases below to request an instant refund.</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Verified Order History & 1-Click Refund Action */}
              <div className="panel table-panel">
                <div className="panel-heading">
                  <div>
                    <h3>My Verified Purchases & Order Receipts</h3>
                    <p>Official merchant orders linked to your profile. Click "Request Refund" to auto-fill your claim details.</p>
                  </div>
                  <span className="pill blue" style={{ padding: '6px 12px', fontSize: '12px' }}>
                    {customerTxs.length} Verified Orders
                  </span>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>ORDER ID</th>
                        <th>TRANSACTION ID</th>
                        <th>ORDER AMOUNT</th>
                        <th>PAYMENT STATUS</th>
                        <th>REFUNDED SO FAR</th>
                        <th>PURCHASE DATE</th>
                        <th>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerTxs.map(tx => {
                        const canRefund = (Number(tx.amount) - Number(tx.refunded_amount)) > 0
                        return (
                          <tr key={tx.id}>
                            <td>
                              <strong style={{ color: 'var(--navy-900)' }}>{tx.order_id}</strong>
                            </td>
                            <td>
                              <span className="mono">{tx.id}</span>
                            </td>
                            <td>
                              <strong className="amount">{money(tx.amount, tx.currency)}</strong>
                            </td>
                            <td>
                              <span className="pill green"><i />{tx.payment_status}</span>
                            </td>
                            <td>
                              <span className="amount" style={{ color: tx.refunded_amount > 0 ? 'var(--emerald-700)' : 'var(--text-muted)' }}>
                                {money(tx.refunded_amount, tx.currency)}
                              </span>
                            </td>
                            <td>
                              <span className="date-cell">{new Date(tx.created_at).toLocaleDateString()}</span>
                            </td>
                            <td>
                              {canRefund ? (
                                <button
                                  className="primary compact"
                                  onClick={() => handleRequestRefundForOrder(tx)}
                                  style={{ background: 'var(--primary-700)', borderColor: 'var(--primary-700)' }}
                                  title="1-Click Pre-populate refund claim"
                                >
                                  <Zap size={13} /> Request Refund
                                </button>
                              ) : (
                                <span className="pill green"><i />FULLY REFUNDED</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                      {!customerTxs.length && (
                        <tr>
                          <td colSpan={7}>
                            <Empty text="No verified purchase records found for your account." />
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* 🟢 CS-1 DESK: GENUINE & REFUNDABLE */}
          {page === 'cs1_desk' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow" style={{ color: 'var(--emerald-700)' }}>🟢 CS-1 FAST-TRACK APPROVALS DESK</div>
                  <h1>Genuine & Refundable Queue</h1>
                  <p>These tickets matched payment records in the ledger and comply with your store policy. You can execute a direct 1-click refund or manually inspect the order details.</p>
                </div>
                <div className="heading-actions">
                  <span className="pill green" style={{ padding: '8px 14px', fontSize: '12px' }}>
                    {cs1Tickets.length} Cases Waiting for CS-1 Action
                  </span>
                </div>
              </div>

              <div className="panel table-panel">
                <div className="panel-heading">
                  <div>
                    <h3>CS-1 Action Queue</h3>
                    <p>Verified cases ready for financial settlement</p>
                  </div>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>TICKET</th>
                        <th>ORDER & ITEM</th>
                        <th>CLAIMED AMOUNT</th>
                        <th>POLICY VERIFICATION</th>
                        <th>STATUS</th>
                        <th>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cs1Tickets.map(t => (
                        <tr key={t.id} onClick={() => setSelected(t)} className="click-row">
                          <td>
                            <div className="ticket-id">
                              <span className="ticket-symbol" style={{ background: 'var(--emerald-50)', color: 'var(--emerald-700)' }}>
                                <CheckCircle2 size={16} />
                              </span>
                              <div>
                                <strong>{t.ticket_number}</strong>
                                <small className="mono">{t.customer_phone || t.customer_email || t.customer_id.slice(0, 8)}</small>
                              </div>
                            </div>
                          </td>
                          <td>
                            <strong>{t.item_name || 'Product Item'}</strong>
                            <small className="subline">{t.order_id || '—'} · {t.item_category}</small>
                          </td>
                          <td className="amount">{money(t.claimed_amount, t.currency)}</td>
                          <td>
                            <span className="pill green"><i />{t.payment_verification}</span>
                            <small className="subline" style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {t.policy_evaluation_reason || 'Verified'}
                            </small>
                          </td>
                          <td><StatusPill value={t.status} /></td>
                          <td>
                            <div className="row-actions" onClick={e => e.stopPropagation()}>
                              {t.status !== 'RESOLVED' && (
                                <>
                                  <button
                                    className="primary compact"
                                    onClick={() => handleCS1DirectRefund(t)}
                                    title="1-Click Direct Refund"
                                    style={{ background: 'var(--emerald-700)', borderColor: 'var(--emerald-700)' }}
                                  >
                                    <Zap size={14} /> 1-Click Refund
                                  </button>
                                  <button
                                    className="secondary compact"
                                    onClick={() => setSelected(t)}
                                    title="Manually Inspect"
                                  >
                                    Inspect & Decide
                                  </button>
                                </>
                              )}
                              {t.status === 'RESOLVED' && <span className="pill green"><i />REFUNDED</span>}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!cs1Tickets.length && (
                        <tr>
                          <td colSpan={6}>
                            <Empty text="No pending genuine cases in the CS-1 queue right now." />
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* 🟡 CS-2 DESK: EXCEPTIONS & PROOF NEEDED */}
          {page === 'cs2_desk' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow" style={{ color: 'var(--amber-700)' }}>🟡 CS-2 EXCEPTION & EVIDENCE DESK</div>
                  <h1>Exceptions & Proof Needed Queue</h1>
                  <p>Cases with order discrepancies, damaged package claims, or missing unboxing proof. The AI has drafted an SMS/email message for the customer's phone.</p>
                </div>
                <div className="heading-actions">
                  <span className="pill amber" style={{ padding: '8px 14px', fontSize: '12px' }}>
                    {cs2Tickets.length} Exception Cases
                  </span>
                </div>
              </div>

              <div className="panel table-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Exceptions Requiring Customer Verification</h3>
                    <p>Review the AI-drafted message and click Send</p>
                  </div>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>TICKET</th>
                        <th>ITEM & DISCREPANCY</th>
                        <th>REQUIRED PROOF</th>
                        <th>DESTINATION</th>
                        <th>PROOF STATUS</th>
                        <th>DISPATCH ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cs2Tickets.map(t => (
                        <tr key={t.id} onClick={() => setSelected(t)} className="click-row">
                          <td>
                            <div className="ticket-id">
                              <span className="ticket-symbol" style={{ background: 'var(--amber-50)', color: 'var(--amber-700)' }}>
                                <AlertTriangle size={16} />
                              </span>
                              <div>
                                <strong>{t.ticket_number}</strong>
                                <small className="mono">{t.order_id || '—'}</small>
                              </div>
                            </div>
                          </td>
                          <td>
                            <strong>{t.item_name || 'Product'}</strong>
                            <small className="subline" style={{ maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {t.policy_evaluation_reason}
                            </small>
                          </td>
                          <td>
                            <span className="queue-cell" style={{ fontSize: '10px' }}>
                              {t.proof_required?.replace(/_/g, ' ') || 'PHOTO PROOF'}
                            </span>
                          </td>
                          <td>
                            <span className="mono" style={{ color: 'var(--navy-900)', fontWeight: 600 }}>
                              {t.customer_phone || t.customer_email || 'Mobile'}
                            </span>
                          </td>
                          <td>
                            <span className={`pill ${t.proof_status === 'REQUESTED' ? 'blue' : 'amber'}`}>
                              <i />{t.proof_status || 'NOT REQUESTED'}
                            </span>
                          </td>
                          <td>
                            <div className="row-actions" onClick={e => e.stopPropagation()}>
                              <button
                                className="primary compact"
                                onClick={() => {
                                  setSelected(t)
                                  handleCS2SendProof(t)
                                }}
                                style={{ background: 'var(--amber-600)', borderColor: 'var(--amber-600)' }}
                              >
                                <Send size={13} /> {t.proof_status === 'REQUESTED' ? 'Resend Proof SMS' : '1-Click Send Proof SMS'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!cs2Tickets.length && (
                        <tr>
                          <td colSpan={6}>
                            <Empty text="No exception cases in the CS-2 queue right now." />
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* 🔴 CS-3 DESK: NON-REFUNDABLE / DENIALS */}
          {page === 'cs3_desk' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow" style={{ color: 'var(--rose-700)' }}>🔴 CS-3 RESOLUTION & POLICY DENIAL DESK</div>
                  <h1>Non-Refundable / Ineligible Cases</h1>
                  <p>Cases disqualified by store policy (expired return window, fake transaction ID, duplicate claim, or non-returnable hygiene items). Polite rejection notice pre-drafted.</p>
                </div>
                <div className="heading-actions">
                  <span className="pill red" style={{ padding: '8px 14px', fontSize: '12px' }}>
                    {cs3Tickets.length} Ineligible Cases
                  </span>
                </div>
              </div>

              <div className="panel table-panel">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>TICKET</th>
                        <th>ITEM & CATEGORY</th>
                        <th>POLICY REJECTION REASON</th>
                        <th>CUSTOMER CONTACT</th>
                        <th>STATUS</th>
                        <th>DISPATCH ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cs3Tickets.map(t => (
                        <tr key={t.id} onClick={() => setSelected(t)} className="click-row">
                          <td>
                            <div className="ticket-id">
                              <span className="ticket-symbol" style={{ background: 'var(--rose-50)', color: 'var(--rose-700)' }}>
                                <X size={16} />
                              </span>
                              <div>
                                <strong>{t.ticket_number}</strong>
                                <small className="mono">{t.order_id || '—'}</small>
                              </div>
                            </div>
                          </td>
                          <td>
                            <strong>{t.item_name || 'Product'}</strong>
                            <small className="subline">{t.item_category}</small>
                          </td>
                          <td>
                            <span style={{ color: 'var(--rose-700)', fontSize: '12px', fontWeight: 600 }}>
                              {t.policy_evaluation_reason}
                            </span>
                          </td>
                          <td>
                            <span className="mono">{t.customer_phone || t.customer_email || 'Customer'}</span>
                          </td>
                          <td><StatusPill value={t.status} /></td>
                          <td>
                            <div className="row-actions" onClick={e => e.stopPropagation()}>
                              <button
                                className="primary compact"
                                onClick={() => {
                                  setSelected(t)
                                  handleCS3SendRejection(t)
                                }}
                                style={{ background: 'var(--rose-600)', borderColor: 'var(--rose-600)' }}
                              >
                                <Send size={13} /> {t.rejection_notice_sent_at ? 'Resend Notice' : '1-Click Send Denial Notice'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!cs3Tickets.length && (
                        <tr>
                          <td colSpan={6}>
                            <Empty text="No ineligible cases in the CS-3 queue right now." />
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* TICKETS QUEUE - STRICTLY ROLE FILTERED */}
          {page === 'tickets' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {user.role === 'cs_1' ? '🟢 CS-1 DESK PIPELINE' :
                     user.role === 'cs_2' ? '🟡 CS-2 DESK PIPELINE' :
                     user.role === 'cs_3' ? '🔴 CS-3 DESK PIPELINE' : 'OMNICHANNEL CASE REPOSITORY'}
                  </div>
                  <h1>
                    {user.role === 'cs_1' ? 'CS-1 Genuine Refund Queue' :
                     user.role === 'cs_2' ? 'CS-2 Exception & Evidence Queue' :
                     user.role === 'cs_3' ? 'CS-3 Denial & Ineligible Queue' : 'Master Ingested Tickets Queue'}
                  </h1>
                  <p>
                    {user.role === 'cs_1' ? 'Showing only verified, policy-compliant claims assigned to the CS-1 fast-track queue.' :
                     user.role === 'cs_2' ? 'Showing only discrepancy, damage, and evidence-pending claims assigned to the CS-2 desk.' :
                     user.role === 'cs_3' ? 'Showing only non-refundable and policy-disqualified claims assigned to the CS-3 desk.' :
                     'Master ledger of all refund cases across CS-1, CS-2, and CS-3 desks.'}
                  </p>
                </div>
              </div>

              <div className="filterbar">
                <div className="searchbox">
                  <Search size={16} />
                  <input
                    placeholder="Search ticket number, transaction, or description…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>

                <div className="select-filter">
                  <Filter size={15} />
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="">All statuses</option>
                    {['NEW', 'TRIAGED', 'IN_REVIEW', 'AWAITING_INFORMATION', 'ESCALATED', 'RESOLVED', 'REJECTED'].map(s => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <button className="secondary compact" onClick={refresh}>
                  <RefreshCw size={15} /> Refresh
                </button>
              </div>

              <TicketTable tickets={displayedTickets} onSelect={setSelected} />
            </>
          )}

          {/* FILE NEW CLAIM (PROFESSIONAL CUSTOMER & STAFF PORTAL) */}
          {page === 'new' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow" style={{ color: 'var(--primary-700)', fontWeight: 800 }}>ONLINE CLAIM &amp; RETURN INTAKE</div>
                  <h1>File a Return or Refund Claim</h1>
                  <p>Submit order details for real-time payment gateway ledger verification, category policy window compliance, and 8-agent automated triage.</p>
                </div>
                <div className="heading-actions">
                  <button className="secondary" onClick={() => setPage(isCustomer ? 'dashboard' : 'tickets')}>
                    Return to {isCustomer ? 'My Dashboard' : 'Tickets'}
                  </button>
                </div>
              </div>

              {/* QUICK RECENT ORDERS SELECTOR (FOR CUSTOMER) */}
              {customerTxs && customerTxs.length > 0 && (
                <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--slate-50)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--navy-900)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Clock3 size={14} color="var(--primary-700)" />
                      1-Click Select From Your Verified Orders:
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Click to auto-fill verified ledger facts</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
                    {customerTxs.map(tx => (
                      <div
                        key={tx.id}
                        onClick={() => handleRequestRefundForOrder(tx)}
                        style={{
                          padding: '10px 12px',
                          background: form.transaction_id === tx.id ? 'var(--primary-50)' : '#ffffff',
                          border: `1px solid ${form.transaction_id === tx.id ? 'var(--primary-600)' : 'var(--border-subtle)'}`,
                          borderRadius: 'var(--radius-md)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: '12px', color: 'var(--navy-900)' }}>{tx.order_id || tx.id}</strong>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--emerald-700)' }}>{money(tx.amount, tx.currency)}</span>
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'monospace' }}>
                          Txn: {tx.id}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* DUAL-COLUMN INTAKE CONTAINER */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px', alignItems: 'start' }}>
                {/* LEFT: PRIMARY INTAKE FORM */}
                <div className="panel" style={{ padding: '24px' }}>
                  <form onSubmit={submitTicket}>
                    <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--navy-900)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <TicketIcon size={18} color="var(--primary-700)" /> Claim Details &amp; Item Specification
                    </h3>

                    <div className="form-grid">
                      {/* Order and Transaction */}
                      <div>
                        <label>Order Reference ID</label>
                        <input
                          placeholder="e.g. ORD-1001"
                          value={form.order_id}
                          onChange={e => setForm({ ...form, order_id: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <label>Transaction ID (Gateway Receipt)</label>
                        <input
                          placeholder="e.g. TXN-1001"
                          value={form.transaction_id}
                          onChange={e => setForm({ ...form, transaction_id: e.target.value })}
                          required
                        />
                      </div>

                      {/* Product Name */}
                      <div className="span-2">
                        <label>Product Name / Item Description</label>
                        <input
                          placeholder="e.g. Executive Leather Laptop Sleeve 15-inch"
                          value={form.item_name}
                          onChange={e => setForm({ ...form, item_name: e.target.value })}
                          required
                        />
                      </div>

                      {/* Product Category Selector */}
                      <div className="span-2">
                        <label style={{ marginBottom: '6px' }}>Product Category &amp; Return Policy Window</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
                          {[
                            { id: 'ELECTRONICS', label: '💻 Electronics', window: '7-Day Policy' },
                            { id: 'APPAREL', label: '👕 Apparel', window: '14-Day Policy' },
                            { id: 'ACCESSORIES', label: '🎒 Accessories', window: '14-Day Policy' },
                            { id: 'PERISHABLES', label: '🍎 Perishables', window: 'Final Sale (0d)' },
                            { id: 'DIGITAL', label: '⚡ Digital / Code', window: 'Non-refundable' },
                          ].map(cat => (
                            <button
                              type="button"
                              key={cat.id}
                              onClick={() => setForm({ ...form, item_category: cat.id })}
                              style={{
                                padding: '8px 10px',
                                borderRadius: 'var(--radius-md)',
                                textAlign: 'left',
                                background: form.item_category === cat.id ? 'var(--primary-50)' : 'var(--slate-50)',
                                border: `1px solid ${form.item_category === cat.id ? 'var(--primary-600)' : 'var(--border-subtle)'}`,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <div style={{ fontSize: '11px', fontWeight: 800, color: form.item_category === cat.id ? 'var(--primary-700)' : 'var(--navy-900)' }}>
                                {cat.label}
                              </div>
                              <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                {cat.window}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Claim Category Reason */}
                      <div className="span-2">
                        <label>Primary Reason for Return</label>
                        <select
                          value={form.category}
                          onChange={e => setForm({ ...form, category: e.target.value })}
                        >
                          <option value="DEFECTIVE_PRODUCT">Defective Product / Hardware Malfunction</option>
                          <option value="PRODUCT_DAMAGED">Damaged in Transit / Broken Packaging</option>
                          <option value="WRONG_ITEM">Received Incorrect Item</option>
                          <option value="SIZE_FIT_ISSUE">Size or Fitting Discrepancy</option>
                          <option value="ORDER_CANCELLED">Order Cancelled Prior to Dispatch</option>
                        </select>
                      </div>

                      {/* Claimed Amount and Currency */}
                      <div>
                        <label>Claimed Refund Amount</label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="1500.00"
                          value={form.claimed_amount}
                          onChange={e => setForm({ ...form, claimed_amount: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <label>Currency</label>
                        <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>
                          <option value="INR">INR (₹)</option>
                          <option value="USD">USD ($)</option>
                          <option value="EUR">EUR (€)</option>
                        </select>
                      </div>

                      {/* Description Statement */}
                      <div className="span-2">
                        <label>Customer Statement &amp; Issue Details</label>
                        <textarea
                          rows={3}
                          placeholder="Explain what happened with the product upon opening or delivery..."
                          value={form.description}
                          onChange={e => setForm({ ...form, description: e.target.value })}
                          required
                        />
                      </div>

                      {/* Photo Evidence & Computer Vision Proof Uploader */}
                      <div className="span-2" style={{ padding: '14px', background: 'var(--slate-50)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--navy-900)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Camera size={14} color="var(--primary-700)" />
                            Photo Proof (Pillow Computer Vision Engine)
                          </span>
                          <span style={{ fontSize: '10px', background: 'var(--emerald-50)', color: 'var(--emerald-700)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                            Agent 7 Verified
                          </span>
                        </div>

                        {/* Drag and Drop Dropzone */}
                        <div style={{
                          border: '2px dashed var(--primary-200)',
                          borderRadius: 'var(--radius-md)',
                          padding: '12px',
                          background: '#ffffff',
                          textAlign: 'center',
                          position: 'relative',
                          cursor: 'pointer',
                          marginBottom: '8px'
                        }}>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleClaimFileUpload}
                            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                            title="Upload real damage photo"
                          />

                          {form.custom_photo_base64 ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', textAlign: 'left' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <img
                                  src={form.custom_photo_base64}
                                  alt="Custom Upload Preview"
                                  style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}
                                />
                                <div>
                                  <strong style={{ fontSize: '12px', color: 'var(--navy-900)', display: 'block', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {form.custom_photo_name || 'custom_uploaded_photo.jpg'}
                                  </strong>
                                  <span style={{ fontSize: '10px', color: 'var(--emerald-600)', fontWeight: 700 }}>
                                    ✓ Live File Loaded for Vision AI Inspection
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation()
                                  setForm(prev => ({ ...prev, custom_photo_base64: '', custom_photo_name: '' }))
                                }}
                                className="icon-btn"
                                title="Remove photo"
                                style={{ color: 'var(--rose-600)' }}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                              <UploadCloud size={24} color="var(--primary-600)" />
                              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--navy-800)' }}>
                                Click or drag real defect image here
                              </span>
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                PNG, JPG, or WEBP • Inspected for physical edge fractures &amp; EXIF tampering
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Defect Preset Dropdown */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            Or Select Preset Sample:
                          </span>
                          <select
                            value={form.evidence_image_preset}
                            onChange={e => setForm({ ...form, evidence_image_preset: e.target.value, custom_photo_base64: '', custom_photo_name: '' })}
                            style={{ fontSize: '11px', padding: '4px 8px', height: 'auto', background: '#ffffff' }}
                          >
                            <option value="stitching_loose_zipper.jpg">📸 stitching_loose_zipper.jpg (Seam Fracture Defect)</option>
                            <option value="earcup_cushion_tear.jpg">📸 earcup_cushion_tear.jpg (Acoustic Hardware Tear)</option>
                            <option value="damage_broken_box.jpg">📦 damage_broken_box.jpg (Transit Package Damage)</option>
                            <option value="shipping_label_barcode.jpg">🏷️ shipping_label_barcode.jpg (Serial/Box Label Proof)</option>
                            <option value="clean_unopened_package.jpg">📦 clean_unopened_package.jpg (Unopened Product Photo)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: '20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <button className="primary" type="submit" disabled={busy} style={{ flex: 1, padding: '12px 18px', fontSize: '13px' }}>
                        <Send size={15} /> Submit Claim to RITOS 8-Agent Orchestrator
                      </button>
                      <button className="secondary" type="button" onClick={() => setPage(isCustomer ? 'dashboard' : 'tickets')}>
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>

                {/* RIGHT: AUTONOMOUS TRIAGE RADAR & POLICY RULES */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Decision Tree Routing Radar */}
                  <div style={{
                    background: '#0f172a',
                    borderRadius: 'var(--radius-lg)',
                    padding: '20px',
                    color: '#ffffff',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
                    border: '1px solid #1e293b'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <GitFork size={15} /> 3-Step Decision Tree Architecture
                      </span>
                      <span style={{ fontSize: '10px', background: 'rgba(56, 189, 248, 0.2)', color: '#7dd3fc', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>
                        v2.6 Real Engine
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '11px' }}>
                      {/* Step 1 */}
                      <div style={{ padding: '10px 12px', background: 'rgba(30, 41, 59, 0.7)', borderRadius: '8px', borderLeft: '3px solid #10b981' }}>
                        <strong style={{ color: '#6ee7b7', display: 'block' }}>Step 1: Ledger Verification</strong>
                        <span style={{ color: '#cbd5e1' }}>Does transaction exist in payment gateway? Is unrefunded balance &gt; claimed amount?</span>
                      </div>

                      {/* Step 2 */}
                      <div style={{ padding: '10px 12px', background: 'rgba(30, 41, 59, 0.7)', borderRadius: '8px', borderLeft: '3px solid #3b82f6' }}>
                        <strong style={{ color: '#93c5fd', display: 'block' }}>Step 2: Category Policy Window</strong>
                        <span style={{ color: '#cbd5e1' }}>Is filing date within category limit (Electronics: 7d, Apparel: 14d, Perishable: 0d)?</span>
                      </div>

                      {/* Step 3 */}
                      <div style={{ padding: '10px 12px', background: 'rgba(30, 41, 59, 0.7)', borderRadius: '8px', borderLeft: '3px solid #f59e0b' }}>
                        <strong style={{ color: '#fcd34d', display: 'block' }}>Step 3: Risk &amp; Proof Inspection</strong>
                        <span style={{ color: '#cbd5e1' }}>Velocity check (&lt; 3 claims/30d), Pillow edge anomaly analysis, and EXIF authenticity.</span>
                      </div>
                    </div>
                  </div>

                  {/* Expected Destination Desks */}
                  <div className="panel" style={{ padding: '18px' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 800, color: 'var(--navy-900)', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <BrainCircuit size={15} color="var(--primary-700)" />
                      Expected Desk Routing
                    </h4>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--emerald-50)', borderRadius: '6px', border: '1px solid var(--emerald-100)' }}>
                        <strong style={{ color: 'var(--emerald-800)' }}>🟢 CS-1 (Fast-Track)</strong>
                        <span style={{ color: 'var(--emerald-700)' }}>1-Click Auto Payout</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--amber-50)', borderRadius: '6px', border: '1px solid var(--amber-100)' }}>
                        <strong style={{ color: 'var(--amber-800)' }}>🟡 CS-2 (Exceptions)</strong>
                        <span style={{ color: 'var(--amber-700)' }}>Photo Proof / Human Inspection</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--rose-50)', borderRadius: '6px', border: '1px solid var(--rose-100)' }}>
                        <strong style={{ color: 'var(--rose-800)' }}>🔴 CS-3 (Denials)</strong>
                        <span style={{ color: 'var(--rose-700)' }}>Policy Window Expired / Ineligible</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ECOMMERCE INTEGRATION HUB (ADMINISTRATOR & SUPERVISOR ONLY) */}
          {page === 'ecommerce' && (
            !['administrator', 'supervisor'].includes(user.role) ? (
              <div className="panel" style={{ padding: '48px 24px', textAlign: 'center', maxWidth: '580px', margin: '48px auto' }}>
                <ShieldAlert size={44} color="var(--rose-600)" style={{ margin: '0 auto 16px' }} />
                <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--navy-900)' }}>Administrator Access Required</h2>
                <p style={{ color: 'var(--navy-600)', margin: '10px 0 24px', lineHeight: 1.6, fontSize: '14px' }}>
                  The eCommerce Webhook Hub, server-to-server API secrets, and live store simulation engine are strictly restricted to Platform Administrators and Supervisors.
                </p>
                <button
                  className="primary"
                  onClick={() => setPage(user.role === 'cs_1' ? 'cs1_desk' : user.role === 'cs_2' ? 'cs2_desk' : user.role === 'cs_3' ? 'cs3_desk' : 'dashboard')}
                >
                  Return to My Workspace
                </button>
              </div>
            ) : (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">ECOMMERCE WEBHOOK & INTEGRATION API</div>
                    <h1>Connect Your eCommerce Store</h1>
                    <p>ShopFlow storefront integration and custom eCommerce webhooks. Server-to-server refund event ingestion with instant multi-agent triage.</p>
                  </div>
                </div>

                {/* Native ShopFlow Integration Card */}
                <div className="panel" style={{ padding: '24px', marginBottom: '24px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ maxWidth: '640px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>
                        <Database size={16} /> Native eCommerce Integration
                      </div>
                      <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                        ShopFlow Storefront Connection
                      </h2>
                      <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
                        ShopFlow acts as the System of Record (SoR). RITOS autonomously receives refund events, fetches rich claim context dossiers, runs the 8 specialist agents, and submits payment execution callbacks.
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <button
                        className="primary"
                        onClick={handleSyncShopflow}
                        disabled={syncingShopflow}
                        style={{ background: '#2563eb', borderColor: '#3b82f6', display: 'flex', alignItems: 'center', gap: '8px' }}
                      >
                        <RefreshCw size={14} className={syncingShopflow ? 'spin' : ''} />
                        <span>{syncingShopflow ? 'Syncing ShopFlow...' : 'Sync Pending ShopFlow Tickets'}</span>
                      </button>
                      <button
                        className="secondary"
                        onClick={handleSimulateShopflowWebhook}
                        disabled={busy}
                        style={{ background: 'rgba(255,255,255,0.1)', color: '#f8fafc', borderColor: 'rgba(255,255,255,0.2)' }}
                      >
                        <Zap size={14} /> Test ShopFlow Webhook Ingestion
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', fontSize: '12px' }}>
                    <div>
                      <small style={{ color: '#94a3b8', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>ShopFlow Instance URL</small>
                      <strong style={{ color: '#ffffff', fontFamily: 'var(--font-mono)' }}>{shopflowStatus?.shopflow_base_url || 'http://localhost:3000'}</strong>
                    </div>
                    <div>
                      <small style={{ color: '#94a3b8', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Connection State</small>
                      <span className={`pill ${shopflowStatus?.connected ? 'green' : 'amber'}`}>
                        <i />{shopflowStatus?.connected ? 'CONNECTED (HTTP 200)' : 'STANDBY / LISTENING'}
                      </span>
                    </div>
                    <div>
                      <small style={{ color: '#94a3b8', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>RITOS Webhook Target</small>
                      <code style={{ color: '#38bdf8' }}>http://localhost:8000/webhook/refund-tickets</code>
                    </div>
                    <div>
                      <small style={{ color: '#94a3b8', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Decision Callback</small>
                      <code style={{ color: '#34d399' }}>POST /api/ritos/refund-decision</code>
                    </div>
                  </div>
                </div>

              <div className="dashboard-grid">
                {/* Simulator */}
                <div className="panel" style={{ padding: '24px' }}>
                  <div className="panel-heading" style={{ padding: '0 0 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div>
                      <h3>Simulate Incoming eCommerce Ticket</h3>
                      <p>Send a test order payload to observe instant multi-agent triage</p>
                    </div>
                  </div>

                  <div className="form-grid" style={{ marginTop: '16px' }}>
                    <div>
                      <label>Order ID</label>
                      <input value={simEcom.order_id} onChange={e => setSimEcom({ ...simEcom, order_id: e.target.value })} />
                    </div>
                    <div>
                      <label>Transaction ID</label>
                      <input value={simEcom.transaction_id} onChange={e => setSimEcom({ ...simEcom, transaction_id: e.target.value })} />
                    </div>
                    <div>
                      <label>Customer Name</label>
                      <input value={simEcom.customer_name} onChange={e => setSimEcom({ ...simEcom, customer_name: e.target.value })} />
                    </div>
                    <div>
                      <label>Customer Mobile Phone</label>
                      <input value={simEcom.customer_phone} onChange={e => setSimEcom({ ...simEcom, customer_phone: e.target.value })} />
                    </div>
                    <div>
                      <label>Product Item Name</label>
                      <input value={simEcom.item_name} onChange={e => setSimEcom({ ...simEcom, item_name: e.target.value })} />
                    </div>
                    <div>
                      <label>Product Category</label>
                      <select value={simEcom.item_category} onChange={e => setSimEcom({ ...simEcom, item_category: e.target.value })}>
                        <option value="ELECTRONICS">ELECTRONICS (7-day window)</option>
                        <option value="APPAREL">APPAREL (14-day window)</option>
                        <option value="PERISHABLE">PERISHABLE (Final sale / 0d)</option>
                        <option value="HYGIENE">HYGIENE (Non-returnable / 0d)</option>
                        <option value="GENERAL">GENERAL (14-day window)</option>
                      </select>
                    </div>
                    <div className="span-2">
                      <label>Claimed Amount (INR)</label>
                      <input type="number" value={simEcom.claimed_amount} onChange={e => setSimEcom({ ...simEcom, claimed_amount: e.target.value })} />
                    </div>
                    <div className="span-2">
                      <label>Customer Complaint Description</label>
                      <textarea rows={2} value={simEcom.description} onChange={e => setSimEcom({ ...simEcom, description: e.target.value })} />
                    </div>
                  </div>

                  <button className="primary" style={{ marginTop: '16px' }} onClick={handleSimulateEcom} disabled={busy}>
                    <Send size={15} /> Simulate eCommerce Webhook Ingestion
                  </button>

                  {ecomSimResult && (
                    <div style={{ marginTop: '20px', padding: '16px', background: 'var(--navy-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                      <strong>🎉 Ingestion Output:</strong>
                      <div style={{ marginTop: '8px', display: 'grid', gap: '6px', fontSize: '13px' }}>
                        <div><strong>Assigned Desk:</strong> <span className="pill blue" style={{ marginLeft: '6px' }}>{ecomSimResult.assigned_desk}</span></div>
                        <div><strong>Decision Bucket:</strong> <b>{ecomSimResult.decision_bucket}</b></div>
                        <div><strong>Policy Reason:</strong> <span>{ecomSimResult.policy_evaluation_reason}</span></div>
                        <div><strong>Auto-Drafted Message:</strong> <p style={{ margin: '4px 0', fontSize: '12px', color: 'var(--navy-700)', fontStyle: 'italic' }}>"{ecomSimResult.customer_message_draft}"</p></div>
                      </div>
                    </div>
                  )}
                </div>

                {/* API Code Guide for Vercel/Render */}
                <div className="panel" style={{ padding: '24px' }}>
                  <div className="panel-heading" style={{ padding: '0 0 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div>
                      <h3>Render / Vercel Webhook Code</h3>
                      <p>Copy this Node.js / Python snippet into your eCommerce backend</p>
                    </div>
                  </div>

                  <div style={{ marginTop: '16px' }}>
                    <small style={{ fontWeight: 700, color: 'var(--navy-700)', textTransform: 'uppercase', fontSize: '11px' }}>
                      POST Endpoint URL
                    </small>
                    <div style={{ padding: '10px 12px', background: 'var(--navy-900)', color: '#93c5fd', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)', fontSize: '12px', margin: '6px 0 16px' }}>
                      http://localhost:8000/api/v1/integrations/ecommerce/ticket
                    </div>

                    <small style={{ fontWeight: 700, color: 'var(--navy-700)', textTransform: 'uppercase', fontSize: '11px' }}>
                      Node.js / Express Example (Vercel Backend)
                    </small>
                    <pre style={{ padding: '14px', background: 'var(--navy-900)', color: '#f1f5f9', borderRadius: 'var(--radius-md)', fontSize: '11px', overflowX: 'auto', lineHeight: '1.5' }}>
{`// In your eCommerce Backend (Render / Vercel):
await fetch('http://YOUR_RITOS_URL/api/v1/integrations/ecommerce/ticket', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Ecommerce-Secret': process.env.ECOMMERCE_WEBHOOK_SECRET
  },
  body: JSON.stringify({
    order_id: order.id,
    transaction_id: order.payment_reference,
    customer_name: customer.name,
    customer_phone: customer.phone,
    item_name: item.title,
    item_category: item.category, // 'ELECTRONICS' | 'APPAREL'
    claimed_amount: item.price,
    purchase_date: order.created_at,
    description: refundRequest.user_reason
  })
});`}
                    </pre>
                  </div>
                </div>
              </div>
            </>
            )
          )}

          {/* FINANCE APPROVALS QUEUE */}
          {page === 'finance_queue' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">FINANCE CLEARING HOUSE</div>
                  <h1>💰 Finance Approvals &amp; Payout Execution</h1>
                  <p>Review policy-approved refunds and execute real-time payment gateway payouts.</p>
                </div>
              </div>

              <div className="panel table-panel">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>TICKET #</th>
                        <th>ORDER ID</th>
                        <th>PRODUCT / ITEM</th>
                        <th>AMOUNT</th>
                        <th>DESK / STATUS</th>
                        <th>LEDGER VERIFICATION</th>
                        <th>PAYOUT STATUS</th>
                        <th>FINANCE ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tickets
                        .filter(t => t.decision_bucket === 'GENUINE_REFUNDABLE' || t.assigned_desk === 'CS_1')
                        .map(t => (
                          <tr key={t.id} onClick={() => setSelected(t)} style={{ cursor: 'pointer' }}>
                            <td><span className="mono bold">{t.ticket_number}</span></td>
                            <td><span className="mono">{t.order_id || '—'}</span></td>
                            <td><strong>{t.item_name || t.category}</strong></td>
                            <td className="amount">{money(t.claimed_amount, t.currency)}</td>
                            <td>
                              <span className="pill green"><i />{t.assigned_desk} ({t.status})</span>
                            </td>
                            <td>
                              <span className={`pill ${t.payment_verification === 'VERIFIED' ? 'green' : 'amber'}`}>
                                <i />{t.payment_verification}
                              </span>
                            </td>
                            <td>
                              {t.refund_status === 'REFUNDED' ? (
                                <span className="pill green"><i />SETTLED</span>
                              ) : (
                                <span className="pill amber"><i />AWAITING PAYOUT</span>
                              )}
                            </td>
                            <td onClick={e => e.stopPropagation()}>
                              {t.refund_status === 'REFUNDED' ? (
                                <span style={{ color: 'var(--emerald-700)', fontWeight: 700, fontSize: '11px' }}>
                                  ✓ Payout Executed
                                </span>
                              ) : (
                                <button
                                  className="primary compact"
                                  onClick={() => handleAuthorizePayout(t)}
                                  disabled={busy}
                                  style={{ background: 'var(--emerald-600)', borderColor: 'var(--emerald-600)', fontSize: '11px' }}
                                >
                                  ⚡ Authorize Payout ({money(t.claimed_amount, t.currency)})
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      {!tickets.filter(t => t.decision_bucket === 'GENUINE_REFUNDABLE' || t.assigned_desk === 'CS_1').length && (
                        <tr>
                          <td colSpan={8}><Empty text="No tickets currently awaiting finance payout authorization." /></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* REFUND OPERATIONS REGISTER */}
          {page === 'refunds' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">FINANCIAL GOVERNANCE</div>
                  <h1>{user.role === 'finance_approver' ? 'Refund Authorization Register' : 'Settlement Register'}</h1>
                  <p>All executed and approved payment settlements across the payment gateway.</p>
                </div>
              </div>

              <div className="panel table-panel">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>REFUND ID</th>
                        <th>AMOUNT</th>
                        <th>STATUS</th>
                        <th>PROVIDER REF.</th>
                        <th>REASON</th>
                        <th>DATE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {refunds.map(r => (
                        <tr key={r.id}>
                          <td><span className="mono">{r.id.slice(0, 8).toUpperCase()}</span></td>
                          <td className="amount">{money(r.amount, r.currency)}</td>
                          <td><StatusPill value={r.status} /></td>
                          <td><span className="mono">{r.provider_reference || '—'}</span></td>
                          <td style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.reason}</td>
                          <td><span className="date-cell">{date(r.created_at)}</span></td>
                        </tr>
                      ))}
                      {!refunds.length && (
                        <tr>
                          <td colSpan={6}><Empty text="No executed refunds recorded yet." /></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* 8 SPECIALIST AGENTS REGISTRY */}
          {page === 'automation' && (
            !['administrator', 'supervisor', 'cs_1', 'cs_2', 'cs_3', 'refund_operations', 'finance_approver'].includes(user.role) ? (
              <div className="panel" style={{ padding: '48px 24px', textAlign: 'center', maxWidth: '580px', margin: '48px auto' }}>
                <ShieldAlert size={44} color="var(--rose-600)" style={{ margin: '0 auto 16px' }} />
                <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--navy-900)' }}>Internal Operations Access Required</h2>
                <p style={{ color: 'var(--navy-600)', margin: '10px 0 24px', lineHeight: 1.6, fontSize: '14px' }}>
                  The 8 Specialist Agents Registry and pipeline control plane are restricted to operational staff and administrators.
                </p>
                <button
                  className="primary"
                  onClick={() => setPage('dashboard')}
                >
                  Return to Dashboard
                </button>
              </div>
            ) : (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">AUTOMATION CONTROL PLANE</div>
                    <h1>8 Specialist Agents Registry</h1>
                    <p>Autonomous verification and classification agents coordinated by the Central Workflow Orchestrator.</p>
                  </div>
                  <div className="heading-actions">
                    <button
                      className="primary"
                      onClick={handleRunAllAgents}
                      disabled={runningAllAgents}
                      style={{ background: '#2563eb', borderColor: '#3b82f6', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      {runningAllAgents ? <RefreshCw size={15} className="spin" /> : <Play size={15} />}
                      <span>{runningAllAgents ? 'Executing 8 Agents...' : '▶ Run All 8 Agents Across Active Tickets'}</span>
                    </button>
                  </div>
                </div>

                {/* Orchestrator Trigger & Telemetry Banner */}
                <div className="panel" style={{ padding: '22px 24px', marginBottom: '24px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ maxWidth: '620px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>
                        <BrainCircuit size={16} /> Autonomous Multi-Agent Orchestration
                      </div>
                      <h2 style={{ fontSize: '19px', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                        Deterministic Verification & AI Classification Pipeline
                      </h2>
                      <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
                        Instantly triggers the deterministic ledger audit, duplicate matcher, category return window evaluator, fraud signal analyzer, and AI message drafter across active tickets.
                      </p>
                    </div>

                    <button
                      className="primary"
                      onClick={handleRunAllAgents}
                      disabled={runningAllAgents}
                      style={{ background: '#2563eb', borderColor: '#3b82f6', padding: '12px 22px', fontSize: '13px', fontWeight: 700, borderRadius: 'var(--radius-md)', display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 14px rgba(37,99,235,0.4)' }}
                    >
                      {runningAllAgents ? <RefreshCw size={16} className="spin" /> : <Play size={16} />}
                      <span>{runningAllAgents ? 'Executing 8 Agents Pipeline...' : '▶ Run All 8 AI Agents Now'}</span>
                    </button>
                  </div>

                  {allAgentsResult && (
                    <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span className="pill green"><i />ORCHESTRATOR COMPLETED</span>
                        <span style={{ fontSize: '13px', color: '#e2e8f0' }}>
                          Processed <strong>{allAgentsResult.processed_count}</strong> active tickets through <strong>{allAgentsResult.agents_count}</strong> specialist agents
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <span className="pill green"><i />CS-1 Genuine</span>
                        <span className="pill amber"><i />CS-2 Exceptions</span>
                        <span className="pill red"><i />CS-3 Ineligible</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                  {AGENT_CATALOG.map((agent, i) => (
                    <div key={agent.id} className="metric-card click-row" onClick={() => setActiveAgentModal(agent)}>
                      <div className="metric-top">
                        <span className="metric-icon blue"><BrainCircuit size={18} /></span>
                        <span className="pill green"><i />AGENT {i + 1}</span>
                      </div>
                      <div className="metric-label">{agent.mode}</div>
                      <div className="metric-value" style={{ fontSize: '15px', margin: '4px 0' }}>{agent.name}</div>
                      <div className="metric-note">{agent.purpose}</div>
                    </div>
                  ))}
                </div>
              </>
            )
          )}

          {/* AUDIT TRAIL (COMPLIANCE & GOVERNANCE ROLES ONLY) */}
          {page === 'audit' && (
            !['administrator', 'supervisor', 'auditor', 'finance_approver'].includes(user.role) ? (
              <div className="panel" style={{ padding: '48px 24px', textAlign: 'center', maxWidth: '580px', margin: '48px auto' }}>
                <ShieldAlert size={44} color="var(--rose-600)" style={{ margin: '0 auto 16px' }} />
                <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--navy-900)' }}>Compliance Role Required</h2>
                <p style={{ color: 'var(--navy-600)', margin: '10px 0 24px', lineHeight: 1.6, fontSize: '14px' }}>
                  The Append-Only Audit Trail is restricted to System Administrators, Compliance Officers, and Financial Approvers.
                </p>
                <button
                  className="primary"
                  onClick={() => setPage(user.role === 'cs_1' ? 'cs1_desk' : user.role === 'cs_2' ? 'cs2_desk' : user.role === 'cs_3' ? 'cs3_desk' : 'dashboard')}
                >
                  Return to My Workspace
                </button>
              </div>
            ) : (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">COMPLIANCE & GOVERNANCE</div>
                    <h1>Append-Only Audit Trail</h1>
                    <p>Permanent ledger of all triage runs, desk dispatches, and refund executions.</p>
                  </div>
                </div>

              <div className="panel table-panel">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>TIMESTAMP</th>
                        <th>ACTOR</th>
                        <th>ACTION</th>
                        <th>ENTITY</th>
                        <th>DETAILS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audit.map(a => (
                        <tr key={a.id}>
                          <td><span className="date-cell">{date(a.created_at)}</span></td>
                          <td><span className="mono">{a.actor_id?.slice(0, 8) || 'SYSTEM'}</span></td>
                          <td><strong>{a.action}</strong></td>
                          <td>{a.entity_type} · <span className="mono">{a.entity_id?.slice(0, 8)}</span></td>
                          <td><code style={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }}>{JSON.stringify(a.details)}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
            )
          )}
        </div>

        <footer className="footer">
          <span>© 2026 RITOS · Automated eCommerce Refund Layer</span>
          <span><Shield size={14} /> Production Grade · Local Active</span>
        </footer>
      </main>

      {/* --- TICKET DETAILS / DESK ACTION DRAWER --- */}
      {selected && (
        <div className="drawer-backdrop" onClick={() => setSelected(null)}>
          <aside className="ticket-drawer" onClick={e => e.stopPropagation()} style={{ width: 'min(680px, 100%)' }}>
            <div className="drawer-top">
              <div>
                <div className="eyebrow">
                  ASSIGNED DESK: <strong style={{ color: selected.assigned_desk === 'CS_1' ? 'var(--emerald-700)' : selected.assigned_desk === 'CS_2' ? 'var(--amber-700)' : 'var(--rose-700)' }}>
                    {selected.assigned_desk} ({selected.decision_bucket?.replace(/_/g, ' ')})
                  </strong>
                </div>
                <h2>{selected.ticket_number}</h2>
              </div>
              <button className="icon-btn" onClick={() => setSelected(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="drawer-scroll">
              <div className="drawer-badges">
                <StatusPill value={selected.status} />
                <PriorityPill value={selected.priority} />
                <span className="pill blue"><i />{selected.item_category}</span>
              </div>

              <h3>{selected.item_name || selected.category.replace(/_/g, ' ')}</h3>
              <p className="ticket-description">{selected.description}</p>

              {/* 3-STEP DECISION FLOWCHART (ARCHITECTURAL ROUTING TREE) */}
              <div style={{
                background: '#0f172a',
                borderRadius: 'var(--radius-lg)',
                padding: '16px',
                color: '#f8fafc',
                marginBottom: '20px',
                border: '1px solid #1e293b',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 800, color: '#a5b4fc' }}>
                    <GitFork size={15} /> RITOS 3-Step Routing Decision Tree
                  </div>
                  <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#94a3b8' }}>
                    Step 1 ➔ Step 2 ➔ Step 3
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                  {/* Step 1: Ledger Verification */}
                  <div style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    background: selected.classification_evidence?.routing_steps?.step_1?.status === 'PASSED' || selected.payment_verification === 'VERIFIED' ? 'rgba(6, 78, 59, 0.45)' : 'rgba(136, 19, 55, 0.45)',
                    border: `1px solid ${selected.classification_evidence?.routing_steps?.step_1?.status === 'PASSED' || selected.payment_verification === 'VERIFIED' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#ffffff' }}>1. Ledger Verification</span>
                      <span style={{
                        fontSize: '9px',
                        fontWeight: 800,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: selected.classification_evidence?.routing_steps?.step_1?.status === 'PASSED' || selected.payment_verification === 'VERIFIED' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)',
                        color: selected.classification_evidence?.routing_steps?.step_1?.status === 'PASSED' || selected.payment_verification === 'VERIFIED' ? '#6ee7b7' : '#fda4af'
                      }}>
                        {selected.classification_evidence?.routing_steps?.step_1?.status || (selected.payment_verification === 'VERIFIED' ? 'PASSED' : 'FAILED')}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '11px', color: '#cbd5e1', lineHeight: '1.4' }}>
                      {selected.classification_evidence?.routing_steps?.step_1?.summary || (selected.payment_verification === 'VERIFIED' ? 'Transaction 100% verified in gateway ledger.' : 'Ghost txn or already fully refunded.')}
                    </p>
                  </div>

                  {/* Step 2: Policy Window */}
                  <div style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    background: selected.classification_evidence?.routing_steps?.step_2?.status === 'WITHIN_WINDOW' || selected.assigned_desk !== 'CS_3' ? 'rgba(6, 78, 59, 0.45)' : 'rgba(136, 19, 55, 0.45)',
                    border: `1px solid ${selected.classification_evidence?.routing_steps?.step_2?.status === 'WITHIN_WINDOW' || selected.assigned_desk !== 'CS_3' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#ffffff' }}>2. Policy Window</span>
                      <span style={{
                        fontSize: '9px',
                        fontWeight: 800,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: selected.classification_evidence?.routing_steps?.step_2?.status === 'WITHIN_WINDOW' || selected.assigned_desk !== 'CS_3' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)',
                        color: selected.classification_evidence?.routing_steps?.step_2?.status === 'WITHIN_WINDOW' || selected.assigned_desk !== 'CS_3' ? '#6ee7b7' : '#fda4af'
                      }}>
                        {selected.classification_evidence?.routing_steps?.step_2?.status || (selected.assigned_desk === 'CS_3' ? 'EXPIRED' : 'WITHIN WINDOW')}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '11px', color: '#cbd5e1', lineHeight: '1.4' }}>
                      {selected.classification_evidence?.routing_steps?.step_2?.summary || (selected.assigned_desk === 'CS_3' ? 'Expired past category window or final sale item.' : 'Filing date is within return policy window.')}
                    </p>
                  </div>

                  {/* Step 3: Risk & Evidence */}
                  <div style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    background: selected.assigned_desk === 'CS_1' ? 'rgba(6, 78, 59, 0.45)' : (selected.assigned_desk === 'CS_2' ? 'rgba(120, 53, 15, 0.45)' : 'rgba(136, 19, 55, 0.45)'),
                    border: `1px solid ${selected.assigned_desk === 'CS_1' ? 'rgba(16, 185, 129, 0.3)' : (selected.assigned_desk === 'CS_2' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(244, 63, 94, 0.3)')}`
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#ffffff' }}>3. Risk &amp; Proof</span>
                      <span style={{
                        fontSize: '9px',
                        fontWeight: 800,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: selected.assigned_desk === 'CS_1' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)',
                        color: selected.assigned_desk === 'CS_1' ? '#6ee7b7' : '#fcd34d'
                      }}>
                        {selected.classification_evidence?.routing_steps?.step_3?.status || (selected.assigned_desk === 'CS_1' ? 'ALL CLEAR' : 'FLAGGED / PROOF')}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '11px', color: '#cbd5e1', lineHeight: '1.4' }}>
                      {selected.classification_evidence?.routing_steps?.step_3?.summary || (selected.assigned_desk === 'CS_1' ? 'Genuine claim; zero risk flags; verified.' : 'Exception or physical proof required.')}
                    </p>
                  </div>
                </div>
              </div>

              {/* ACTION BOX FOR CS-1 (GENUINE / REFUNDABLE) */}
              {selected.decision_bucket === 'GENUINE_REFUNDABLE' && (
                <div style={{ background: 'var(--emerald-50)', border: '1px solid var(--emerald-100)', padding: '18px', borderRadius: 'var(--radius-lg)', marginBottom: '22px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--emerald-700)', fontWeight: 800, fontSize: '14px', marginBottom: '8px' }}>
                    <CheckCircle2 size={18} /> CS-1 Fast-Track Actions
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--emerald-800)', margin: '0 0 14px', lineHeight: '1.5' }}>
                    {selected.policy_evaluation_reason}
                  </p>

                  {selected.status !== 'RESOLVED' ? (
                    <div>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button
                          className="primary"
                          onClick={() => handleCS1DirectRefund(selected)}
                          disabled={busy}
                          style={{ background: 'var(--emerald-700)', borderColor: 'var(--emerald-700)' }}
                        >
                          <Zap size={15} /> 1-Click Direct Refund ({money(selected.claimed_amount, selected.currency)})
                        </button>

                        <button
                          className="secondary"
                          onClick={() => setShowCancelPrompt(!showCancelPrompt)}
                        >
                          Manual Verify & Cancel
                        </button>
                      </div>

                      {showCancelPrompt && (
                        <div style={{ marginTop: '14px', padding: '14px', background: '#ffffff', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--rose-700)' }}>
                            Reason for Cancelling / Denying Refund:
                          </label>
                          <textarea
                            rows={2}
                            value={manualCancelReason}
                            onChange={e => setManualCancelReason(e.target.value)}
                            placeholder="e.g. Package was already delivered intact per courier tracking proof…"
                            style={{ width: '100%', marginTop: '6px' }}
                          />
                          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                            <button
                              className="primary compact"
                              onClick={() => handleCS1ManualDecide(selected, 'CANCEL')}
                              style={{ background: 'var(--rose-600)', borderColor: 'var(--rose-600)' }}
                            >
                              Confirm Denial
                            </button>
                            <button className="secondary compact" onClick={() => setShowCancelPrompt(false)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontWeight: 700, color: 'var(--emerald-700)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Check size={16} /> Refund has already been executed for this case.
                    </div>
                  )}
                </div>
              )}

              {/* ACTION BOX FOR CS-2 (EXCEPTIONS / PROOF NEEDED) */}
              {selected.decision_bucket === 'EXCEPTIONAL_PROOF_NEEDED' && (
                <div style={{ background: 'var(--amber-50)', border: '1px solid var(--amber-100)', padding: '18px', borderRadius: 'var(--radius-lg)', marginBottom: '22px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--amber-700)', fontWeight: 800, fontSize: '14px', marginBottom: '8px' }}>
                    <AlertTriangle size={18} /> CS-2 Exception Dispatcher
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--amber-800)', margin: '0 0 12px' }}>
                    <strong>Discrepancy:</strong> {selected.policy_evaluation_reason}
                  </p>

                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--navy-800)', display: 'block', marginBottom: '4px' }}>
                    AI Pre-Drafted Message to Customer ({selected.customer_phone || selected.customer_email || 'Mobile'}):
                  </label>
                  <textarea
                    rows={4}
                    value={draftMessage}
                    onChange={e => setDraftMessage(e.target.value)}
                    style={{ width: '100%', background: '#ffffff', border: '1px solid var(--amber-200)', borderRadius: 'var(--radius-md)', padding: '10px', fontSize: '12px' }}
                  />

                  {/* Photo Proof & Visual Evidence Inspection with Real Image Render */}
                  {(selected.classification_evidence?.visual_analysis?.has_visual_proof || (selected.classification_evidence?.evidence_images && selected.classification_evidence.evidence_images.length > 0)) && (
                    <div style={{ marginTop: '14px', padding: '14px', background: '#ffffff', borderRadius: 'var(--radius-md)', border: '1px solid var(--amber-200)', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--navy-900)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Camera size={15} color="var(--indigo-600)" />
                          Customer Photo Proof (Agent 7 Computer Vision Engine)
                        </span>
                        <span className={`pill ${selected.proof_status === 'PROOF_VERIFIED' ? 'green' : 'amber'}`}>
                          <i />{selected.proof_status}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                        {/* Real Image Preview */}
                        {(selected.classification_evidence?.visual_analysis?.image_preview_url || 
                          (typeof selected.classification_evidence?.evidence_images?.[0] === 'string' && selected.classification_evidence?.evidence_images?.[0].startsWith('data:image'))) && (
                          <div style={{ width: '120px', height: '120px', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-subtle)', flexShrink: 0, position: 'relative', background: '#f8fafc' }}>
                            <img 
                              src={selected.classification_evidence?.visual_analysis?.image_preview_url || selected.classification_evidence?.evidence_images?.[0]} 
                              alt="Customer Defect Proof" 
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                            <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(15,23,42,0.75)', color: '#ffffff', fontSize: '9px', textAlign: 'center', padding: '2px 0', fontFamily: 'monospace' }}>
                              Pillow Verified
                            </span>
                          </div>
                        )}

                        {/* Vision Metrics Breakdown */}
                        <div style={{ flex: 1, fontSize: '11px', color: 'var(--navy-700)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                            <div style={{ padding: '6px 8px', background: 'var(--slate-50)', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                              <span style={{ color: 'var(--text-muted)', fontSize: '10px', display: 'block' }}>Defect Detection:</span>
                              <strong style={{ color: selected.classification_evidence?.visual_analysis?.damage_detected ? 'var(--emerald-700)' : 'var(--navy-800)' }}>
                                {selected.classification_evidence?.visual_analysis?.damage_detected ? '✓ Defect Confirmed' : 'None Detected'}
                              </strong>
                            </div>
                            <div style={{ padding: '6px 8px', background: 'var(--slate-50)', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                              <span style={{ color: 'var(--text-muted)', fontSize: '10px', display: 'block' }}>Tamper / EXIF Check:</span>
                              <strong style={{ color: selected.classification_evidence?.visual_analysis?.tamper_detected ? 'var(--rose-700)' : 'var(--emerald-700)' }}>
                                {selected.classification_evidence?.visual_analysis?.tamper_detected ? '⚠️ Suspicious' : '✓ Authentic Exif'}
                              </strong>
                            </div>
                          </div>

                          <div style={{ fontSize: '11px', color: 'var(--navy-800)' }}>
                            <strong>Features:</strong> {selected.classification_evidence?.visual_analysis?.detected_features?.join(', ') || 'Damage/fracture tokens identified'}
                          </div>

                          {selected.classification_evidence?.visual_analysis?.findings && (
                            <div style={{ padding: '6px 8px', background: 'var(--slate-50)', borderRadius: '4px', border: '1px solid var(--border-subtle)', fontFamily: 'monospace', fontSize: '10px', lineHeight: '1.4' }}>
                              {selected.classification_evidence?.visual_analysis?.findings}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                    <button
                      className="primary compact"
                      onClick={() => handleProofAction(selected, 'APPROVE_PROOF', 'Photo proof verified by human agent')}
                      disabled={busy}
                      style={{ background: 'var(--emerald-600)', borderColor: 'var(--emerald-600)' }}
                    >
                      <CheckCircle2 size={13} /> Approve Proof &amp; Move to CS-1
                    </button>

                    <button
                      className="secondary compact"
                      onClick={() => handleCS2SendProof(selected)}
                      disabled={busy}
                    >
                      <Send size={13} /> Send Proof Request Notice
                    </button>

                    <button
                      className="secondary compact"
                      onClick={() => handleProofAction(selected, 'DENY', 'Photo evidence does not demonstrate manufacturing defect')}
                      disabled={busy}
                      style={{ color: 'var(--rose-700)' }}
                    >
                      <X size={13} /> Deny Claim
                    </button>
                  </div>
                </div>
              )}

              {/* ACTION BOX FOR CS-3 (NON-REFUNDABLE / DENIALS) */}
              {selected.decision_bucket === 'NON_REFUNDABLE' && (
                <div style={{ background: 'var(--rose-50)', border: '1px solid var(--rose-100)', padding: '18px', borderRadius: 'var(--radius-lg)', marginBottom: '22px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--rose-700)', fontWeight: 800, fontSize: '14px', marginBottom: '8px' }}>
                    <X size={18} /> CS-3 Policy Denial Dispatcher
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--rose-800)', margin: '0 0 12px' }}>
                    <strong>Policy Ineligibility:</strong> {selected.policy_evaluation_reason}
                  </p>

                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--navy-800)', display: 'block', marginBottom: '4px' }}>
                    AI Pre-Drafted Rejection Notice to Customer:
                  </label>
                  <textarea
                    rows={4}
                    value={draftMessage}
                    onChange={e => setDraftMessage(e.target.value)}
                    style={{ width: '100%', background: '#ffffff', border: '1px solid var(--rose-200)', borderRadius: 'var(--radius-md)', padding: '10px', fontSize: '12px' }}
                  />

                  <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                    <button
                      className="primary compact"
                      onClick={() => handleCS3SendRejection(selected)}
                      disabled={busy}
                      style={{ background: 'var(--rose-600)', borderColor: 'var(--rose-600)' }}
                    >
                      <Send size={14} /> Send Denial Notice to Customer
                    </button>
                  </div>
                </div>
              )}

              {/* Data Grid */}
              <div className="detail-grid">
                <Detail label="Claimed Amount" value={money(selected.claimed_amount, selected.currency)} />
                <Detail label="Order Reference" value={selected.order_id || '—'} />
                <Detail label="Transaction Reference" value={selected.transaction_id} />
                <Detail label="Customer Contact" value={selected.customer_phone || selected.customer_email || '—'} />
                <Detail label="Product Category" value={selected.item_category || 'GENERAL'} />
                <Detail label="Ledger Check" value={selected.payment_verification} />
              </div>

              {/* Multi-Agent Re-evaluation */}
              <div className="pipeline-box">
                <div className="pipeline-header">
                  <strong><BrainCircuit size={17} /> AI Multi-Agent Triage Trace</strong>
                  <button
                    className="pipeline-run-btn"
                    onClick={() => triggerAutomation(selected)}
                    disabled={pipelineLoading}
                  >
                    {pipelineLoading ? <RefreshCw size={13} className="spin" /> : <Play size={13} />}
                    <span>Re-Run AI Triage</span>
                  </button>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--navy-700)' }}>
                  <div><strong>Decision Bucket:</strong> {selected.decision_bucket}</div>
                  <div><strong>Assigned Desk:</strong> {selected.assigned_desk}</div>
                  <div><strong>Policy Reasoning:</strong> {selected.policy_evaluation_reason}</div>
                </div>
              </div>

              {/* 8 SPECIALIST AGENTS AUTONOMOUS TELEMETRY TRACE */}
              {selected.classification_evidence?.agents?.length > 0 && (
                <div style={{ marginTop: '16px', marginBottom: '18px', padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <strong style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--navy-900)' }}>
                      <Cpu size={16} color="var(--indigo-600)" /> RITOS 8 Specialist Agents Autonomous Execution Trace
                    </strong>
                    <span className={`pill ${selected.classification_evidence?.workflow?.status === 'WAITING_HUMAN' ? 'amber' : 'green'}`}>
                      <i />
                      {selected.classification_evidence.agents.filter((ag: any) => ag.status === 'COMPLETED').length}/{selected.classification_evidence.agents.length} COMPLETED
                      {selected.classification_evidence?.workflow?.status ? ` · ${selected.classification_evidence.workflow.status.replace('_', ' ')}` : ''}
                    </span>
                  </div>
                  {selected.classification_evidence?.workflow?.next_action && (
                    <div style={{ fontSize: '12px', marginBottom: '10px', color: 'var(--navy-700)' }}>
                      <strong>Orchestrator next action:</strong> {selected.classification_evidence.workflow.next_action.replace(/_/g, ' ')}
                      {selected.classification_evidence.workflow.gate_reason ? ` — ${selected.classification_evidence.workflow.gate_reason}` : ''}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '8px' }}>
                    {selected.classification_evidence.agents.map((ag: any, idx: number) => (
                      <div key={idx} style={{ padding: '10px 12px', background: 'var(--bg-page)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', fontSize: '11px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 700, color: 'var(--navy-900)' }}>
                            {idx + 1}. {ag.agent_name}
                          </span>
                          <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--emerald-700)' }}>✓ {ag.status}</span>
                        </div>
                        <p style={{ margin: 0, color: 'var(--navy-600)', lineHeight: '1.4' }}>
                          {ag.findings}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* FINANCE PAYOUT EXECUTION BOX */}
              {selected.decision_bucket === 'GENUINE_REFUNDABLE' && selected.refund_status !== 'REFUNDED' && (
                <div style={{ padding: '14px 18px', background: 'var(--indigo-50)', border: '1px solid var(--indigo-100)', borderRadius: 'var(--radius-lg)', marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--indigo-950)' }}>
                      💰 Authorized for Gateway Settlement
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--indigo-800)' }}>
                      Anti-fraud cleared and policy approved under CS-1.
                    </div>
                  </div>
                  <button
                    className="primary compact"
                    onClick={() => handleAuthorizePayout(selected)}
                    disabled={busy}
                    style={{ background: 'var(--indigo-700)', borderColor: 'var(--indigo-700)' }}
                  >
                    <Zap size={14} /> Authorize Payout ({money(selected.claimed_amount, selected.currency)})
                  </button>
                </div>
              )}

              {/* Conversation & Notes */}
              <div className="drawer-section">
                <div className="section-title">
                  <h4>Activity & Customer Communication Ledger</h4>
                  <span>{selected.comments?.length || 0} entries</span>
                </div>

                {selected.comments?.map(c => (
                  <div className={`comment ${c.internal ? 'internal' : ''}`} key={c.id}>
                    <div className="comment-meta">
                      <strong>{c.internal ? 'Staff Internal Note' : 'Customer Message / Dispatch'}</strong>
                      <span>{date(c.created_at)}</span>
                    </div>
                    <p>{c.body}</p>
                  </div>
                ))}

                <form onSubmit={addComment}>
                  <textarea
                    placeholder="Add an update or internal operational note…"
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    required
                  />
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={internal && !isCustomer}
                      disabled={isCustomer}
                      onChange={e => setInternal(e.target.checked)}
                    />
                    Internal note (staff only)
                  </label>
                  <button className="primary full" type="submit">
                    Record Note
                  </button>
                </form>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* --- SYSTEM DOCUMENTATION MODAL --- */}
      {showDocModal && (
        <div className="modal-backdrop" onClick={() => setShowDocModal(false)}>
          <div className="modal doc-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <div className="eyebrow">RITOS AUTOMATION SPECIFICATION</div>
                <h2>How RITOS Automates eCommerce Refunds</h2>
                <p>3-Bucket Classification, Pre-Drafted Messaging, and Four-Eyes Governance.</p>
              </div>
              <button className="icon-btn" onClick={() => setShowDocModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="doc-article">
              <h3>1. The 3 Operational Desks</h3>
              <div className="doc-agent-card" style={{ borderLeft: '4px solid #059669' }}>
                <strong style={{ color: '#059669' }}>🟢 CS-1: Genuine & Refundable Desk</strong>
                <p>
                  For claims where the transaction is verified on the ledger, within the product return window, and zero risk flags.
                  <strong>CS-1 can either 1-click execute the refund directly</strong>, or manually review and approve/cancel with audit notes.
                </p>
              </div>

              <div className="doc-agent-card" style={{ borderLeft: '4px solid #d97706' }}>
                <strong style={{ color: '#d97706' }}>🟡 CS-2: Exception & Proof Desk</strong>
                <p>
                  For claims involving damaged packaging, broken hinges, missing items, or wrong products delivered.
                  <strong>The AI pre-drafts an SMS/email tailored with the order reference</strong> asking for the exact proof items. CS-2 reviews and clicks Send.
                </p>
              </div>

              <div className="doc-agent-card" style={{ borderLeft: '4px solid #e11d48' }}>
                <strong style={{ color: '#e11d48' }}>🔴 CS-3: Denial & Resolution Desk</strong>
                <p>
                  For claims past the return window (e.g. &gt;7 days for electronics), fake transaction IDs, or final-sale hygiene items.
                  <strong>The AI writes a polite, legally compliant rejection explanation</strong>. CS-3 reviews and clicks Send.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- AGENT DETAIL SPEC MODAL --- */}
      {activeAgentModal && (
        <div className="modal-backdrop" onClick={() => setActiveAgentModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <div className="eyebrow">AGENT SPECIFICATION</div>
                <h2>{activeAgentModal.name}</h2>
                <p>{activeAgentModal.mode}</p>
              </div>
              <button className="icon-btn" onClick={() => setActiveAgentModal(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gap: '16px' }}>
              <div>
                <strong>Operational Purpose:</strong>
                <p style={{ margin: '4px 0 0', color: 'var(--navy-700)', fontSize: '13px', lineHeight: '1.6' }}>
                  {activeAgentModal.purpose}
                </p>
              </div>
              <div style={{ background: 'var(--emerald-50)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--emerald-100)' }}>
                <strong style={{ color: 'var(--emerald-700)' }}>Boundaries & Financial Guardrails:</strong>
                <p style={{ margin: '4px 0 0', color: 'var(--emerald-800)', fontSize: '12px', lineHeight: '1.6' }}>
                  {activeAgentModal.guardrail}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- SUB-COMPONENTS ---
function ShieldCheckIcon() {
  return <BadgeCheck size={18} />
}

function Metric({ icon, label, value, note, tone, trend }: any) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span className={`metric-icon ${tone || ''}`}>{icon}</span>
        {trend && <span className="live-tag"><i />{trend}</span>}
      </div>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-note">{note}</div>
    </div>
  )
}

function SectionTitle({ title, action, onAction }: any) {
  return (
    <div className="section-title">
      <h3>{title}</h3>
      {action && (
        <button className="text-btn" onClick={onAction}>
          {action} <ArrowUpRight size={14} />
        </button>
      )}
    </div>
  )
}

function StatusPill({ value }: any) {
  const v = String(value || 'UNKNOWN')
  const cls =
    v.includes('REFUND') || v === 'ACTIVE' || v === 'RESOLVED' || v === 'APPROVED'
      ? 'green'
      : v.includes('REJECT') || v === 'FAILED' || v === 'CANCELLED'
      ? 'red'
      : v.includes('PENDING') || v.includes('AWAITING') || v === 'ESCALATED'
      ? 'amber'
      : 'blue'

  return (
    <span className={`pill ${cls}`}>
      <i />{v.replace(/_/g, ' ')}
    </span>
  )
}

function PriorityPill({ value }: any) {
  return <span className={`priority-pill ${String(value).toLowerCase()}`}>{value}</span>
}

function TicketTable({ tickets, onSelect }: { tickets: Ticket[]; onSelect: (t: Ticket) => void }) {
  return (
    <div className="panel table-panel">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>TICKET</th>
              <th>ORDER & ITEM</th>
              <th>CLAIMED AMOUNT</th>
              <th>ASSIGNED DESK</th>
              <th>STATUS</th>
              <th>CREATED</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tickets.map(t => (
              <tr key={t.id} onClick={() => onSelect(t)} className="click-row">
                <td>
                  <div className="ticket-id">
                    <span className="ticket-symbol"><TicketIcon size={16} /></span>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <strong>{t.ticket_number}</strong>
                        {t.classification_evidence?.source === 'SHOPFLOW' && (
                          <span className="pill blue" style={{ padding: '1px 6px', fontSize: '10px' }}>ShopFlow</span>
                        )}
                      </div>
                      <small className="mono">{t.customer_phone || t.transaction_id}</small>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="issue-cell">
                    <strong>{t.item_name || t.category.replace(/_/g, ' ')}</strong>
                    <small>{t.description}</small>
                  </div>
                </td>
                <td>
                  <span className="amount">{money(t.claimed_amount, t.currency)}</span>
                </td>
                <td>
                  <span className={`pill ${t.assigned_desk === 'CS_1' ? 'green' : t.assigned_desk === 'CS_2' ? 'amber' : 'red'}`}>
                    <i />{t.assigned_desk || 'CS-2'} ({t.decision_bucket?.replace(/_/g, ' ') || 'EXCEPTIONS'})
                  </span>
                </td>
                <td><StatusPill value={t.status} /></td>
                <td><span className="date-cell">{new Date(t.created_at).toLocaleDateString()}</span></td>
                <td>
                  <button
                    className="icon-btn"
                    style={{ width: '30px', height: '30px' }}
                    onClick={e => {
                      e.stopPropagation()
                      onSelect(t)
                    }}
                  >
                    <ArrowUpRight size={15} />
                  </button>
                </td>
              </tr>
            ))}
            {!tickets.length && (
              <tr>
                <td colSpan={7}>
                  <Empty text="No tickets found matching the criteria." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="panel-foot">
        <span>Showing <strong>{tickets.length}</strong> cases</span>
        <span>Synced with RITOS Automation Engine</span>
      </div>
    </div>
  )
}

function Empty({ text }: any) {
  return (
    <div className="empty">
      <span><FileText size={22} /></span>
      <strong>No Records Found</strong>
      <p>{text}</p>
    </div>
  )
}

function Detail({ label, value }: any) {
  return (
    <div className="detail">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  )
}

export default App
