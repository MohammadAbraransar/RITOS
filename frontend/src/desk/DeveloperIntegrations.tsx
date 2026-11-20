// Developer Integrations: one console for store webhooks, the claims API, MCP servers (planned) and integration logs.
// Administrator and Supervisor manage; Auditor reads. Every action calls an existing endpoint with its own role guard;
// credentials are shown only as set / not set (GET /integrations/overview never returns their values).
import { useEffect, useState, type ReactNode } from 'react'
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpRight, BookOpen, Bot, CheckCircle2, Circle, CircleDashed, KeyRound,
  LayoutGrid, Lock, Plug, RefreshCw, Send, Server, Store, Webhook, Zap
} from 'lucide-react'
import { api, type InboundEventRow, type IntegrationsOverview, type McpStatus, type User } from '../api'
import { label, roleName, BUCKET, DESK } from '../labels'
import { CodeBlock, CopyButton } from './CodeBlock'
import {
  AUTH_METHODS, CLAIM_FIELDS, CLAIM_RESPONSE, MCP_CONFIG, MCP_FLOW, STORE_EVENTS, STORE_EVENT_RESPONSE, claimSamples,
  claimsApi, storeEventSamples, storeInbound, storeOutbound, type Endpoint
} from './integrationContent'
import './hub.css'

type Tab = 'overview' | 'webhooks' | 'api' | 'mcp' | 'activity'
const TABS: { key: Tab; label: string; icon: typeof Plug }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid },
  { key: 'webhooks', label: 'Webhooks', icon: Webhook },
  { key: 'api', label: 'API Access', icon: KeyRound },
  { key: 'mcp', label: 'MCP Connections', icon: Server },
  { key: 'activity', label: 'Activity & Logs', icon: Activity },
]
const KIND: Record<string, string> = { DECISION: 'Refund decision', STATUS: 'Status update', NOTIFICATION: 'Customer message' }
const CATEGORIES = ['AUDIO', 'MOBILE', 'COMPUTERS', 'FOOTWEAR', 'HOME', 'SMART HOME', 'ACCESSORIES', 'BAGS', 'DIGITAL',
                    'WEARABLES', 'PERIPHERALS', 'DISPLAYS', 'TABLETS', 'ELECTRONICS', 'APPAREL', 'GENERAL']
const when = (iso?: string | null) => iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '–'
const eventName = (t: string) => t.replace(/^refund\./, '').replace(/[._]/g, ' ').replace(/^\w/, c => c.toUpperCase())

type Props = {
  user: User
  apiRoot: string
  agents: any[]
  busy: boolean
  syncing: boolean
  onSync: () => void
  onTestWebhook: () => void
  sim: Record<string, string>
  setSim: (s: any) => void
  onSimulate: () => void
  simResult: any
  onOpenTicket: (ticketId: string) => void
}

type Tone = 'ok' | 'warn' | 'bad' | 'off'
function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'off' ? CircleDashed : tone === 'bad' ? AlertTriangle : Circle
  return <span className={`dev-status is-${tone}`}><Icon size={13} aria-hidden="true" />{children}</span>
}

function EndpointRow({ e }: { e: Endpoint }) {
  return (
    <li className="hub-endpoint">
      <span className={`hub-method is-${e.method.toLowerCase()}`}>{e.method}</span>
      <div className="hub-endpoint-body"><code>{e.url}</code><span>{e.purpose}</span></div>
      <CopyButton text={e.url} label="Copy URL" />
    </li>
  )
}

function Section({ title, desc, icon: Icon, action, children }: { title: string; desc?: ReactNode; icon?: typeof Plug; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel hub-card">
      <header className="hub-card-head">
        {Icon && <span className="hub-icon"><Icon size={18} aria-hidden="true" /></span>}
        <div><h2>{title}</h2>{desc && <p>{desc}</p>}</div>
        {action}
      </header>
      {children}
    </section>
  )
}

