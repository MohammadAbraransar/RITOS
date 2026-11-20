// Customer "My Claims": a card per refund request, and a plain-language detail drawer.
// Customers receive a customer-safe view from the API (no desks, risk, agents or internal notes).
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { AlertCircle, ArrowRight, Check, ChevronRight, Loader2, MessageSquare, Plus, RefreshCw, Send, Ticket as TicketIcon, UploadCloud, X } from 'lucide-react'
import { api, type Ticket } from '../api'
import { dateTime, money, shortDate } from '../format'
import { ProductThumb } from './ProductThumb'
import './customer.css'
import { CLAIM_TONE, categoryLabel, claimStatus, claimTimeline, filterClaims, type ClaimFilter } from './claimUi'

const FILTERS: { key: ClaimFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'In progress' },
  { key: 'action', label: 'Needs your action' },
  { key: 'done', label: 'Completed' },
]

type ListProps = {
  claims: Ticket[]
  loaded: boolean
  error: string
  highlightId?: string | null
  onRetry: () => void
  onOpen: (t: Ticket) => void
  onNewClaim: () => void
}

export function MyClaims({ claims, loaded, error, highlightId, onRetry, onOpen, onNewClaim }: ListProps) {
  const [filter, setFilter] = useState<ClaimFilter>('all')
  const shown = filterClaims(claims, filter)

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">REFUNDS</div>
          <h1>My refund requests</h1>
          <p>Follow each request from submission to refund.</p>
        </div>
        <div className="heading-actions">
          <button type="button" className="secondary" onClick={onRetry}><RefreshCw size={15} /> Refresh</button>
          <button type="button" className="primary" onClick={onNewClaim}><Plus size={15} /> Request a refund</button>
        </div>
      </div>

      {loaded && claims.length > 0 && (
        <div className="mc-filters" role="group" aria-label="Filter requests">
          {FILTERS.map(f => {
            const n = filterClaims(claims, f.key).length
            return (
              <button key={f.key} type="button" className={`mc-filter${filter === f.key ? ' is-active' : ''}`}
                aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                {f.label} <span className="mc-filter-count">{n}</span>
              </button>
            )
          })}
        </div>
      )}

      {error && (
        <div className="fc-state is-error mc-block" role="alert">
          <AlertCircle size={20} aria-hidden="true" />
          <div><strong>We couldn't load your requests</strong><p>{error}</p></div>
          <button type="button" className="secondary compact" onClick={onRetry}><RefreshCw size={14} /> Try again</button>
        </div>
      )}

      {!loaded && !error && (
        <div className="mc-grid" aria-busy="true" aria-label="Loading your requests">
          {[0, 1, 2, 3].map(i => <div key={i} className="mc-card mc-skeleton" />)}
        </div>
      )}

      {loaded && !error && claims.length === 0 && (
        <div className="panel mc-empty">
          <span className="mc-empty-icon" aria-hidden="true"><TicketIcon size={26} /></span>
          <h2>No refund requests yet</h2>
          <p>When you request a refund for something you bought, you can follow it here.</p>
          <button type="button" className="primary" onClick={onNewClaim}><Plus size={15} /> Request a refund</button>
        </div>
      )}

      {loaded && claims.length > 0 && shown.length === 0 && (
        <div className="fc-state mc-block"><Check size={18} aria-hidden="true" /><div><strong>Nothing here</strong><p>No requests match this filter.</p></div></div>
      )}

      {shown.length > 0 && (
        <ul className="mc-grid">
          {shown.map(t => {
            const s = claimStatus(t)
            return (
              <li key={t.id} className={`mc-card${t.id === highlightId ? ' is-new' : ''}`} onClick={() => onOpen(t)}>
                <div className="mc-card-top">
                  <ProductThumb category={t.item_category} />
                  <div className="mc-card-title">
                    <h3>{t.item_name || 'Your item'}</h3>
                    <span>{categoryLabel(t.item_category)}</span>
                  </div>
                </div>
                <div className={`mc-status tone-${CLAIM_TONE[s.code]}`}>
                  <span className="mc-status-label"><i aria-hidden="true" />{s.label}</span>
                  <p>{s.description}</p>
                </div>
                <dl className="mc-facts">
                  <div><dt>Refund</dt><dd className="mc-amount">{money(t.claimed_amount, t.currency)}</dd></div>
                  <div><dt>Submitted</dt><dd>{shortDate(t.created_at)}</dd></div>
                  <div><dt>Reference</dt><dd className="mc-ref">{t.ticket_number}</dd></div>
                </dl>
                <button type="button" className="mc-open" onClick={e => { e.stopPropagation(); onOpen(t) }}>
                  View details <ChevronRight size={15} aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

type DrawerProps = {
  claim: Ticket
  refunds: any[]
  userId: string
  onClose: () => void
  onChanged: (t: Ticket) => void
}

/** One claim, for the customer: status, facts, timeline, decision and messages. */
export function CustomerClaimDrawer({ claim, refunds, userId, onClose, onChanged }: DrawerProps) {
  const s = claimStatus(claim)
  const paid = refunds.find(r => r.ticket_id === claim.id && r.status === 'REFUNDED')
  const timeline = claimTimeline(claim, paid?.updated_at || paid?.created_at)
  const messages = (claim.comments || []).filter(c => !c.internal)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [actionDone, setActionDone] = useState('')

  async function refresh() {
    onChanged(await api.ticket(claim.id))
  }

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!message.trim() || sending) return
    setSending(true); setActionError('')
    try {
      await api.comment(claim.id, message.trim(), false)
      setMessage('')
      await refresh()
    } catch (err) {
      setActionError((err as Error).message)
    } finally {
      setSending(false)
    }
  }

  function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    setActionError(''); setActionDone('')
    if (!file) return
    if (!file.type.startsWith('image/')) return setActionError('Please choose an image file (PNG, JPG or WEBP).')
    if (file.size > 5 * 1024 * 1024) return setActionError('That photo is larger than 5 MB. Please choose a smaller one.')
    const reader = new FileReader()
    reader.onload = async ev => {
      setUploading(true)
      try {
        const res = await api.uploadEvidence(claim.id, file.name, file.type, String(ev.target?.result || ''))
        if (res.lifecycle_status === 'REJECTED') {
          setActionError("We couldn't use that photo. Please try a clearer image.")
        } else {
          setActionDone('Thanks, we received your photo.')
          if (res.claim) onChanged(res.claim); else await refresh()
        }
      } catch (err) {
        setActionError((err as Error).message)
      } finally {
        setUploading(false)
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="ticket-drawer mc-drawer" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="mc-drawer-title">
        <div className="drawer-top">
          <div className="mc-drawer-head">
            <ProductThumb category={claim.item_category} size={44} />
            <div>
              <h2 id="mc-drawer-title">{claim.item_name || 'Your item'}</h2>
              <span className="mc-ref">Reference {claim.ticket_number}</span>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="drawer-scroll mc-drawer-body">
          <div className={`mc-status is-large tone-${CLAIM_TONE[s.code]}`}>
            <span className="mc-status-label"><i aria-hidden="true" />{s.label}</span>
            <p>{s.description}</p>
          </div>

          {s.code === 'ACTION_NEEDED' && (
            <div className="mc-action">
              <strong>Send us a photo</strong>
              <p>{claim.proof_required ? `We need: ${claim.proof_required}.` : 'A clear photo of the problem helps us continue.'}</p>
              <label className={`fc-drop${uploading ? ' is-busy' : ''}`}>
                <input type="file" accept="image/*" className="visually-hidden" onChange={upload} disabled={uploading} />
                {uploading ? <Loader2 size={18} className="fc-spin" aria-hidden="true" /> : <UploadCloud size={18} aria-hidden="true" />}
                <span><strong>{uploading ? 'Uploading…' : 'Upload a photo'}</strong> PNG, JPG or WEBP, up to 5 MB</span>
              </label>
            </div>
          )}
          {actionDone && <p className="mc-ok" role="status"><Check size={14} aria-hidden="true" /> {actionDone}</p>}
          {actionError && <div className="error-box" role="alert"><AlertCircle size={15} aria-hidden="true" /> {actionError}</div>}

          <dl className="mc-detail-facts">
            <div><dt>Refund amount</dt><dd className="mc-amount">{money(claim.claimed_amount, claim.currency)}</dd></div>
            <div><dt>Submitted</dt><dd>{dateTime(claim.created_at)}</dd></div>
            <div><dt>Category</dt><dd>{categoryLabel(claim.item_category)}</dd></div>
            {claim.order_id && <div><dt>Order number</dt><dd>{claim.order_id}</dd></div>}
            <div><dt>Reason</dt><dd>{claim.reason_label || 'Described in your words'}</dd></div>
            {claim.purchase_date && <div><dt>Bought</dt><dd>{shortDate(claim.purchase_date)}</dd></div>}
            {paid?.provider_reference && <div><dt>Payment reference</dt><dd className="mc-ref">{paid.provider_reference}</dd></div>}
          </dl>

          {(claim.details || (!claim.reason_label && claim.description)) && (
            <div className="mc-section">
              <h3>Your details</h3>
              <p className="mc-quote">{claim.details || claim.description}</p>
            </div>
          )}

          <div className="mc-section">
            <h3>Progress</h3>
            <ol className="mc-timeline">
              {timeline.map((e, i) => (
                <li key={i}>
                  <span className="mc-dot" aria-hidden="true" />
                  <div><strong>{e.title}</strong><span>{dateTime(e.at)}</span>{e.detail && <p>{e.detail}</p>}</div>
                </li>
              ))}
              {!['REFUNDED', 'NOT_APPROVED', 'CLOSED'].includes(s.code) && (
                <li className="is-next">
                  <span className="mc-dot" aria-hidden="true" />
                  <div><strong>{s.code === 'REFUND_IN_PROGRESS' ? 'Refund payment' : 'Decision'}</strong><span>Next</span></div>
                </li>
              )}
            </ol>
          </div>

          <div className="mc-section">
            <h3><MessageSquare size={15} aria-hidden="true" /> Messages</h3>
            {messages.length === 0 && <p className="mc-muted">No messages yet. We'll post updates about your request here.</p>}
            <ul className="mc-messages">
              {messages.map(c => (
                <li key={c.id} className={c.author_id === userId ? 'is-mine' : ''}>
                  <span className="mc-msg-meta">{c.author_id === userId ? 'You' : 'Support team'} · {dateTime(c.created_at)}</span>
                  <p>{c.body.replace(/^\[[^\]]*\]:\s*/, '')}</p>
                </li>
              ))}
            </ul>
            <form className="mc-reply" onSubmit={send}>
              <label htmlFor="mc-reply" className="visually-hidden">Write a message</label>
              <textarea id="mc-reply" rows={2} maxLength={2000} placeholder="Write a message to our support team"
                value={message} onChange={e => setMessage(e.target.value)} />
              <button type="submit" className="primary compact" disabled={sending || !message.trim()}>
                {sending ? <Loader2 size={14} className="fc-spin" aria-hidden="true" /> : <Send size={14} aria-hidden="true" />} Send
              </button>
            </form>
          </div>

          <button type="button" className="text-btn mc-close-link" onClick={onClose}>
            Back to my requests <ArrowRight size={13} aria-hidden="true" />
          </button>
        </div>
      </aside>
    </div>
  )
}
