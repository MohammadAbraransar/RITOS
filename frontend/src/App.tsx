import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BadgeCheck, Bell,
  BookOpen, BrainCircuit, Check, CheckCircle2, ChevronDown, ChevronRight,
  CircleDollarSign, Clock3, Command, Copy, Database, ExternalLink, FileText,
  Filter, Gauge, Headphones, HelpCircle, Info, LayoutDashboard, Lock, LogOut,
  Mail, Menu, MessageSquare, Phone, Play, Plus, RefreshCw, Search, Send,
  Shield, ShieldAlert, Sparkles, Ticket as TicketIcon, Users, WalletCards, X, Zap,
  Camera, Cpu, GitFork, UploadCloud, Trash2, XCircle, Landmark, ShoppingCart, Laptop, Shirt,
  Backpack, Apple, Settings2, ArrowRight, Smartphone, Plug
} from 'lucide-react'
import { api, API_ROOT, getToken, setToken, type ClaimReason, type NextStep, type Purchase, type Ticket, type User } from './api'
import { label, anyStatus, roleName, reasonText, humanize, DESK, BUCKET, NEXT_ACTION, LEDGER_STATUS, PROOF_STATUS,
         PAYOUT_ACTION, RUN_TRIGGER, HUMAN_DECISION, REFUND_STATUS } from './labels'
import { isClosedStatus, priorityRank } from './logic'
import { LOCALE, money } from './format'
import { FileClaim } from './customer/FileClaim'
import { CLAIM_TONE, ELIGIBILITY_BADGE, categoryLabel, claimStatus } from './customer/claimUi'
import { QuickRefund } from './customer/QuickRefund'
import { ProductThumb } from './customer/ProductThumb'
import { CustomerClaimDrawer, MyClaims } from './customer/MyClaims'
import { CustomerRefunds } from './customer/CustomerRefunds'
import { RefundPanel } from './desk/RefundPanel'
import { DeveloperIntegrations } from './desk/DeveloperIntegrations'
import { isStoreLinked, refundStage } from './desk/refundStage'

export { isClosedStatus, priorityRank }

// One icon and colour per desk, used wherever a desk is named (menu, headings, legends, docs)
const DESK_ICONS = {
  cs1: { Icon: CheckCircle2, color: 'var(--emerald-600)' },
  cs2: { Icon: AlertTriangle, color: 'var(--amber-600)' },
  cs3: { Icon: XCircle, color: 'var(--rose-600)' },
} as const

function DeskIcon({ desk, size = 14 }: { desk: keyof typeof DESK_ICONS; size?: number }) {
  const { Icon, color } = DESK_ICONS[desk]
  return <Icon size={size} color={color} className="inline-icon" aria-hidden="true" />
}

const roles = [
  { label: 'Approval Desk', role: 'cs_1', email: 'cs1@ritos.local', icon: CheckCircle2, desc: 'Genuine in-policy refunds' },
  { label: 'Review Desk', role: 'cs_2', email: 'cs2@ritos.local', icon: AlertTriangle, desc: 'Missing proof & damage' },
  { label: 'Rejection Desk', role: 'cs_3', email: 'cs3@ritos.local', icon: X, desc: 'Policy rejection notices' },
  { label: 'Administrator', role: 'administrator', email: 'admin@ritos.local', icon: Command, desc: 'Management Dashboard, full access' },
  { label: 'Supervisor', role: 'supervisor', email: 'lead@ritos.local', icon: Shield, desc: 'Management Dashboard, approvals' },
  { label: 'Finance Approver', role: 'finance_approver', email: 'finance@ritos.local', icon: CircleDollarSign, desc: 'Settlement authorization' },
  // The four-eyes rule needs three different people; when Finance or an Administrator approved the claim,
  // Refund Operations is the one who can still send the payment.
  { label: 'Refund Operations', role: 'refund_operations', email: 'refunds@ritos.local', icon: Landmark, desc: 'Sends approved payouts' },
  { label: 'Customer Portal', role: 'customer', email: 'customer@ritos.local', icon: Users, desc: 'Self-service claims' }
]

// Local demo only: lets the role buttons sign in. Never set in production builds.
const DEMO_PASSWORD: string = import.meta.env.VITE_DEMO_PASSWORD || ''

// The agent registry comes from the API (GET /automation/agents): one source of truth with the orchestrator.

// Pages restricted to some roles, mirroring the server's guards (backend/app/api.py): the menu never offers a page
// whose data the server would refuse. Desks, tickets and the settlement register are open to every staff role.
const PAGE_ROLES: Record<string, string[]> = {
  ecommerce: ['administrator', 'supervisor', 'auditor'],
  audit: ['administrator', 'auditor'],
  automation: ['administrator', 'supervisor', 'cs_1', 'cs_2', 'cs_3', 'refund_operations', 'finance_approver'],
}
const canOpenPage = (role: string, page: string) => !PAGE_ROLES[page] || PAGE_ROLES[page].includes(role)
const MANAGEMENT_ROLES = ['administrator', 'supervisor']

const navFor = (role: string) => navItems(role).filter(([, key]) => canOpenPage(role, key))
const navItems = (role: string) => {
  if (role === 'cs_1') {
    return [
      ['Approval Dashboard', 'dashboard'],
      ['Approval Queue', 'cs1_desk'],
      ['My Desk Tickets', 'tickets']
    ]
  }
  if (role === 'cs_2') {
    return [
      ['Review Dashboard', 'dashboard'],
      ['Review Queue', 'cs2_desk'],
      ['My Desk Tickets', 'tickets']
    ]
  }
  if (role === 'cs_3') {
    return [
      ['Rejection Dashboard', 'dashboard'],
      ['Rejection Queue', 'cs3_desk'],
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
      ['Finance Approvals Queue', 'finance_queue'],
      ['Settlement Register', 'refunds'],
      ['Audit Trail', 'audit']
    ]
  }
  // One Management Dashboard for Administrator and Supervisor (same pages; the server still decides each action
  // by role, e.g. only an Administrator reads the audit trail). Other staff roles get the same menu, filtered.
  return [
    [MANAGEMENT_ROLES.includes(role) ? 'Management Dashboard' : 'Operations Dashboard', 'dashboard'],
    ['Approval Desk', 'cs1_desk'],
    ['Review Desk', 'cs2_desk'],
    ['Rejection Desk', 'cs3_desk'],
    ['Finance Approvals Queue', 'finance_queue'],
    ['All Team Tickets Queue', 'tickets'],
    ['Developer Integrations', 'ecommerce'],
    ['Specialist Agents Registry', 'automation'],
    ['Settlement Register', 'refunds'],
    ['Security Audit Trail', 'audit']
  ]
}

const roleTitle = (r: string) => roleName(r)

// Payout approval rights for a claim: claims RITOS routed for approval (AWAIT_APPROVAL) need a supervisory role,
// unless the workflow recorded that none is needed (mirrors backend permissions.proposal_action).
function proposalRoles(user: User | null, t: Ticket): string[] {
  const wf = (t as any).classification_evidence?.workflow
  const supervised = wf?.next_action === 'AWAIT_APPROVAL' && wf?.supervised !== false
  return user?.permissions?.payout_roles[supervised ? 'propose_supervised' : 'propose'] || []
}
const canProposeFor = (user: User | null, t: Ticket) => !!user && proposalRoles(user, t).includes(user.role)
// A refund is already in the four-eyes flow (or paid): proposing again would be refused by the server.
const hasActiveRefund = (t: Ticket, refunds: any[]) =>
  ['PENDING_APPROVAL', 'APPROVED', 'PROCESSING', 'REFUNDED'].includes(t.refund_status) ||
  refunds.some((r: any) => r.ticket_id === t.id && !['REJECTED', 'FAILED'].includes(r.status))

// One sentence telling staff where the claim stands and who acts next.
function nextStepText(t: Ticket, user: User | null, refunds: any[]): string {
  const ev = (t as any).classification_evidence || {}
  const waiting = ev.workflow?.next_action
  const review = (ev.agents || []).find((a: any) => a.agent_id === 'review_coordination') || {}
  const assignee = review.assigned_reviewer_name ? `${review.assigned_reviewer_name} (${roleName(review.assigned_reviewer_role)})` : 'the review team'
  const refund = refunds.find((r: any) => r.ticket_id === t.id && r.status !== 'REJECTED')
  if (t.refund_status === 'REFUNDED' || refund?.status === 'REFUNDED') return 'Refunded. Nothing left to do.'
  if (t.status === 'RESOLVED' || t.status === 'REJECTED' || t.decision_bucket === 'NON_REFUNDABLE')
    return `Closed: ${t.policy_evaluation_reason || 'not eligible for a refund'}.`
  if (t.refund_status === 'APPROVED' && isStoreLinked(t)) return 'Approved and sent to the store, which is paying the customer.'
  if (refund?.next_step) return waitingFor(refund.next_step, user?.id) + (refund.next_step.can_act ? ' You can do this step in the Finance Approvals queue.' : '')
  if (waiting === 'AWAIT_PROOF') return `Waiting for the customer to send evidence${t.proof_required ? `: ${t.proof_required}` : ''}. Assigned to ${assignee}.`
  if (waiting === 'MANUAL_REVIEW') return `A reviewer must decide (assigned to ${assignee}). Use the review actions below.`
  if (waiting === 'AWAIT_APPROVAL' || waiting === 'AUTO_APPROVE' || t.decision_bucket === 'GENUINE_REFUNDABLE') {
    const who = proposalRoles(user, t).map(roleLabel).join(' or ')
    return canProposeFor(user, t)
      ? 'Eligible for refund. You can approve the payout below.'
      : `Eligible for refund. Waiting for ${who} to approve the payout${waiting === 'AWAIT_APPROVAL' ? ` (assigned to ${assignee})` : ''}.`
  }
  return label(NEXT_ACTION, waiting).text
}