export function DeveloperIntegrations(p: Props) {
  const canManage = ['administrator', 'supervisor'].includes(p.user.role)
  const [tab, setTab] = useState<Tab>(() => {
    try { return (localStorage.getItem('ritos_dev_tab') as Tab) || 'overview' } catch { return 'overview' }
  })
  const go = (t: Tab) => { setTab(t); try { localStorage.setItem('ritos_dev_tab', t) } catch {} }

  const [overview, setOverview] = useState<IntegrationsOverview | null>(null)
  const [outbox, setOutbox] = useState<any[] | null>(null)
  const [events, setEvents] = useState<InboundEventRow[] | null>(null)
  const [mcp, setMcp] = useState<McpStatus | null>(null)
  const [error, setError] = useState('')
  const [working, setWorking] = useState('')
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true); setError('')
    const results = await Promise.allSettled([api.integrationsOverview(), api.listOutbox(), api.integrationEvents(), api.mcpServers()])
    if (results[0].status === 'fulfilled') setOverview(results[0].value)
    if (results[1].status === 'fulfilled') setOutbox(results[1].value)
    if (results[2].status === 'fulfilled') setEvents(results[2].value)
    if (results[3].status === 'fulfilled') setMcp(results[3].value)
    const failed = results.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined
    if (failed) setError((failed.reason as Error).message)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function act(name: string, fn: () => Promise<unknown>) {
    setWorking(name)
    try { await fn() } catch (err) { setError((err as Error).message) } finally { setWorking(''); load() }
  }

  const shopUrl = overview?.shopflow.base_url || 'http://127.0.0.1:3000'
  const failed = (outbox || []).filter(m => m.status === 'FAILED')
  const failedCount = overview?.deliveries.failed ?? failed.length

  return (
    <div className="hub dev">
      <div className="page-heading">
        <div>
          <div className="eyebrow">DEVELOPERS</div>
          <h1>Developer Integrations</h1>
          <p>Connect stores and services to RITOS, and see every message that passes between them.</p>
        </div>
        <div className="heading-actions">
          {!canManage && <span className="dev-readonly"><Lock size={13} aria-hidden="true" /> Read-only for {roleName(p.user.role)}</span>}
          <button className="secondary" onClick={load} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh</button>
        </div>
      </div>

      <nav className="dev-tabs" role="tablist" aria-label="Developer Integrations sections">
        {TABS.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`dev-tab${tab === t.key ? ' is-active' : ''}`} onClick={() => go(t.key)}>
            <t.icon size={15} aria-hidden="true" /> {t.label}
            {t.key === 'activity' && failedCount > 0 && <span className="dev-count is-bad">{failedCount}</span>}
            {t.key === 'mcp' && mcp && !mcp.supported && <span className="dev-count">Planned</span>}
          </button>
        ))}
      </nav>

      {error && <p className="hub-error" role="alert"><AlertTriangle size={14} aria-hidden="true" /> {error}</p>}

      {tab === 'overview' && <OverviewTab o={overview} apiRoot={p.apiRoot} go={go} />}
      {tab === 'webhooks' && (
        <WebhooksTab o={overview} apiRoot={p.apiRoot} shopUrl={shopUrl} canManage={canManage} busy={p.busy} syncing={p.syncing}
          onSync={p.onSync} onTestWebhook={p.onTestWebhook} failed={failed} working={working} act={act} go={go} />
      )}
      {tab === 'api' && <ApiTab o={overview} apiRoot={p.apiRoot} canManage={canManage} p={p} />}
      {tab === 'mcp' && <McpTab mcp={mcp} agents={p.agents} canManage={canManage} />}
      {tab === 'activity' && <ActivityTab outbox={outbox} events={events} canManage={canManage} working={working} act={act} />}
    </div>
  )
}