// Who must act next on a refund, rendered from the server's policy (backend/app/permissions.py).
const roleLabel = (r: string) => roleName(r)
function waitingFor(step: NextStep, userId?: string): string {
  if (!step) return ''
  const who = step.roles.map(roleLabel).join(' or ')
  const self = userId && step.excluded_user_ids.includes(userId) ? ' (a colleague: you already acted on this refund)' : ''
  return `Waiting for ${who} to ${PAYOUT_ACTION[step.action] || step.action}${self}`
}
const date = (d: string) => new Date(d).toLocaleString()

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('cs1@ritos.local')
  const [password, setPassword] = useState('')
  const [agentCatalog, setAgentCatalog] = useState<any[]>([])
  const [awaitingPayout, setAwaitingPayout] = useState<Ticket[]>([])
  const [timeline, setTimeline] = useState<any[]>([])
  // Store claims: whether the approval/rejection actually reached the store (outbox delivery)
  const [storeDelivery, setStoreDelivery] = useState<any>(null)
  const [loginError, setLoginError] = useState('')
  const [busy, setBusy] = useState(false)

  const [page, setPage] = useState('dashboard')
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [metrics, setMetrics] = useState<any>(null)
  const [desks, setDesks] = useState<any>({ cs1_count: 0, cs2_count: 0, cs3_count: 0, resolved_count: 0, total_tickets: 0 })
  const [automation, setAutomation] = useState<any>(null)
  const [refunds, setRefunds] = useState<any[]>([])
  const [audit, setAudit] = useState<any[]>([])
  const [ledgerSubTab, setLedgerSubTab] = useState<'settlements' | 'journals' | 'accounts'>('settlements')
  const [journals, setJournals] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [readiness, setReadiness] = useState<any>(null)

  const [selected, setSelected] = useState<Ticket | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')

  const [notice, setNotice] = useState('')
  const [showMobileNav, setShowMobileNav] = useState(false)
  const [showDocModal, setShowDocModal] = useState(false)
  const [activeAgentModal, setActiveAgentModal] = useState<any>(null)
  const [apiStatus, setApiStatus] = useState<'checking' | 'connected' | 'degraded'>('checking')

  const [pipelineLoading, setPipelineLoading] = useState(false)
  const [pipelineTrace, setPipelineTrace] = useState<any>(null)

  // Message drafting state in drawer
  const [draftMessage, setDraftMessage] = useState('')

  // eCommerce Webhook Simulator state
  const [simEcom, setSimEcom] = useState({
    order_id: 'ORD-SF-05',
    transaction_id: 'TXN-SF-05',
    customer_email: 'customer@ritos.local',
    customer_name: 'Riya Kapoor',
    customer_phone: '',
    item_name: 'BrewMate Coffee Maker',
    item_category: 'HOME',
    claimed_amount: '3999',
    description: 'The carafe arrived cracked and the machine leaks when brewing.'
  })
  const [ecomSimResult, setEcomSimResult] = useState<any>(null)

  // Customer claims list: loading/error state, the order a claim starts from, and the request just filed
  const [ticketsLoaded, setTicketsLoaded] = useState(false)
  const [ticketsError, setTicketsError] = useState('')
  const [claimPreselectTx, setClaimPreselectTx] = useState<string | null>(null)
  const [newClaimId, setNewClaimId] = useState<string | null>(null)

  const [customerTxs, setCustomerTxs] = useState<any[]>([])
  // Customer dashboard: each purchased item with its refund eligibility, and the refund opened from it
  const [customerPurchases, setCustomerPurchases] = useState<Purchase[] | null>(null)
  const [claimReasons, setClaimReasons] = useState<ClaimReason[]>([])
  const [quickRefund, setQuickRefund] = useState<Purchase | null>(null)
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
  // Refund rows name their claim by ticket number, so the same claim reads the same on every screen
  const ticketById = (id?: string) => tickets.find(t => t.id === id)

  // full=false refreshes only the ticket list (used when filters or the page change)
  async function load(full = true) {
    try {
      const params = new URLSearchParams()
      if (search) params.set('q', search)
      if (statusFilter) params.set('status', statusFilter)
      if (priorityFilter) params.set('priority', priorityFilter)

      if (!full && tickets.length > 0) {
        const t = await api.tickets(params.toString() ? '?' + params.toString() : '')
        setTickets(t.items)
        setTicketsLoaded(true)
        setTicketsError('')
        setApiStatus('connected')
        return
      }

      // Lists first (what people act on); dashboard figures fill in independently and can never block them.
      const [t, r] = await Promise.all([
        api.tickets(params.toString() ? '?' + params.toString() : ''),
        api.refunds(),
      ])
      setTickets(t.items)
      setRefunds(r)
      setTicketsLoaded(true)
      setTicketsError('')
      setApiStatus('connected')
      if (!isCustomer) {
        api.analytics().then(setMetrics).catch(() => {})
        api.desksSummary().then(setDesks).catch(() => {})
      } else {
        api.customerTransactions().then(setCustomerTxs).catch(() => {})
        loadCustomerPurchases()
      }

      if (!isCustomer) {
        try {
          setAutomation(await api.automationSummary())
        } catch {
          setAutomation(null)
        }
      }
      const role = user?.role || ''
      if (['administrator', 'auditor', 'supervisor', 'finance_approver', 'refund_operations'].includes(role)) {
        // Only call what the server lets this role read (backend api.py role guards)
        if (['administrator', 'auditor'].includes(role)) {
          try {
            setAudit(await api.audit())
          } catch {}
        }
        if (['administrator', 'auditor', 'finance_approver'].includes(role)) {
          api.ledgerJournals().then(setJournals).catch(() => {})
          api.ledgerAccounts().then(setAccounts).catch(() => {})
        }
        api.healthReadiness().then(setReadiness).catch(() => {})
      }
      if (!isCustomer) {
        api.shopflowStatus().then(setShopflowStatus).catch(() => setShopflowStatus(null))
      }
    } catch (e) {
      setApiStatus('degraded')
      setTicketsError((e as Error).message)
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
    setTimeline([])
    setStoreDelivery(null)
    if (selected && user && user.role !== 'customer') {
      api.ticketTimeline(selected.id).then((r) => { setTimeline(r.history || []); setStoreDelivery(r.store_delivery || null) }).catch(() => setTimeline([]))
    }
  }, [selected?.id, selected?.updated_at])

  useEffect(() => {
    if (selected) {
      setRefundAmount(selected.claimed_amount ? String(selected.claimed_amount) : '')
      setDraftMessage(selected.customer_message_draft || '')
    }
  }, [selected])

  useEffect(() => {
    if (user) {
      setTicketsLoaded(false)
      setTicketsError('')
      setNewClaimId(null)
      load(true)
      api.automationAgents().then((r) => setAgentCatalog(r.agents || [])).catch(() => setAgentCatalog([]))
    }
  }, [user])

  useEffect(() => {
    if (user) {
      load(false)
    }
  }, [page, search, statusFilter, priorityFilter])

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
      if (!DEMO_PASSWORD) {
        setNotice('Quick switch needs VITE_DEMO_PASSWORD (local demo only).')
        return
      }
      const data = await api.login(targetEmail, DEMO_PASSWORD)
      setToken(data.access_token)
      setUser(data.user)  // the [user] effect reloads with the new role (this closure still holds the old one)
      setPage('dashboard')
      setSelected(null)
      setPipelineTrace(null)
      setNotice(`Switched session to ${data.user.full_name} (${roleTitle(data.user.role)})`)
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

  // --- Approval Desk ACTIONS ---
  async function handleCS1DirectRefund(t: Ticket) {
    setBusy(true)
    try {
      const res = await api.cs1DirectRefund(t.id)
      if (res.status === 'REFUND_PROPOSED') {
        setNotice(`Refund proposed (#${res.refund?.id?.slice(0, 8) || ''}). Waiting for a second person to approve the payout.`)
      } else if (res.status === 'DECISION_QUEUED_FOR_STORE') {
        setNotice('Refund approved and queued for delivery to the store, which pays the customer.')
      } else {
        setNotice(`Refund paid. Provider reference: ${res.provider_reference || label(REFUND_STATUS, res.status).text}`)
      }
      setSelected(res.ticket)
      await load()
    } catch (err) {
      setNotice(`Refund failed: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleCS1ManualDecide(t: Ticket, decision: 'APPROVE' | 'CANCEL', cancelReason = '') {
    if (decision === 'CANCEL' && !cancelReason.trim()) {
      setNotice('Please give a reason for rejecting the claim.')
      return
    }
    setBusy(true)
    try {
      const reason = decision === 'APPROVE' ? 'Manually inspected and approved by the Approval Desk.' : cancelReason
      const res = await api.cs1ManualDecide(t.id, decision, reason)
      if (decision === 'APPROVE') {
        if (res.status === 'REFUND_PROPOSED') {
          setNotice(`Refund proposed (#${res.refund?.id?.slice(0, 8) || ''}). Waiting for a second person to approve the payout.`)
        } else if (res.status === 'DECISION_QUEUED_FOR_STORE') {
          setNotice('Refund approved and queued for delivery to the store, which pays the customer.')
        } else {
          setNotice('Refund approved.')
        }
      } else {
        setNotice('Claim rejected. The customer can see the reason on their request.')
      }
      setSelected(res.ticket)
      await load()
    } catch (err) {
      setNotice(`Action Failed: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  // --- Review Desk ACTION: SEND PROOF REQUEST ---
  async function handleCS2SendProof(t: Ticket) {
    setBusy(true)
    try {
      const res = await api.cs2SendProofRequest(t.id, draftMessage || t.customer_message_draft || '', t.proof_required || undefined)
      setNotice(`Evidence request sent to ${res.destination}. Waiting for the customer.`)
      setSelected(res.ticket)
      await load()
    } catch (err) {
      setNotice(`Dispatch Failed: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  // --- Rejection Desk ACTION: SEND REJECTION NOTICE ---
  async function handleCS3SendRejection(t: Ticket) {
    setBusy(true)
    try {
      const res = await api.cs3SendRejectionNotice(t.id, draftMessage || t.customer_message_draft || '', t.policy_evaluation_reason || undefined)
      setNotice(`Rejection notice sent to ${res.destination}. The claim is closed as rejected.`)
      setSelected(res.ticket)
      await load()
    } catch (err) {
      setNotice(`Dispatch Failed: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  // --- Review Desk HUMAN-IN-THE-LOOP PROOF ACTIONS ---
  async function handleProofAction(t: Ticket, action: 'APPROVE_PROOF' | 'REQUEST_PROOF' | 'DENY', note: string) {
    setBusy(true)
    try {
      const res = await api.proofAction(t.id, action, note)
      setNotice(
        action === 'APPROVE_PROOF'
          ? 'Proof approved. The claim moves to the Approval Desk for payout.'
          : action === 'REQUEST_PROOF'
          ? 'Asked the customer for more evidence.'
          : 'Claim rejected after reviewing the evidence.'
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
  function loadAwaitingPayout() {
    if (!user || user.role === 'customer') return
    api.payoutsAwaitingAuthorization().then(setAwaitingPayout).catch(() => setAwaitingPayout([]))
  }
  useEffect(() => { if (page === 'finance_queue' || page === 'dashboard') loadAwaitingPayout() }, [page, user])

  async function handleAuthorizePayout(t: Ticket) {
    setBusy(true)
    try {
      const res = await api.authorizePayout(t.id)
      if (res.status === 'REFUND_PROPOSED') {
        setNotice(`Refund proposed (#${res.refund?.id?.slice(0, 8) || ''}). Waiting for a second person to approve the payout.`)
      } else if (res.status === 'DECISION_QUEUED_FOR_STORE') {
        setNotice('Refund approved and queued for delivery to the store, which pays the customer.')
      } else {
        setNotice(`Payout status: ${label(REFUND_STATUS, res.status).text}`)
      }
      setSelected(res.ticket)
      await load()
      loadAwaitingPayout()
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
        claimed_amount: Number(simEcom.claimed_amount)
      }
      const res = await api.ecommerceTicketIntake(payload)
      setEcomSimResult(res)
      setNotice(`Ticket ${res.ticket_number} received and routed to ${label(DESK, res.assigned_desk).text} (${label(BUCKET, res.decision_bucket).text}).`)
      await load()
    } catch (err) {
      setNotice(`eCommerce Simulation Failed: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  // --- FINANCE APPROVER ACTIONS ---
  // After a payout action, reload the lists and the open ticket so every screen shows the same stage.
  async function reloadAfterPayout(ticketId?: string) {
    await load()
    if (ticketId && selected?.id === ticketId) {
      try { setSelected(await api.ticket(ticketId)) } catch {}
    }
  }

  async function handleApproveRefund(r: any) {
    setBusy(true)
    try {
      await api.approveRefund(r.id, 'Second approval: checked against the order and payment records.')
      setNotice(`Payout #${r.id.slice(0, 8).toUpperCase()} approved. No money has moved yet: a third person sends the payment.`)
      await reloadAfterPayout(r.ticket_id)
    } catch (err) {
      setNotice(`Approval failed: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleRejectRefund(r: any, reason?: string) {
    const why = reason ?? window.prompt('Why is this payout rejected? The customer sees this reason.', '')
    if (!why || why.trim().length < 3) {
      if (why !== null) setNotice('Please give a reason (at least 3 characters).')
      return
    }
    setBusy(true)
    try {
      await api.rejectRefund(r.id, why.trim())
      setNotice(`Payout #${r.id.slice(0, 8).toUpperCase()} rejected. The claim is closed and the customer was told why.`)
      await reloadAfterPayout(r.ticket_id)
    } catch (err) {
      setNotice(`Rejection failed: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleExecuteRefund(r: any) {
    setBusy(true)
    try {
      const res = await api.executeRefund(r.id, `exec-${r.id}`)
      // Only a REFUNDED status is a completed payout; anything else (e.g. RECONCILIATION_REQUIRED) is reported as is.
      setNotice(res.status === 'REFUNDED'
        ? `Payment completed via ${res.provider} (ref ${res.provider_reference})${res.provider === 'SANDBOX' ? '. Sandbox: no real money moved.' : ''}`
        : `Payment status: ${label(REFUND_STATUS, res.status).text}${res.provider_reference ? ` (ref ${res.provider_reference})` : ''}. ${res.warning || res.error || 'Check the settlement register.'}`)
      await reloadAfterPayout(r.ticket_id)
    } catch (err) {
      setNotice(`Payment failed, nothing was paid: ${(err as Error).message}`)
      await reloadAfterPayout(r.ticket_id)
    } finally {
      setBusy(false)
    }
  }

  // Store claims: re-send an approval that did not reach the store, then refresh where it stands
  async function handleRetryDelivery(messageId: string) {
    setBusy(true)
    try {
      await api.retryOutbox(messageId)
      setNotice('Delivery to the store queued again. The claim updates once ShopFlow receives it.')
      if (selected) api.ticketTimeline(selected.id).then(r => setStoreDelivery(r.store_delivery || null)).catch(() => {})
    } catch (err) {
      setNotice(`Retry failed: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleReconcileRefund(r: any) {
    setBusy(true)
    try {
      const res = await api.reconcileRefund(r.id)
      setNotice(res.reconciled
        ? `Payment outcome confirmed: ${label(REFUND_STATUS, res.status).text}`
        : `Not confirmed yet: ${res.detail || label(REFUND_STATUS, res.status).text}`)
      await reloadAfterPayout(r.ticket_id)
    } catch (err) {
      setNotice(`Confirmation failed: ${(err as Error).message}`)
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
      setNotice(`Orchestrator: ${agentCatalog.length} specialist agents run on ${res.processed_count} active tickets.`)
      await load()
    } catch (err) {
      setNotice(`Multi-Agent Run Failed: ${(err as Error).message}`)
    } finally {
      setRunningAllAgents(false)
    }
  }

  function loadCustomerPurchases() {
    api.customerPurchases().then(r => { setCustomerPurchases(r.items); setClaimReasons(r.reasons) }).catch(() => setCustomerPurchases([]))
  }


  // --- SHOPFLOW ACTIONS ---
  async function handleSyncShopflow() {
    setSyncingShopflow(true)
    try {
      const res = await api.shopflowSync()
      if (res.status === 'DISCONNECTED') {
        setNotice(`ShopFlow: ${res.message}`)
      } else {
        setNotice(`ShopFlow sync finished: ${res.synced_count} pending claim(s) processed.`)
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
      setNotice(`Store claim ${res.data?.ticket_id} received and routed to ${label(DESK, res.data?.assigned_desk).text} (${anyStatus(res.data?.decision).text}).`)
      await load()
    } catch (err) {
      setNotice(`ShopFlow Webhook Simulation Note: ${(err as Error).message}`)
    } finally {
      setBusy(false)
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
      setNotice(`Checks finished: routed to ${label(DESK, result.assigned_desk).text} (${label(BUCKET, result.decision_bucket).text}).`)
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
                    <strong>Ledger Ground Truth:</strong> Every claim is checked against the transaction ledger, refundable balance and earlier claims before any refund.
                  </div>
                </div>
                <div className="login-pillar-item">
                  <Camera size={16} color="#34d399" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Evidence checks:</strong> Image quality gates and reused-photo detection; with the local vision model enabled, product identity and visible-defect checks. Unclear photos go to a person.
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
              RITOS CORE ENGINE · {import.meta.env.MODE.toUpperCase()}
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
                      setPassword(DEMO_PASSWORD)
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
                {DEMO_PASSWORD ? 'Demo accounts: pick a role above to sign in.' : 'Sign in with your RITOS account.'}
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
                 key === 'cs1_desk' ? <CheckCircle2 size={17} color="var(--emerald-600)" /> :
                 key === 'cs2_desk' ? <AlertTriangle size={17} color="var(--amber-600)" /> :
                 key === 'cs3_desk' ? <XCircle size={17} color="var(--rose-600)" /> :
                 key === 'tickets' ? <TicketIcon size={17} /> :
                 key === 'refunds' ? <CircleDollarSign size={17} /> :
                 key === 'finance_queue' ? <Landmark size={17} /> :
                 key === 'new' ? <Plus size={17} /> :
                 key === 'ecommerce' ? <Plug size={17} color="var(--primary-600)" /> :
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
            <p>Tickets sorted into the Approval, Review and Rejection desks with pre-drafted customer notifications.</p>
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
            <button className="icon-btn mobile-menu" onClick={() => setShowMobileNav(!showMobileNav)}
              aria-label={showMobileNav ? 'Close menu' : 'Open menu'} aria-expanded={showMobileNav}>
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

            <button className="doc-btn" onClick={() => setShowDocModal(true)} aria-label="System Docs" title="System Docs">
              <BookOpen size={15} />
              <span>System Docs</span>
            </button>

            <button className="icon-btn" title="Refresh records" aria-label="Refresh records" onClick={refresh}>
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
              <button onClick={() => setNotice('')} aria-label="Dismiss"><X size={16} /></button>
            </div>
          )}

          {/* DASHBOARD - STRICTLY ROLE SEGREGATED */}
          {page === 'dashboard' && user.role !== 'customer' && (() => {
            // What is waiting for this person right now (assignment by Agent 9; payout steps by the server policy)
            const open = (t: Ticket) => !['RESOLVED', 'REJECTED'].includes(t.status) && !['REFUNDED', 'APPROVED', 'REJECTED'].includes((t as any).refund_status)
            const myReviews = tickets.filter(t => open(t) && ((t as any).classification_evidence?.agents || [])
              .some((a: any) => a.agent_id === 'review_coordination' && a.assigned_reviewer === user.email))
            const myPayouts = awaitingPayout.filter((t: any) => t.can_authorize)
            const mySteps = refunds.filter((r: any) => r.next_step?.can_act)
            return (
              <div className="metric-grid" style={{ marginBottom: '18px' }}>
                <div className="click-row" onClick={() => setPage('tickets')}>
                  <Metric icon={<Users />} label="Reviews assigned to me" value={myReviews.length} note="Claims RITOS routed to you" tone="amber" />
                </div>
                <div className="click-row" onClick={() => setPage('finance_queue')}>
                  <Metric icon={<CheckCircle2 />} label="Payouts I can approve" value={myPayouts.length} note="Eligible claims waiting for approval" tone="green" />
                </div>
                <div className="click-row" onClick={() => setPage('finance_queue')}>
                  <Metric icon={<CircleDollarSign />} label="Refund steps for me" value={mySteps.length} note="Second approval, payment or reconciliation" tone="blue" />
                </div>
              </div>
            )
          })()}

          {page === 'dashboard' && user.role === 'cs_1' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow" style={{ color: 'var(--emerald-700)' }}><DeskIcon desk="cs1" />APPROVAL DESK PIPELINE</div>
                  <h1>Approval Desk Workspace</h1>
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
                <Metric icon={<BadgeCheck />} label="Ledger-Verified Claims" value={tickets.filter(t => t.payment_verification === 'VERIFIED').length} note="Agent 1 ledger check passed" tone="blue" />
                <Metric icon={<CircleDollarSign />} label="Refunds Executed" value={refunds.filter((r: any) => r.status === 'REFUNDED').length} note="Four-eyes approved, idempotent" tone="green" />
                <Metric icon={<Clock3 />} label="Pipeline Runs" value={automation?.pipeline_runs ?? '—'} note="Each run records every agent step" tone="blue" />
              </div>

              <SectionTitle title="Approval Queue" action="View Full Desk Queue" onAction={() => setPage('cs1_desk')} />
              <TicketTable tickets={cs1Tickets} onSelect={setSelected} refunds={refunds} />
            </>
          )}

          {page === 'dashboard' && user.role === 'cs_2' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow" style={{ color: 'var(--amber-700)' }}><DeskIcon desk="cs2" />REVIEW DESK PIPELINE</div>
                  <h1>Review Desk Workspace</h1>
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

              <SectionTitle title="Review Queue" action="View Full Desk Queue" onAction={() => setPage('cs2_desk')} />
              <TicketTable tickets={cs2Tickets} onSelect={setSelected} refunds={refunds} />
            </>
          )}

          {page === 'dashboard' && user.role === 'cs_3' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow" style={{ color: 'var(--rose-700)' }}><DeskIcon desk="cs3" />REJECTION DESK PIPELINE</div>
                  <h1>Rejection Desk Workspace</h1>
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
                <Metric icon={<FileText />} label="Policy Explanations Drafted" value={cs3Tickets.filter(t => t.customer_message_draft).length} note="Drafted from policy reason codes" tone="blue" />
                <Metric icon={<Send />} label="Denial Notices Sent" value={cs3Tickets.filter(t => t.rejection_notice_sent_at).length} note="Dispatched to customer" tone="green" />
                <Metric icon={<Shield />} label="Policy Rejections" value={cs3Tickets.length} note="Decided by versioned policy rules" tone="amber" />
              </div>

              <SectionTitle title="Rejection Queue" action="View Full Desk Queue" onAction={() => setPage('cs3_desk')} />
              <TicketTable tickets={cs3Tickets} onSelect={setSelected} refunds={refunds} />
            </>
          )}

          {/* OMNICHANNEL COMMAND CENTER - ADMIN & SUPERVISOR ONLY */}
          {page === 'dashboard' && ['administrator', 'supervisor', 'support_agent', 'refund_operations'].includes(user.role) && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">{MANAGEMENT_ROLES.includes(user.role) ? 'MANAGEMENT' : 'OPERATIONS'} · {roleName(user.role).toUpperCase()}</div>
                  <h1>{MANAGEMENT_ROLES.includes(user.role) ? 'Management Dashboard' : 'Operations Dashboard'}</h1>
                  <p>Every desk at a glance: what is waiting, what was settled, and the latest claims.</p>
                </div>
                <div className="heading-actions">
                  <button className="secondary" onClick={refresh}>
                    <RefreshCw size={15} /> Refresh
                  </button>
                </div>
              </div>

              {/* 3-Desk Action Cards */}
              <div className="metric-grid three" style={{ marginBottom: '24px' }}>
                <div className="metric-card click-row" onClick={() => setPage('cs1_desk')}>
                  <div className="metric-top">
                    <span className="metric-icon green"><CheckCircle2 size={20} /></span>
                    <span className="pill green"><i />APPROVAL DESK</span>
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
                    <span className="pill amber"><i />REVIEW DESK</span>
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
                    <span className="pill red"><i />REJECTION DESK</span>
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
                <Metric icon={<CircleDollarSign />} label="Total Refund Volume" value={money(metrics?.refund_completed || 0)} note="Recorded refund executions" tone="green" />
              </div>

              <SectionTitle title="Live Ingested Cases" action="View All Tickets" onAction={() => setPage('tickets')} />
              <TicketTable tickets={tickets.slice(0, 6)} onSelect={setSelected} refunds={refunds} />
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
                  note={refunds.some(r => r.live_payments === false) ? "Sandbox settlements: no real money moved" : "Settled via payment gateway"}
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
                            <ClaimLink ticket={ticketById(r.ticket_id)} id={r.ticket_id} onOpen={setSelected} />
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
                            {!r.next_step?.can_act ? (
                              <span className="hint">{waitingFor(r.next_step, user?.id)}</span>
                            ) : (
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
                            )}
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

              {/* Stage 2: Dual-Custody Execution Queue */}
              <div className="panel table-panel" style={{ marginBottom: '28px' }}>
                <div className="panel-heading">
                  <div>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CircleDollarSign size={18} color="var(--emerald-600)" />
                      Approved Settlements Ready for Execution (Stage 2)
                    </h3>
                    <p>These refund requests have been approved by Finance and require final gateway execution by an independent executor.</p>
                  </div>
                  <span className="pill green" style={{ padding: '6px 12px', fontSize: '12px' }}>
                    {refunds.filter(r => r.status === 'APPROVED' || r.status === 'RECONCILIATION_REQUIRED').length} Ready for Execution
                  </span>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>REFUND ID</th>
                        <th>TRANSACTION &amp; TICKET</th>
                        <th>DISBURSEMENT AMOUNT</th>
                        <th>OPERATIONAL JUSTIFICATION</th>
                        <th>STATUS</th>
                        <th>APPROVED AT</th>
                        <th>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {refunds.filter(r => r.status === 'APPROVED' || r.status === 'RECONCILIATION_REQUIRED').map(r => (
                        <tr key={r.id}>
                          <td>
                            <span className="mono" style={{ fontWeight: 700, color: 'var(--navy-900)' }}>
                              {r.id.slice(0, 8).toUpperCase()}
                            </span>
                          </td>
                          <td>
                            <strong>{r.transaction_id}</strong>
                            <ClaimLink ticket={ticketById(r.ticket_id)} id={r.ticket_id} onOpen={setSelected} />
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
                            <span className="date-cell">{date(r.updated_at || r.created_at)}</span>
                          </td>
                          <td>
                            <div className="row-actions">
                              {r.next_step && !r.next_step.can_act && (
                                <span className="hint">{waitingFor(r.next_step, user?.id)}</span>
                              )}
                              {r.status === 'APPROVED' && r.next_step?.can_act && (
                                <button
                                  className="primary compact"
                                  onClick={() => handleExecuteRefund(r)}
                                  disabled={busy}
                                  style={{ background: 'var(--indigo-700)', borderColor: 'var(--indigo-700)' }}
                                  title="Execute payout with idempotency key protection"
                                >
                                  <Zap size={14} /> Execute Payout
                                </button>
                              )}
                              {r.status === 'RECONCILIATION_REQUIRED' && r.next_step?.can_act && (
                                <button
                                  className="secondary compact"
                                  onClick={() => handleReconcileRefund(r)}
                                  disabled={busy}
                                  style={{ color: 'var(--amber-700)', borderColor: 'var(--amber-300)' }}
                                  title="Reconcile uncertain gateway timeout"
                                >
                                  <RefreshCw size={14} /> Reconcile Gateway
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!refunds.filter(r => r.status === 'APPROVED' || r.status === 'RECONCILIATION_REQUIRED').length && (
                        <tr>
                          <td colSpan={7}>
                            <div className="empty" style={{ padding: '36px 16px' }}>
                              <span><BadgeCheck size={28} color="var(--emerald-600)" /></span>
                              <strong style={{ color: 'var(--navy-900)', marginTop: '8px' }}>Execution Queue Clear</strong>
                              <p>No approved refunds are waiting for disbursement execution.</p>
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
                          <td><span className="pill green"><i />{r.live_payments === false ? "SETTLED (TEST)" : "SETTLED"}</span></td>
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
                  note="See Refunds for each payment"
                  tone="green"
                />
                <Metric
                  icon={<CircleDollarSign />}
                  label="Total Amount Credited"
                  value={money(refunds.filter(r => r.status === 'REFUNDED').reduce((acc, r) => acc + (Number(r.amount) || 0), 0))}
                  note={refunds.some(r => r.status === "REFUNDED" && r.live_payments === false) ? "Test payments: no real money moved" : "Paid to your original payment method"}
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
                        <th>PROGRESS</th>
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
                            <strong>{t.item_name || humanize(t.category)}</strong>
                            <small className="subline">{t.item_category} · {t.description.slice(0, 40)}...</small>
                          </td>
                          <td>
                            <strong className="amount">{money(t.claimed_amount, t.currency)}</strong>
                          </td>
                          <td>
                            <StatusPill value={t.status} />
                          </td>
                          <td>
                            <span className={`mc-status-inline tone-${CLAIM_TONE[claimStatus(t).code]}`}>
                              <i aria-hidden="true" />{claimStatus(t).label}
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

              {/* My purchases: one row per item, with its refund eligibility. "Request refund" opens a pre-filled
                  request (QuickRefund) instead of a blank form. */}
              <div className="panel table-panel">
                <div className="panel-heading">
                  <div>
                    <h3>My purchases</h3>
                    <p>Request a refund straight from an item: the product, order and amount are filled in from your order.</p>
                  </div>
                  <span className="pill blue" style={{ padding: '6px 12px', fontSize: '12px' }}>
                    {(customerPurchases || []).length} items
                  </span>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>PRODUCT</th>
                        <th>ORDER</th>
                        <th>BOUGHT</th>
                        <th>PAID</th>
                        <th>REFUND</th>
                        <th>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(customerPurchases || []).map(p => {
                        const badge = ELIGIBILITY_BADGE[p.eligibility.status]
                        const claimable = p.eligibility.claimable && !!p.purchase_id
                        return (
                          <tr key={p.purchase_id || p.transaction_id}>
                            <td>
                              <div className="cp-product">
                                <ProductThumb category={p.product?.category} imageUrl={p.product?.image_url} size={36} />
                                <div>
                                  <strong>{p.product?.name || 'Order items unavailable'}</strong>
                                  <small className="subline">{categoryLabel(p.product?.category)}</small>
                                </div>
                              </div>
                            </td>
                            <td><span className="mono">{p.order_id}</span></td>
                            <td><span className="date-cell">{new Date(p.purchased_at).toLocaleDateString(LOCALE)}</span></td>
                            <td><strong className="amount">{money(p.amount, p.currency)}</strong></td>
                            <td>
                              <span className={`fc-badge tone-${badge.tone}`}>{badge.label}</span>
                              {p.eligibility.status === 'ELIGIBLE' && p.eligibility.window_ends_at && (
                                <small className="subline">until {new Date(p.eligibility.window_ends_at).toLocaleDateString(LOCALE)}</small>
                              )}
                            </td>
                            <td>
                              {claimable ? (
                                <button className="primary compact" onClick={() => setQuickRefund(p)}
                                  title="Request a refund for this item; everything is filled in from your order">
                                  <Zap size={13} /> Request refund
                                </button>
                              ) : p.eligibility.existing_claim ? (
                                <button className="secondary compact" onClick={async () => {
                                  try { setSelected(await api.ticket(p.eligibility.existing_claim!.id)) } catch (err) { setNotice((err as Error).message) }
                                }}>
                                  View request
                                </button>
                              ) : (
                                <span className="hint" style={{ display: 'block', maxWidth: '220px', fontSize: '12px' }}>{p.eligibility.message}</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                      {customerPurchases !== null && !customerPurchases.length && (
                        <tr>
                          <td colSpan={6}>
                            <Empty text="No purchases found for your account." />
                          </td>
                        </tr>
                      )}
                      {customerPurchases === null && (
                        <tr><td colSpan={6}><span className="hint">Loading your purchases…</span></td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* APPROVAL DESK: GENUINE & REFUNDABLE */}
          {page === 'cs1_desk' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow" style={{ color: 'var(--emerald-700)' }}><DeskIcon desk="cs1" />APPROVAL DESK</div>
                  <h1>Genuine & Refundable Queue</h1>
                  <p>These tickets matched payment records in the ledger and comply with your store policy. You can execute a direct 1-click refund or manually inspect the order details.</p>
                </div>
                <div className="heading-actions">
                  <span className="pill green" style={{ padding: '8px 14px', fontSize: '12px' }}>
                    {cs1Tickets.length} Cases Waiting for Approval
                  </span>
                </div>
              </div>

              <div className="panel table-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Approval Queue</h3>
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
                            <span className="pill green"><i />{label(LEDGER_STATUS, t.payment_verification).text}</span>
                            <small className="subline" style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {t.policy_evaluation_reason || '—'}
                            </small>
                          </td>
                          <td><StatusPill value={t.status} /></td>
                          <td>
                            <div className="row-actions" onClick={e => e.stopPropagation()}>
                              {(() => {
                                const st = refundStage(t, refunds)
                                return (
                                  <>
                                    <span className={`mc-status-inline rp-chip tone-${st.tone}`}><i aria-hidden="true" />{st.label}</span>
                                    {['NOT_STARTED', 'PAYMENT_FAILED'].includes(st.code) && canProposeFor(user, t) && (
                                      <button
                                        className="primary compact"
                                        onClick={() => handleCS1DirectRefund(t)}
                                        disabled={busy}
                                        title="Approve the refund (a second person approves the payout)"
                                        style={{ background: 'var(--emerald-700)', borderColor: 'var(--emerald-700)' }}
                                      >
                                        <CheckCircle2 size={14} /> Approve refund
                                      </button>
                                    )}
                                    <button className="secondary compact" onClick={() => setSelected(t)} title="Open the claim">
                                      {st.code === 'PAID' || st.code === 'CLOSED' ? 'View' : 'Review & decide'}
                                    </button>
                                  </>
                                )
                              })()}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!cs1Tickets.length && (
                        <tr>
                          <td colSpan={6}>
                            <Empty text="No pending genuine cases in the approval queue right now." />
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* REVIEW DESK: EXCEPTIONS & PROOF NEEDED */}
          {page === 'cs2_desk' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow" style={{ color: 'var(--amber-700)' }}><DeskIcon desk="cs2" />REVIEW DESK</div>
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
                            <Empty text="No exception cases in the review queue right now." />
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* REJECTION DESK: NON-REFUNDABLE / DENIALS */}
          {page === 'cs3_desk' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow" style={{ color: 'var(--rose-700)' }}><DeskIcon desk="cs3" />REJECTION DESK</div>
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
                            <Empty text="No ineligible cases in the rejection queue right now." />
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
          {page === 'tickets' && isCustomer && (
            <MyClaims
              claims={tickets}
              loaded={ticketsLoaded}
              error={ticketsError}
              highlightId={newClaimId}
              onRetry={refresh}
              onOpen={t => setSelected(t)}
              onNewClaim={() => { setClaimPreselectTx(null); setPage('new') }}
            />
          )}

          {page === 'tickets' && !isCustomer && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {user.role === 'cs_1' ? <><DeskIcon desk="cs1" />APPROVAL DESK PIPELINE</> :
                     user.role === 'cs_2' ? <><DeskIcon desk="cs2" />REVIEW DESK PIPELINE</> :
                     user.role === 'cs_3' ? <><DeskIcon desk="cs3" />REJECTION DESK PIPELINE</> : 'OMNICHANNEL CASE REPOSITORY'}
                  </div>
                  <h1>
                    {user.role === 'cs_1' ? 'Approval Queue' :
                     user.role === 'cs_2' ? 'Review Queue' :
                     user.role === 'cs_3' ? 'Rejection Queue' : 'Master Ingested Tickets Queue'}
                  </h1>
                  <p>
                    {user.role === 'cs_1' ? 'Showing only verified, policy-compliant claims assigned to the Approval Desk.' :
                     user.role === 'cs_2' ? 'Showing only discrepancy, damage, and evidence-pending claims assigned to the Review Desk.' :
                     user.role === 'cs_3' ? 'Showing only non-refundable and policy-disqualified claims assigned to the Rejection Desk.' :
                     'Master ledger of all refund cases across the Approval, Review and Rejection desks.'}
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

              <TicketTable tickets={displayedTickets} onSelect={setSelected} refunds={refunds} />
            </>
          )}

          {/* FILE NEW CLAIM (customers only; the API accepts claims from customers only) */}
          {page === 'new' && isCustomer && (
            <FileClaim
              key={claimPreselectTx || 'new'}
              preselectTransactionId={claimPreselectTx}
              onCancel={() => { setClaimPreselectTx(null); setPage('dashboard') }}
              onOpenClaim={async id => {
                try { setSelected(await api.ticket(id)) } catch (err) { setNotice((err as Error).message) }
              }}
              onSubmitted={claim => {
                setClaimPreselectTx(null)
                setNewClaimId(claim.id)
                setNotice(`Your refund request for the ${claim.item_name} has been submitted (reference ${claim.ticket_number}). We'll keep you updated here.`)
                setPage('tickets')
                load()
              }}
            />
          )}

          {/* ECOMMERCE INTEGRATION HUB (ADMINISTRATOR & SUPERVISOR ONLY) */}
          {page === 'ecommerce' && (
            !canOpenPage(user.role, 'ecommerce') ? (
              <div className="panel" style={{ padding: '48px 24px', textAlign: 'center', maxWidth: '580px', margin: '48px auto' }}>
                <ShieldAlert size={44} color="var(--rose-600)" style={{ margin: '0 auto 16px' }} />
                <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--navy-900)' }}>Management access required</h2>
                <p style={{ color: 'var(--navy-600)', margin: '10px 0 24px', lineHeight: 1.6, fontSize: '14px' }}>
                  Developer Integrations is available to Administrators and Supervisors, and read-only to Auditors.
                </p>
                <button
                  className="primary"
                  onClick={() => setPage(user.role === 'cs_1' ? 'cs1_desk' : user.role === 'cs_2' ? 'cs2_desk' : user.role === 'cs_3' ? 'cs3_desk' : 'dashboard')}
                >
                  Return to My Workspace
                </button>
              </div>
            ) : (
              <DeveloperIntegrations
                user={user}
                apiRoot={API_ROOT}
                agents={agentCatalog}
                busy={busy}
                syncing={syncingShopflow}
                onSync={handleSyncShopflow}
                onTestWebhook={handleSimulateShopflowWebhook}
                sim={simEcom}
                setSim={setSimEcom}
                onSimulate={handleSimulateEcom}
                simResult={ecomSimResult}
                onOpenTicket={async id => { try { setSelected(await api.ticket(id)) } catch (err) { setNotice((err as Error).message) } }}
              />
            )
          )}

          {/* FINANCE APPROVALS QUEUE */}
          {page === 'finance_queue' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">FINANCE CLEARING HOUSE</div>
                  <h1>Finance Approvals &amp; Payout Execution</h1>
                  <p>Authorize payouts for approved claims, then approve and execute them under the four-eyes rule.</p>
                </div>
              </div>

              {user.role !== 'customer' && (
                <div className="panel table-panel" style={{ marginBottom: '18px' }}>
                  <div className="section-title" style={{ padding: '12px 16px' }}>
                    <h4>Awaiting payout authorization ({awaitingPayout.length})</h4>
                    <span>Approval Desk claims whose refund nobody has authorized yet</span>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr><th>Ticket</th><th>Customer</th><th>Amount</th><th>Why it is here</th><th>Action</th></tr>
                      </thead>
                      <tbody>
                        {awaitingPayout.map(t => (
                          <tr key={t.id}>
                            <td><strong className="mono">{t.ticket_number}</strong></td>
                            <td>{t.customer_name || t.customer_id}</td>
                            <td><strong className="amount">{money(t.claimed_amount, t.currency)}</strong></td>
                            <td style={{ maxWidth: '320px', fontSize: '12px' }}>{t.policy_evaluation_reason}</td>
                            <td>
                              {(t as any).can_authorize ? (
                                <button className="primary compact" disabled={busy} onClick={() => handleAuthorizePayout(t)}>
                                  <Zap size={14} /> Authorize Payout
                                </button>
                              ) : (
                                <span className="hint">By {((t as any).authorize_roles || []).map(roleLabel).join(' or ')}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {!awaitingPayout.length && (
                          <tr><td colSpan={5} className="hint">Nothing waiting for authorization.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Every refund still moving through the four-eyes steps; actions follow the server's policy (next_step) */}
              <div className="panel table-panel">
                <div className="section-title" style={{ padding: '12px 16px' }}>
                  <h4>Refunds in progress ({refunds.filter((r: any) => r.next_step).length})</h4>
                  <span>Propose, approve and execute must be done by three different people</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Refund</th><th>Amount</th><th>Status</th><th>Next step</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                      {refunds.filter((r: any) => r.next_step).map((r: any) => (
                        <tr key={r.id}>
                          <td><span className="mono bold">#{r.id.slice(0, 8).toUpperCase()}</span> <ClaimLink ticket={ticketById(r.ticket_id)} id={r.ticket_id} onOpen={setSelected} /><br /><span className="hint">{r.reason}</span></td>
                          <td className="amount">{money(r.amount, r.currency)}</td>
                          <td><StatusPill value={r.status} /></td>
                          <td style={{ fontSize: '12px', maxWidth: '280px' }}>{waitingFor(r.next_step, user.id)}</td>
                          <td>
                            {!r.next_step.can_act ? (
                              <span className="hint">Not your step</span>
                            ) : r.next_step.action === 'approve' ? (
                              <div className="row-actions">
                                <button className="primary compact" disabled={busy} onClick={() => handleApproveRefund(r)}>
                                  <Check size={14} /> Approve Payout
                                </button>
                                <button className="secondary compact" disabled={busy} onClick={() => handleRejectRefund(r)}>
                                  <X size={14} /> Reject
                                </button>
                              </div>
                            ) : r.next_step.action === 'execute' ? (
                              <button className="primary compact" disabled={busy} onClick={() => handleExecuteRefund(r)}>
                                <Zap size={14} /> Execute Payout
                              </button>
                            ) : (
                              <button className="secondary compact" disabled={busy} onClick={() => handleReconcileRefund(r)}>
                                <RefreshCw size={14} /> Reconcile Gateway
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!refunds.filter((r: any) => r.next_step).length && (
                        <tr><td colSpan={5}><Empty text="No refunds waiting for approval or execution." /></td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* REFUND OPERATIONS REGISTER & GENERAL LEDGER */}
          {page === 'refunds' && isCustomer && (
            <CustomerRefunds refunds={refunds} claims={tickets} loaded={ticketsLoaded} onOpen={setSelected} onRetry={refresh} />
          )}

          {page === 'refunds' && !isCustomer && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">FINANCIAL GOVERNANCE &amp; GENERAL LEDGER</div>
                  <h1>{user.role === 'finance_approver' ? 'Refund Authorization & Double-Entry Ledger' : 'Settlement Register & Ledger'}</h1>
                  <p>Authoritative double-entry accounting journals, chart of accounts balances, and payment gateway settlements.</p>
                </div>
                <div className="heading-actions" role="group" aria-label="Ledger view">
                  <button
                    className={ledgerSubTab === 'settlements' ? 'primary compact' : 'secondary compact'}
                    aria-pressed={ledgerSubTab === 'settlements'}
                    onClick={() => setLedgerSubTab('settlements')}
                    style={{ fontSize: '12px' }}
                  >
                    Settlements
                  </button>
                  <button
                    className={ledgerSubTab === 'journals' ? 'primary compact' : 'secondary compact'}
                    aria-pressed={ledgerSubTab === 'journals'}
                    onClick={() => { setLedgerSubTab('journals'); api.ledgerJournals().then(setJournals).catch(() => {}); }}
                    style={{ fontSize: '12px' }}
                  >
                    Double-Entry Journals ({journals.length})
                  </button>
                  <button
                    className={ledgerSubTab === 'accounts' ? 'primary compact' : 'secondary compact'}
                    aria-pressed={ledgerSubTab === 'accounts'}
                    onClick={() => { setLedgerSubTab('accounts'); api.ledgerAccounts().then(setAccounts).catch(() => {}); }}
                    style={{ fontSize: '12px' }}
                  >
                    Chart of Accounts ({accounts.length})
                  </button>
                </div>
              </div>

              {ledgerSubTab === 'settlements' && (
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
                            <td><span className="mono">{r.id.slice(0, 8).toUpperCase()}</span><br /><ClaimLink ticket={ticketById(r.ticket_id)} id={r.ticket_id} onOpen={setSelected} /></td>
                            <td className="amount">{money(r.amount, r.currency)}</td>
                            <td><StatusPill value={r.status} /></td>
                            <td><span className="mono">{r.provider_reference || '—'}</span>{r.status === 'REFUNDED' && r.live_payments === false && <small className="subline">Test payment: no real money moved</small>}</td>
                            <td style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.rejection_reason ? `Rejected: ${r.rejection_reason}` : r.reason}</td>
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
              )}

              {ledgerSubTab === 'journals' && (
                <div className="panel table-panel">
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>JOURNAL ID</th>
                          <th>TICKET / TX</th>
                          <th>DESCRIPTION</th>
                          <th>DEBITS</th>
                          <th>CREDITS</th>
                          <th>INVARIANT BALANCE</th>
                          <th>POSTED DATE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {journals.map(j => {
                          const debits = (j.entries || []).filter((e: any) => e.entry_type === 'DEBIT')
                          const credits = (j.entries || []).filter((e: any) => e.entry_type === 'CREDIT')
                          const totalD = debits.reduce((acc: number, e: any) => acc + e.amount_minor, 0)
                          const totalC = credits.reduce((acc: number, e: any) => acc + e.amount_minor, 0)
                          const isBalanced = totalD === totalC && totalD > 0
                          return (
                            <tr key={j.id}>
                              <td><span className="mono bold">{j.id.slice(0, 8).toUpperCase()}</span></td>
                              <td><span className="mono">{j.ticket_id?.slice(0, 8) || j.transaction_id || '—'}</span></td>
                              <td style={{ maxWidth: '260px' }}>{j.description}</td>
                              <td>
                                {debits.map((d: any) => (
                                  <div key={d.id} className="mono" style={{ fontSize: '11px', color: 'var(--navy-900)' }}>
                                    <strong>{d.account_id}</strong>: {money(d.amount_minor / 100, j.currency)}
                                  </div>
                                ))}
                              </td>
                              <td>
                                {credits.map((c: any) => (
                                  <div key={c.id} className="mono" style={{ fontSize: '11px', color: 'var(--navy-800)' }}>
                                    <strong>{c.account_id}</strong>: {money(c.amount_minor / 100, j.currency)}
                                  </div>
                                ))}
                              </td>
                              <td>
                                {isBalanced ? (
                                  <span className="pill green" style={{ fontSize: '11px' }}><i />Debits = Credits Balanced</span>
                                ) : (
                                  <span className="pill red" style={{ fontSize: '11px' }}><i />Unbalanced</span>
                                )}
                              </td>
                              <td><span className="date-cell">{j.posted_at ? date(j.posted_at) : '—'}</span></td>
                            </tr>
                          )
                        })}
                        {!journals.length && (
                          <tr>
                            <td colSpan={7}><Empty text="No double-entry journals posted yet." /></td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {ledgerSubTab === 'accounts' && (
                <div className="panel table-panel">
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>ACCOUNT CODE</th>
                          <th>ACCOUNT NAME</th>
                          <th>TYPE</th>
                          <th>CURRENCY</th>
                          <th>TOTAL DEBITS</th>
                          <th>TOTAL CREDITS</th>
                          <th>NET BALANCE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accounts.map(a => (
                          <tr key={a.id}>
                            <td><span className="mono bold">{a.id}</span></td>
                            <td><strong>{a.name}</strong></td>
                            <td><span className="pill blue" style={{ fontSize: '11px' }}>{a.account_type}</span></td>
                            <td><span className="mono">{a.currency}</span></td>
                            <td className="amount">{money((a.total_debit_minor || 0) / 100, a.currency)}</td>
                            <td className="amount">{money((a.total_credit_minor || 0) / 100, a.currency)}</td>
                            <td className="amount" style={{ fontWeight: 700 }}>
                              {money((a.net_balance_minor || 0) / 100, a.currency)}
                            </td>
                          </tr>
                        ))}
                        {!accounts.length && (
                          <tr>
                            <td colSpan={7}><Empty text="No ledger accounts found." /></td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* 8 SPECIALIST AGENTS REGISTRY */}
          {page === 'automation' && (
            !canOpenPage(user.role, 'automation') ? (
              <div className="panel" style={{ padding: '48px 24px', textAlign: 'center', maxWidth: '580px', margin: '48px auto' }}>
                <ShieldAlert size={44} color="var(--rose-600)" style={{ margin: '0 auto 16px' }} />
                <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--navy-900)' }}>Internal Operations Access Required</h2>
                <p style={{ color: 'var(--navy-600)', margin: '10px 0 24px', lineHeight: 1.6, fontSize: '14px' }}>
                  The {agentCatalog.length} Specialist Agents Registry and pipeline control plane are restricted to operational staff and administrators.
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
                    <h1>{agentCatalog.length} Specialist Agents Registry</h1>
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
                      <span>{runningAllAgents ? `Executing ${agentCatalog.length} Agents...` : `Run All ${agentCatalog.length} Agents Across Active Tickets`}</span>
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
                      <span>{runningAllAgents ? `Executing ${agentCatalog.length} Agents Pipeline...` : `Run All ${agentCatalog.length} Agents Now`}</span>
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
                        <span className="pill green"><i />Approval</span>
                        <span className="pill amber"><i />Review</span>
                        <span className="pill red"><i />Rejection</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="metric-grid">
                  {agentCatalog.map((agent, i) => (
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
            !canOpenPage(user.role, 'audit') ? (
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
          <span><Shield size={14} /> {import.meta.env.MODE}</span>
        </footer>
      </main>

      {/* --- TICKET DETAILS / DESK ACTION DRAWER --- */}
      {quickRefund && user && isCustomer && (
        <QuickRefund
          purchase={quickRefund}
          reasons={claimReasons}
          user={user}
          onClose={() => setQuickRefund(null)}
          onSubmitted={claim => { setNewClaimId(claim.id); loadCustomerPurchases(); load() }}
          onOpenClaim={claim => { setQuickRefund(null); setSelected(claim); setPage('tickets') }}
        />
      )}

      {selected && isCustomer && (
        <CustomerClaimDrawer
          claim={selected}
          refunds={refunds}
          userId={user.id}
          onClose={() => setSelected(null)}
          onChanged={t => { setSelected(t); load(false) }}
        />
      )}

      {selected && !isCustomer && (
        <div className="drawer-backdrop" onClick={() => setSelected(null)}>
          <aside className="ticket-drawer" onClick={e => e.stopPropagation()} style={{ width: 'min(680px, 100%)' }}>
            <div className="drawer-top">
              <div>
                <div className="eyebrow">
                  ASSIGNED DESK: <strong style={{ color: selected.assigned_desk === 'CS_1' ? 'var(--emerald-700)' : selected.assigned_desk === 'CS_2' ? 'var(--amber-700)' : 'var(--rose-700)' }}>
                    {label(DESK, selected.assigned_desk).text} · {label(BUCKET, selected.decision_bucket).text}
                  </strong>
                </div>
                <h2>{selected.ticket_number}</h2>
              </div>
              <button className="icon-btn" onClick={() => setSelected(null)} aria-label="Close ticket">
                <X size={18} />
              </button>
            </div>

            <div className="drawer-scroll">
              <div className="drawer-badges">
                <StatusPill value={selected.status} />
                <PriorityPill value={selected.priority} />
                <span className="pill blue"><i />{selected.item_category}</span>
              </div>

              <h3>{selected.item_name || humanize(selected.category)}</h3>
              <p className="ticket-description">{selected.description}</p>

              {user.role !== 'customer' && (
                <div style={{ padding: '12px 14px', margin: '10px 0 14px', background: 'var(--indigo-50)', border: '1px solid var(--indigo-100)', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
                  <strong>What to do next</strong>
                  <p style={{ margin: '4px 0 0' }}>{nextStepText(selected, user, refunds)}</p>
                </div>
              )}

              {user.role !== 'customer' && timeline.length > 0 && (
                <div className="drawer-section">
                  <div className="section-title"><h4>History</h4><span>{timeline.length} step(s)</span></div>
                  <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', lineHeight: 1.6 }}>
                    {timeline.map((h: any, i: number) => (
                      <li key={i}>
                        <span className="hint">{h.at ? new Date(h.at).toLocaleString(LOCALE) : ''}</span>{' '}
                        <strong>{h.actor ? `${h.actor.name} (${roleName(h.actor.role)})` : 'RITOS (automatic)'}</strong>{' '}
                        {h.trigger === 'HUMAN_DECISION' ? (HUMAN_DECISION[h.decision] || 'made a decision') : (RUN_TRIGGER[h.trigger] || 'ran the checks')}
                        {h.waiting_for ? <><ArrowRight size={12} className="inline-icon between" aria-label="then" />{label(NEXT_ACTION, h.waiting_for).text}</> : null}
                        {h.assigned_to?.name ? <> · assigned to {h.assigned_to.name} ({roleName(h.assigned_to.role)})</> : null}
                        {h.note ? <span className="hint"> · “{h.note}”</span> : null}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

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
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '6px 12px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 800, color: '#a5b4fc' }}>
                    <GitFork size={15} /> RITOS 3-Step Routing Decision Tree
                  </div>
                  <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#94a3b8' }}>
                    Step 1<ChevronRight size={11} className="inline-icon between" aria-hidden="true" />Step 2<ChevronRight size={11} className="inline-icon between" aria-hidden="true" />Step 3
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: '10px' }}>
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

              {/* REFUND: where the payout stands and the actions allowed at this stage (desk/RefundPanel.tsx) */}
              {(selected.decision_bucket === 'GENUINE_REFUNDABLE' || refunds.some((r: any) => r.ticket_id === selected.id)) && (
                <>
                  {selected.policy_evaluation_reason && (
                    <p className="hint" style={{ margin: '0 0 8px', fontSize: '12px' }}>
                      <strong>Why it is eligible:</strong> {selected.policy_evaluation_reason}
                    </p>
                  )}
                  <RefundPanel
                    ticket={selected}
                    refunds={refunds}
                    user={user}
                    busy={busy}
                    canPropose={canProposeFor(user, selected)}
                    proposeRoles={proposalRoles(user, selected)}
                    onPropose={() => handleCS1DirectRefund(selected)}
                    onRejectClaim={reason => handleCS1ManualDecide(selected, 'CANCEL', reason)}
                    onApprove={r => handleApproveRefund(r)}
                    onRejectPayout={(r, reason) => handleRejectRefund(r, reason)}
                    onExecute={r => handleExecuteRefund(r)}
                    onReconcile={r => handleReconcileRefund(r)}
                    delivery={storeDelivery}
                    onRetryDelivery={id => handleRetryDelivery(id)}
                  />
                </>
              )}

              {/* ACTION BOX FOR Review Desk (EXCEPTIONS / PROOF NEEDED) */}
              {selected.decision_bucket === 'EXCEPTIONAL_PROOF_NEEDED' && (
                <div style={{ background: 'var(--amber-50)', border: '1px solid var(--amber-100)', padding: '18px', borderRadius: 'var(--radius-lg)', marginBottom: '22px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--amber-700)', fontWeight: 800, fontSize: '14px', marginBottom: '8px' }}>
                    <AlertTriangle size={18} /> Review Desk Actions
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
                          <i />{label(PROOF_STATUS, selected.proof_status).text}
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
                              Vision: {selected.classification_evidence?.visual_analysis?.verification_status || 'not assessed'}
                            </span>
                          </div>
                        )}

                        {/* Vision Metrics Breakdown */}
                        <div style={{ flex: 1, fontSize: '11px', color: 'var(--navy-700)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px' }}>
                            <div style={{ padding: '6px 8px', background: 'var(--slate-50)', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                              <span style={{ color: 'var(--text-muted)', fontSize: '10px', display: 'block' }}>Product Identity (7A):</span>
                              <strong style={{ color: selected.classification_evidence?.visual_analysis?.product_identity_status === 'verified' ? 'var(--emerald-700)' : 'var(--navy-800)' }}>
                                {selected.classification_evidence?.visual_analysis?.product_identity_status || 'not_assessable'}
                              </strong>
                            </div>
                            <div style={{ padding: '6px 8px', background: 'var(--slate-50)', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                              <span style={{ color: 'var(--text-muted)', fontSize: '10px', display: 'block' }}>Defect Verification (7B):</span>
                              <strong style={{ color: selected.classification_evidence?.visual_analysis?.defect_status === 'verified' ? 'var(--emerald-700)' : (selected.classification_evidence?.visual_analysis?.defect_status === 'mismatch' ? 'var(--rose-700)' : 'var(--navy-800)') }}>
                                {selected.classification_evidence?.visual_analysis?.defect_status || 'not_assessable'}
                              </strong>
                            </div>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px' }}>
                            <div style={{ padding: '6px 8px', background: 'var(--slate-50)', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                              <span style={{ color: 'var(--text-muted)', fontSize: '10px', display: 'block' }}>Verification Status:</span>
                              <strong>{selected.classification_evidence?.visual_analysis?.verification_status || 'inconclusive'}</strong>
                            </div>
                            <div style={{ padding: '6px 8px', background: 'var(--slate-50)', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                              <span style={{ color: 'var(--text-muted)', fontSize: '10px', display: 'block' }}>Visual Confidence:</span>
                              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                {selected.classification_evidence?.visual_analysis?.visual_confidence ?? 'Not calibrated (honest)'}
                              </span>
                            </div>
                          </div>

                          {selected.classification_evidence?.visual_analysis?.model_version && (
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                              <strong>Vision Engine:</strong> {selected.classification_evidence.visual_analysis.model_version}
                            </div>
                          )}

                          {selected.classification_evidence?.visual_analysis?.quality_issues?.length > 0 && (
                            <div style={{ fontSize: '10px', color: 'var(--amber-800)' }}>
                              <strong>Quality Issues:</strong> {selected.classification_evidence.visual_analysis.quality_issues.join(', ')}
                            </div>
                          )}

                          {selected.classification_evidence?.visual_analysis?.recommended_next_step && (
                            <div style={{ padding: '6px 8px', background: '#eff6ff', borderRadius: '4px', border: '1px solid #bfdbfe', fontSize: '10px', color: '#1e40af' }}>
                              <strong>Next Step:</strong> {selected.classification_evidence.visual_analysis.recommended_next_step}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Decision Arbiter: Reason Codes & Reviewer Checklist */}
                  {((selected.classification_evidence?.decision?.reason_codes && selected.classification_evidence.decision.reason_codes.length > 0) ||
                    (selected.classification_evidence?.decision?.reviewer_checklist && selected.classification_evidence.decision.reviewer_checklist.length > 0)) && (
                    <div style={{ marginTop: '14px', padding: '14px', background: '#ffffff', borderRadius: 'var(--radius-md)', border: '1px solid var(--indigo-200)', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--navy-900)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Shield size={14} color="var(--indigo-600)" />
                          Decision Arbiter Trace (Rule Version: {selected.classification_evidence?.decision?.rule_version || 'not recorded'})
                        </span>
                        <span className="pill blue" style={{ fontSize: '10px' }}>
                          {anyStatus(selected.classification_evidence?.decision?.next_action || selected.status).text}
                        </span>
                      </div>

                      {selected.classification_evidence?.decision?.reason_codes?.length > 0 && (
                        <div style={{ marginBottom: '8px' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Reason Codes:</span>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                            {selected.classification_evidence.decision.reason_codes.map((code: string, idx: number) => (
                              <span key={idx} className="pill blue" style={{ fontSize: '10px', fontFamily: 'monospace' }}>
                                {reasonText(code)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {selected.classification_evidence?.decision?.reviewer_checklist?.length > 0 && (
                        <div>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Reviewer Checklist:</span>
                          <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: '11px', color: 'var(--navy-800)', lineHeight: '1.5' }}>
                            {selected.classification_evidence.decision.reviewer_checklist.map((item: string, idx: number) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                    <button
                      className="primary compact"
                      onClick={() => handleProofAction(selected, 'APPROVE_PROOF', 'Photo proof verified by human agent')}
                      disabled={busy}
                      style={{ background: 'var(--emerald-600)', borderColor: 'var(--emerald-600)' }}
                    >
                      <CheckCircle2 size={13} /> Approve Proof &amp; Send for Approval
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

              {/* ACTION BOX FOR Rejection Desk (NON-REFUNDABLE / DENIALS) */}
              {selected.decision_bucket === 'NON_REFUNDABLE' && (
                <div style={{ background: 'var(--rose-50)', border: '1px solid var(--rose-100)', padding: '18px', borderRadius: 'var(--radius-lg)', marginBottom: '22px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--rose-700)', fontWeight: 800, fontSize: '14px', marginBottom: '8px' }}>
                    <X size={18} /> Rejection Desk Actions
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--rose-800)', margin: '0 0 12px' }}>
                    <strong>Policy Ineligibility:</strong> {selected.policy_evaluation_reason}
                  </p>

                  {selected.rejection_notice_sent_at ? (
                    // Already closed and the customer was told: show the outcome instead of offering to send it again
                    <div className="mc-status tone-red" role="status">
                      <span className="mc-status-label"><i aria-hidden="true" />Closed, not refunded</span>
                      <p>Rejection notice posted to the customer's request on {date(selected.rejection_notice_sent_at)}. No refund was paid.</p>
                    </div>
                  ) : (
                    <>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--navy-800)', display: 'block', marginBottom: '4px' }}>
                        AI Pre-Drafted Rejection Notice to Customer:
                      </label>
                      <textarea
                        rows={4}
                        value={draftMessage}
                        onChange={e => setDraftMessage(e.target.value)}
                        style={{ width: '100%', background: '#ffffff', border: '1px solid var(--rose-100)', borderRadius: 'var(--radius-md)', padding: '10px', fontSize: '12px' }}
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
                    </>
                  )}
                </div>
              )}

              {/* Data Grid */}
              <div className="detail-grid">
                <Detail label="Claimed Amount" value={money(selected.claimed_amount, selected.currency)} />
                <Detail label="Order Reference" value={selected.order_id || '—'} />
                <Detail label="Transaction Reference" value={selected.transaction_id} />
                <Detail label="Customer Contact" value={selected.customer_phone || selected.customer_email || '—'} />
                <Detail label="Product category" value={humanize(selected.item_category || 'GENERAL')} />
                <Detail label="Payment check" value={label(LEDGER_STATUS, selected.payment_verification).text} />
              </div>

              {user.role !== 'customer' && (
              <details style={{ margin: '12px 0' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}>Audit details: agent trace, decision codes and re-run</summary>
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
                  <div><strong>Verdict:</strong> {label(BUCKET, selected.decision_bucket).text}</div>
                  <div><strong>Desk:</strong> {label(DESK, selected.assigned_desk).text}</div>
                  <div><strong>Policy Reasoning:</strong> {selected.policy_evaluation_reason}</div>
                </div>
              </div>

              {/* SPECIALIST AGENTS EXECUTION TRACE */}
              {selected.classification_evidence?.agents?.length > 0 && (
                <div style={{ marginTop: '16px', marginBottom: '18px', padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <strong style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--navy-900)' }}>
                      <Cpu size={16} color="var(--indigo-600)" /> RITOS {agentCatalog.length} Specialist Agents Execution Trace
                    </strong>
                    <span className={`pill ${selected.classification_evidence?.workflow?.status === 'WAITING_HUMAN' ? 'amber' : 'green'}`}>
                      <i />
                      {selected.classification_evidence.agents.filter((ag: any) => ag.status === 'COMPLETED').length}/{selected.classification_evidence.agents.length} COMPLETED
                      {selected.classification_evidence?.workflow?.status ? ` · ${selected.classification_evidence.workflow.status.replace('_', ' ')}` : ''}
                    </span>
                  </div>
                  {selected.classification_evidence?.workflow?.next_action && (
                    <div style={{ fontSize: '12px', marginBottom: '10px', color: 'var(--navy-700)' }}>
                      <strong>Waiting for:</strong> {label(NEXT_ACTION, selected.classification_evidence.workflow.next_action).text}
                      {selected.classification_evidence.workflow.gate_reason ? ` — ${selected.classification_evidence.workflow.gate_reason}` : ''}
                    </div>
                  )}

                  {(() => {
                    const briefing = selected.classification_evidence.agents.find((ag: any) => ag.agent_id === 'review_coordination')?.briefing
                    if (!briefing) return null
                    return (
                      <div style={{ padding: '10px 12px', marginBottom: '10px', background: 'var(--indigo-50)', border: '1px solid var(--indigo-100)', borderRadius: 'var(--radius-md)', fontSize: '12px' }}>
                        <strong>Reviewer briefing</strong>
                        <span style={{ fontSize: '10px', color: 'var(--navy-500)', marginLeft: '6px' }}>
                          {briefing.source === 'llm' ? `AI-generated (${briefing.llm?.provider}/${briefing.llm?.model}); advisory only` : 'From routing rules'}
                        </span>
                        <p style={{ margin: '4px 0' }}>{briefing.summary}</p>
                        {briefing.check_first?.length > 0 && (
                          <ul style={{ margin: 0, paddingLeft: '18px' }}>
                            {briefing.check_first.map((c: string, i: number) => <li key={i}>{c}</li>)}
                          </ul>
                        )}
                      </div>
                    )
                  })()}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: '8px' }}>
                    {selected.classification_evidence.agents.map((ag: any, idx: number) => (
                      <div key={idx} style={{ padding: '10px 12px', background: 'var(--bg-page)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', fontSize: '11px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 700, color: 'var(--navy-900)' }}>
                            {idx + 1}. {ag.agent_name}
                          </span>
                          <span style={{ fontSize: '9px', fontWeight: 700, color: ag.status === 'COMPLETED' ? 'var(--emerald-700)' : ag.status === 'FAILED' ? '#b91c1c' : 'var(--navy-500)' }}>{ag.status === 'COMPLETED' ? <Check size={10} className="inline-icon" aria-hidden="true" /> : ag.status === 'FAILED' ? <X size={10} className="inline-icon" aria-hidden="true" /> : null}{ag.status}</span>
                        </div>
                        <p style={{ margin: 0, color: 'var(--navy-600)', lineHeight: '1.4' }}>
                          {ag.findings}
                          {ag.llm_assist?.used && (
                            <span style={{ display: 'block', marginTop: '4px', fontSize: '10px', color: 'var(--indigo-700)' }}>
                              AI assist: {ag.llm_assist.provider}/{ag.llm_assist.model} · {ag.llm_assist.latency_ms} ms{ag.llm_assist.outcome ? ` · ${ag.llm_assist.outcome}` : ''}
                            </span>
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              </details>
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
              <button className="icon-btn" onClick={() => setShowDocModal(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="doc-article">
              <h3>1. The 3 Operational Desks</h3>
              <div className="doc-agent-card" style={{ borderLeft: '4px solid #059669' }}>
                <strong style={{ color: '#059669' }}><DeskIcon desk="cs1" />Approval Desk: genuine, refundable claims</strong>
                <p>
                  For claims where the transaction is verified on the ledger, within the product return window, and zero risk flags.
                  <strong>The Approval Desk can either 1-click execute the refund directly</strong>, or manually review and approve/cancel with audit notes.
                </p>
              </div>

              <div className="doc-agent-card" style={{ borderLeft: '4px solid #d97706' }}>
                <strong style={{ color: '#d97706' }}><DeskIcon desk="cs2" />Review Desk: claims that need proof or a person</strong>
                <p>
                  For claims involving damaged packaging, broken hinges, missing items, or wrong products delivered.
                  <strong>The AI pre-drafts an SMS/email tailored with the order reference</strong> asking for the exact proof items. The Review Desk checks it and clicks Send.
                </p>
              </div>

              <div className="doc-agent-card" style={{ borderLeft: '4px solid #e11d48' }}>
                <strong style={{ color: '#e11d48' }}><DeskIcon desk="cs3" />Rejection Desk: claims that are not refundable</strong>
                <p>
                  For claims past the return window (e.g. &gt;7 days for electronics), fake transaction IDs, or final-sale hygiene items.
                  <strong>The AI writes a polite, legally compliant rejection explanation</strong>. The Rejection Desk checks it and clicks Send.
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
              <button className="icon-btn" onClick={() => setActiveAgentModal(null)} aria-label="Close">
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
  const l = anyStatus(value)
  return (
    <span className={`pill ${l.tone === 'grey' ? 'blue' : l.tone}`} title={String(value || '')}>
      <i />{l.text}
    </span>
  )
}

function PriorityPill({ value }: any) {
  return <span className={`priority-pill ${String(value).toLowerCase()}`}>{value}</span>
}

function TicketTable({ tickets, onSelect, refunds = [] }: { tickets: Ticket[]; onSelect: (t: Ticket) => void; refunds?: any[] }) {
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
                    <strong>{t.item_name || humanize(t.category)}</strong>
                    <small>{t.description}</small>
                  </div>
                </td>
                <td>
                  <span className="amount">{money(t.claimed_amount, t.currency)}</span>
                </td>
                <td>
                  <span className={`pill ${t.assigned_desk === 'CS_1' ? 'green' : t.assigned_desk === 'CS_2' ? 'amber' : 'red'}`}>
                    <i />{t.assigned_desk ? label(DESK, t.assigned_desk).text : 'Not routed'}{t.decision_bucket ? ` · ${label(BUCKET, t.decision_bucket).text}` : ''}
                  </span>
                </td>
                <td>
                  <StatusPill value={t.status} />
                  {/* Where the refund stands (same wording as the claim drawer and close to what the customer sees) */}
                  {(() => {
                    const st = refundStage(t, refunds)
                    return t.decision_bucket === 'GENUINE_REFUNDABLE' && st.code !== 'NOT_STARTED'
                      ? <small className={`mc-status-inline rp-chip tone-${st.tone}`} style={{ display: 'flex', marginTop: '4px' }}><i aria-hidden="true" />{st.label}</small>
                      : null
                  })()}
                </td>
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

// A refund's claim: its ticket number (opens the claim) when the desk has it loaded, otherwise the short id
function ClaimLink({ ticket, id, onOpen }: { ticket?: Ticket; id?: string; onOpen: (t: Ticket) => void }) {
  if (!ticket) return <small className="subline mono">Claim #{id?.slice(0, 8)}</small>
  return (
    <button type="button" className="text-btn subline" style={{ padding: 0, fontSize: '12px' }} onClick={() => onOpen(ticket)}>
      {ticket.ticket_number} <ArrowUpRight size={12} aria-hidden="true" />
    </button>
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