// ---------------------------------------------------------------- Overview
function OverviewTab({ o, apiRoot, go }: { o: IntegrationsOverview | null; apiRoot: string; go: (t: Tab) => void }) {
  if (!o) return <div className="panel hub-card"><p className="hub-muted">Loading integration status…</p></div>
  const c = o.credentials
  const rows: { icon: typeof Plug; name: string; detail: ReactNode; status: ReactNode; tab?: Tab }[] = [
    { icon: Store, name: 'ShopFlow store', detail: <code>{o.shopflow.base_url}</code>,
      status: o.shopflow.connected ? <Status tone="ok">Connected</Status> : <Status tone="warn">Not reachable</Status>, tab: 'webhooks' },
    { icon: Webhook, name: 'Store webhook', detail: 'Store → RITOS events, signed with the store API key',
      status: !c.store_api_key.configured ? <Status tone="bad">No API key</Status>
        : c.store_api_key.development_default ? <Status tone="warn">Development key</Status> : <Status tone="ok">Key set</Status>, tab: 'webhooks' },
    { icon: Send, name: 'Deliveries to the store', detail: `${o.deliveries.sent} delivered · ${o.deliveries.pending} waiting`,
      status: o.deliveries.failed ? <Status tone="bad">{o.deliveries.failed} failed</Status>
        : o.deliveries.pending ? <Status tone="warn">{o.deliveries.pending} waiting</Status> : <Status tone="ok">All delivered</Status>, tab: 'activity' },
    { icon: Activity, name: 'Events received', detail: o.inbound.last_received_at ? `Last: ${when(o.inbound.last_received_at)}` : 'No store events received yet',
      status: <Status tone={o.inbound.last_24h ? 'ok' : 'off'}>{o.inbound.last_24h} in 24 h</Status>, tab: 'activity' },
    { icon: KeyRound, name: 'Claims API for other stores', detail: 'Any store backend can send claims with the shared secret',
      status: c.ecommerce_secret.configured ? <Status tone="ok">Secret set</Status> : <Status tone="off">Not enabled</Status>, tab: 'api' },
    { icon: Lock, name: 'Payment gateway', detail: o.payments.live ? 'Live provider connected' : 'Sandbox only: payouts move no real money',
      status: o.payments.live ? <Status tone="ok">Live</Status> : <Status tone="off">{o.payments.provider === 'SANDBOX' ? 'Sandbox' : o.payments.provider}</Status> },
    { icon: Server, name: 'MCP servers', detail: o.mcp.supported ? `${o.mcp.servers} connected` : 'Not available in this build yet',
      status: o.mcp.supported ? <Status tone={o.mcp.servers ? 'ok' : 'off'}>{o.mcp.servers} servers</Status> : <Status tone="off">Planned</Status>, tab: 'mcp' },
  ]
  return (
    <>
      <section className="panel dev-health" aria-label="Integration health">
        <ul>
          {rows.map(r => (
            <li key={r.name}>
              <span className="dev-health-icon"><r.icon size={16} aria-hidden="true" /></span>
              <div className="dev-health-body"><strong>{r.name}</strong><span>{r.detail}</span></div>
              <div className="dev-health-status">{r.status}</div>
              {r.tab ? (
                <button className="text-btn dev-health-go" onClick={() => go(r.tab!)} aria-label={`Open ${r.name}`}>
                  Open <ArrowRight size={13} aria-hidden="true" />
                </button>
              ) : <span className="dev-health-go" aria-hidden="true" />}
            </li>
          ))}
        </ul>
      </section>
      <section className="panel hub-card dev-ref">
        <div>
          <h2>API base URL</h2>
          <p className="hub-muted">Every endpoint lives under <code>/api/v1</code>. The full, generated reference lists each route with its inputs.</p>
        </div>
        <div className="dev-ref-actions">
          <code className="dev-base">{apiRoot}/api/v1</code>
          <CopyButton text={`${apiRoot}/api/v1`} />
          <a className="secondary dev-link" href={`${apiRoot}/docs`} target="_blank" rel="noreferrer"><BookOpen size={14} /> API reference <ArrowUpRight size={13} /></a>
        </div>
      </section>
    </>
  )
}

// ---------------------------------------------------------------- Webhooks
function WebhooksTab({ o, apiRoot, shopUrl, canManage, busy, syncing, onSync, onTestWebhook, failed, working, act, go }: any) {
  const connected = !!o?.shopflow.connected
  return (
    <>
      <Section icon={Store} title="ShopFlow store" desc="The store is the system of record: RITOS reads each claim from it, runs its checks and sends the decision back."
        action={o ? (connected ? <Status tone="ok">Connected</Status> : <Status tone="warn">Not reachable</Status>) : null}>
        <div className="hub-actions">
          {canManage && <>
            <button className="primary" onClick={onSync} disabled={syncing}><RefreshCw size={14} className={syncing ? 'spin' : ''} /> {syncing ? 'Syncing…' : 'Sync pending store claims'}</button>
            <button className="secondary" onClick={onTestWebhook} disabled={busy}><Zap size={14} /> Send a test event</button>
          </>}
          <span className="hub-muted">Store address <code>{shopUrl}</code></span>
        </div>
      </Section>

      <Section icon={Webhook} title="Inbound · Store → RITOS" desc="The store calls this endpoint whenever something happens to a refund claim. Repeated events (same event_id) are ignored.">
        <ul className="hub-endpoints"><EndpointRow e={storeInbound(apiRoot)} /></ul>
        <div className="dev-split">
          <div>
            <h3 className="hub-sub">Authentication</h3>
            <p className="dev-text"><code>Authorization: Bearer &lt;RITOS_API_KEY&gt;</code></p>
            <p className="dev-text">The same key is set on both servers and never appears in this console.</p>
            <p className="dev-text">Key: {o?.credentials.store_api_key.development_default
              ? <Status tone="warn">Development key in use</Status> : o?.credentials.store_api_key.configured ? <Status tone="ok">Set</Status> : <Status tone="bad">Not set</Status>}</p>
          </div>
          <div>
            <h3 className="hub-sub">Events</h3>
            <dl className="dev-events">{STORE_EVENTS.map(([k, v]) => <div key={k}><dt><code>{k}</code></dt><dd>{v}</dd></div>)}</dl>
          </div>
        </div>
        <div className="dev-split">
          <div><h3 className="hub-sub">Request</h3><CodeBlock samples={storeEventSamples(apiRoot)} maxHeight={300} /></div>
          <div><h3 className="hub-sub">Response</h3><CodeBlock samples={STORE_EVENT_RESPONSE} maxHeight={300} /></div>
        </div>
      </Section>

      <Section icon={Send} title="Outbound · RITOS → store" desc="RITOS calls the store with the same API key. Messages are queued and retried, so nothing is lost while the store is down.">
        <ul className="hub-endpoints">{storeOutbound(shopUrl).map(e => <EndpointRow key={e.url} e={e} />)}</ul>
        <ul className="dev-rules">
          <li>Retried with growing delays, up to the configured number of attempts (OUTBOX_MAX_ATTEMPTS).</li>
          <li>Kept in order per claim: a failed message holds the later ones for that claim until it is retried.</li>
          <li>A decision the store refuses fails at once and is never reported as delivered.</li>
        </ul>
        <div className="dev-delivery">
          <div className="hub-stats">
            <div><strong>{o?.deliveries.sent ?? '–'}</strong><span>Delivered</span></div>
            <div className={o?.deliveries.pending ? 'is-warn' : ''}><strong>{o?.deliveries.pending ?? '–'}</strong><span>Waiting</span></div>
            <div className={o?.deliveries.failed ? 'is-bad' : ''}><strong>{o?.deliveries.failed ?? '–'}</strong><span>Failed</span></div>
          </div>
          {failed.length > 0 ? (
            <ul className="hub-failed">
              {failed.slice(0, 5).map((m: any) => (
                <li key={m.id}>
                  <div><strong>{KIND[m.kind] || m.kind} · {m.payload?.ticket_id || 'claim'}</strong><span title={m.last_error || ''}>{m.last_error || 'Not delivered'}</span></div>
                  {canManage && <button className="secondary compact" disabled={!!working} onClick={() => act(m.id, () => api.retryOutbox(m.id))}>Retry</button>}
                </li>
              ))}
            </ul>
          ) : o && <p className="hub-ok"><CheckCircle2 size={15} aria-hidden="true" /> Nothing has failed.</p>}
          <div className="hub-actions">
            {canManage && (
              <button className="secondary compact" disabled={!!working} onClick={() => act('deliver', () => api.deliverOutbox())}>
                <RefreshCw size={13} className={working === 'deliver' ? 'spin' : ''} /> Deliver waiting messages now
              </button>
            )}
            <button className="text-btn" onClick={() => go('activity')}>Full delivery log <ArrowRight size={13} /></button>
          </div>
        </div>
      </Section>
    </>
  )
}

// ---------------------------------------------------------------- API Access
function ApiTab({ o, apiRoot, canManage, p }: { o: IntegrationsOverview | null; apiRoot: string; canManage: boolean; p: Props }) {
  const cred = (k: string) => {
    if (k === 'jwt') return <Status tone="ok">Per user</Status>
    const c = (o?.credentials as any)?.[k]
    if (!c) return <Status tone="off">–</Status>
    if (k === 'store_api_key' && c.development_default) return <Status tone="warn">Development key</Status>
    return c.configured ? <Status tone="ok">Set</Status> : <Status tone="off">Not set</Status>
  }
  const field = (k: string, lbl: string, type = 'text') => (
    <label className="hub-field"><span>{lbl}</span><input type={type} value={p.sim[k]} onChange={e => p.setSim({ ...p.sim, [k]: e.target.value })} /></label>
  )
  const r = p.simResult
  return (
    <>
      <Section icon={KeyRound} title="Authentication" desc={<>Secrets live in the server's environment (<code>backend/.env</code>). This console only shows whether each one is set.</>}
        action={<a className="secondary dev-link" href={`${apiRoot}/docs`} target="_blank" rel="noreferrer"><BookOpen size={14} /> API reference <ArrowUpRight size={13} /></a>}>
        <div className="table-wrap">
          <table className="dev-table">
            <thead><tr><th>Method</th><th>Used by</th><th>Header</th><th>Credential</th></tr></thead>
            <tbody>
              {AUTH_METHODS.map(m => (
                <tr key={m.name}><td><strong>{m.name}</strong></td><td>{m.usedBy}</td><td><code>{m.header}</code></td><td>{cred(m.credential)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section icon={Plug} title="Claims API · connect another store" desc={<>Any store backend can send refund claims to one endpoint with the <code>X-Ecommerce-Secret</code> header. Keep the secret on your server; never ship it to a browser.</>}
        action={o && !o.credentials.ecommerce_secret.configured ? <Status tone="off">Secret not set</Status> : null}>
        <ul className="hub-endpoints"><EndpointRow e={claimsApi(apiRoot)} /></ul>
        <h3 className="hub-sub">Request</h3>
        <CodeBlock samples={claimSamples(claimsApi(apiRoot).url)} />
        <details className="hub-details">
          <summary>Request fields</summary>
          <div className="table-wrap">
            <table className="hub-fields">
              <thead><tr><th>Field</th><th>Required</th><th>Meaning</th></tr></thead>
              <tbody>{CLAIM_FIELDS.map(([f, req, m]) => <tr key={f}><td><code>{f}</code></td><td>{req}</td><td>{m}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
        <h3 className="hub-sub">Response</h3>
        <CodeBlock samples={CLAIM_RESPONSE} maxHeight={240} />
      </Section>

      {canManage && (
        <Section icon={Zap} title="Try a claim" desc="Send a claim as a store would, for an order RITOS already knows, and see where it is routed. It creates a real ticket.">
          <div className="hub-form">
            {field('order_id', 'Order ID')}
            {field('transaction_id', 'Transaction ID')}
            {field('customer_email', 'Customer email', 'email')}
            {field('item_name', 'Product')}
            <label className="hub-field">
              <span>Category</span>
              <input list="dev-categories" value={p.sim.item_category} onChange={e => p.setSim({ ...p.sim, item_category: e.target.value.toUpperCase() })} />
              <datalist id="dev-categories">{CATEGORIES.map(c => <option key={c} value={c} />)}</datalist>
            </label>
            {field('claimed_amount', 'Amount (INR)', 'number')}
            <label className="hub-field is-wide"><span>What the customer says</span>
              <textarea rows={2} value={p.sim.description} onChange={e => p.setSim({ ...p.sim, description: e.target.value })} /></label>
          </div>
          <div className="hub-actions"><button className="primary" onClick={p.onSimulate} disabled={p.busy}><Send size={14} /> Send test claim</button></div>
          {r && (
            <div className="hub-result" role="status">
              <div className="hub-result-head">
                <span className={`pill ${label(DESK, r.assigned_desk).tone}`}><i />{label(DESK, r.assigned_desk).text}</span>
                <span className={`pill ${label(BUCKET, r.decision_bucket).tone}`}><i />{label(BUCKET, r.decision_bucket).text}</span>
                {r.ticket_id && <button className="text-btn" onClick={() => p.onOpenTicket(r.ticket_id)}>{r.ticket_number} <ArrowUpRight size={13} /></button>}
              </div>
              <p><strong>Why:</strong> {r.policy_evaluation_reason}</p>
              {r.customer_message_draft && <p className="hub-quote">“{r.customer_message_draft}”</p>}
            </div>
          )}
        </Section>
      )}
    </>
  )
}

// ---------------------------------------------------------------- MCP Connections
function McpTab({ mcp, agents, canManage }: { mcp: McpStatus | null; agents: any[]; canManage: boolean }) {
  const supported = !!mcp?.supported
  const servers = mcp?.servers || []
  return (
    <>
      <Section icon={Server} title="MCP Connections"
        desc="Model Context Protocol servers give RITOS agents controlled access to external tools and data."
        action={
          <div className="dev-mcp-action">
            <button className="primary" disabled={!supported || !canManage} aria-describedby="mcp-why">
              <Plug size={14} /> Connect MCP Server
            </button>
            {!supported && <span id="mcp-why" className="hub-muted">Available once the server adds MCP support</span>}
          </div>
        }>
        {servers.length === 0 && (
          <div className="dev-empty">
            <span className="dev-empty-icon"><Server size={24} aria-hidden="true" /></span>
            <p className="dev-empty-lead">No MCP servers connected yet. Connect an MCP server to extend RITOS agents with external tools, resources, and capabilities.</p>
            {mcp && !supported && <p className="dev-note"><CircleDashed size={14} aria-hidden="true" /> {mcp.reason}</p>}
          </div>
        )}
      </Section>

      <Section icon={Bot} title="How MCP will fit into agent orchestration" desc="Planned design. Server management stays here; which agent may use which tool is a separate, explicit grant.">
        <ol className="dev-flow">
          {MCP_FLOW.map(([t, d], i) => <li key={t}><span className="dev-flow-no">{i + 1}</span><div><strong>{t}</strong><p>{d}</p></div></li>)}
        </ol>
        <details className="hub-details">
          <summary>What a connection will include</summary>
          <dl className="dev-events">{MCP_CONFIG.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </details>
      </Section>

      <Section icon={Lock} title="Agent tool access" desc="No agent has external tools today, and none will get a tool it was not explicitly granted.">
        <div className="table-wrap">
          <table className="dev-table">
            <thead><tr><th>Agent</th><th>Works by</th><th>MCP tools</th></tr></thead>
            <tbody>
              {agents.map((a: any) => (
                <tr key={a.id || a.name}><td><strong>{a.name}</strong></td><td>{a.mode}</td><td><Status tone="off">None granted</Status></td></tr>
              ))}
              {!agents.length && <tr><td colSpan={3} className="hub-muted">Agent registry not loaded.</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  )
}

// ---------------------------------------------------------------- Activity & Logs
function ActivityTab({ outbox, events, canManage, working, act }: { outbox: any[] | null; events: InboundEventRow[] | null; canManage: boolean; working: string; act: any }) {
  const [view, setView] = useState<'deliveries' | 'events'>('deliveries')
  const [filter, setFilter] = useState<'ALL' | 'FAILED' | 'PENDING' | 'SENT'>('ALL')
  const rows = (outbox || []).filter(m => filter === 'ALL' || m.status === filter)
  const statusOf = (s: string) => s === 'SENT' ? <Status tone="ok">Delivered</Status> : s === 'FAILED' ? <Status tone="bad">Failed</Status> : <Status tone="warn">Waiting</Status>
  return (
    <section className="panel hub-card">
      <header className="dev-log-head">
        <div className="dev-seg" role="tablist" aria-label="Log">
          <button role="tab" aria-selected={view === 'deliveries'} className={view === 'deliveries' ? 'is-active' : ''} onClick={() => setView('deliveries')}>Deliveries to the store</button>
          <button role="tab" aria-selected={view === 'events'} className={view === 'events' ? 'is-active' : ''} onClick={() => setView('events')}>Events received</button>
        </div>
        {view === 'deliveries' && (
          <div className="dev-filters" role="group" aria-label="Filter deliveries">
            {(['ALL', 'FAILED', 'PENDING', 'SENT'] as const).map(f => (
              <button key={f} className={`mc-filter${filter === f ? ' is-active' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {{ ALL: 'All', FAILED: 'Failed', PENDING: 'Waiting', SENT: 'Delivered' }[f]}
                <span className="mc-filter-count">{(outbox || []).filter(m => f === 'ALL' || m.status === f).length}</span>
              </button>
            ))}
          </div>
        )}
      </header>

      {view === 'deliveries' ? (
        <div className="table-wrap">
          <table className="dev-table">
            <thead><tr><th>Queued</th><th>Message</th><th>Store ticket</th><th>Status</th><th>Attempts</th><th>Last error</th><th /></tr></thead>
            <tbody>
              {rows.map(m => (
                <tr key={m.id}>
                  <td className="dev-nowrap">{when(m.created_at)}</td>
                  <td>{KIND[m.kind] || m.kind}</td>
                  <td><code>{m.payload?.ticket_id || '–'}</code></td>
                  <td>{statusOf(m.status)}</td>
                  <td>{m.attempts}</td>
                  <td className="dev-error" title={m.last_error || ''}>{m.last_error || '–'}</td>
                  <td>{m.status === 'FAILED' && canManage && <button className="secondary compact" disabled={!!working} onClick={() => act(m.id, () => api.retryOutbox(m.id))}>Retry</button>}</td>
                </tr>
              ))}
              {outbox && !rows.length && <tr><td colSpan={7} className="hub-muted">No deliveries {filter === 'ALL' ? 'yet' : 'with this status'}. RITOS queues a message here whenever it updates a store claim.</td></tr>}
              {!outbox && <tr><td colSpan={7} className="hub-muted">Loading…</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="dev-table">
            <thead><tr><th>Received</th><th>Event</th><th>Store ticket</th><th>Result</th><th>Source</th></tr></thead>
            <tbody>
              {(events || []).map(e => (
                <tr key={e.id}>
                  <td className="dev-nowrap">{when(e.received_at)}</td>
                  <td>{eventName(e.event_type)}</td>
                  <td><code>{e.store_ticket || '–'}</code></td>
                  <td>{e.outcome ? <Status tone={/FAIL|ERROR|IGNORED/.test(e.outcome) ? 'warn' : 'ok'}>{e.outcome.replace(/_/g, ' ').toLowerCase()}</Status> : '–'}</td>
                  <td>{e.source}</td>
                </tr>
              ))}
              {events && !events.length && <tr><td colSpan={5} className="hub-muted">No store events received yet. They appear here as soon as a store calls the webhook.</td></tr>}
              {!events && <tr><td colSpan={5} className="hub-muted">Loading…</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
