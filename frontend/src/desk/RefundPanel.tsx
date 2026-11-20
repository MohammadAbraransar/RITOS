// The refund section of the desk's ticket drawer: where the payout stands, and only the actions this person may
// take at this stage (the server enforces the same rules: permissions.py, api.py, finance.py).
import { useState } from 'react'
import { Check, CheckCircle2, Landmark, RefreshCw, Send, X } from 'lucide-react'
import type { Ticket, User } from '../api'
import { dateTime, money } from '../format'
import { roleName } from '../labels'
import { refundStage, type StoreDelivery } from './refundStage'
import '../customer/customer.css'
import './desk.css'

// Who may reject a claim before any payout exists (backend: /cs1/tickets/{id}/manual-decide)
const CLAIM_REJECT_ROLES = ['cs_1', 'support_agent', 'refund_operations', 'administrator', 'supervisor']

type Props = {
  ticket: Ticket
  refunds: any[]
  user: User
  busy: boolean
  canPropose: boolean
  proposeRoles: string[]
  onPropose: () => void
  onRejectClaim: (reason: string) => void
  onApprove: (refund: any) => void
  onRejectPayout: (refund: any, reason: string) => void
  onExecute: (refund: any) => void
  onReconcile: (refund: any) => void
  delivery?: StoreDelivery
  onRetryDelivery?: (messageId: string) => void
}

export function RefundPanel(p: Props) {
  const { ticket: t, user, busy } = p
  const st = refundStage(t, p.refunds, p.delivery)
  const r = st.refund
  const [rejecting, setRejecting] = useState<'claim' | 'payout' | null>(null)
  const [reason, setReason] = useState('')
  const step = r?.next_step
  const others = (roles: string[]) => roles.map(roleName).join(' or ')
  const waiting = step && !step.can_act
    ? `Waiting for ${others(step.roles)}${step.excluded_user_ids.includes(user.id) ? ' (a colleague: you already acted on this refund)' : ''}.`
    : ''

  function confirmReject() {
    if (reason.trim().length < 3) return
    if (rejecting === 'claim') p.onRejectClaim(reason.trim())
    else if (rejecting === 'payout' && r) p.onRejectPayout(r, reason.trim())
    setRejecting(null); setReason('')
  }

  const canStart = st.code === 'NOT_STARTED' || st.code === 'PAYMENT_FAILED'
  return (
    <section className="rp-panel" aria-labelledby="rp-title">
      <div className="rp-head">
        <h4 id="rp-title"><Landmark size={15} aria-hidden="true" /> Refund</h4>
        <span className="rp-amount">{money(r?.amount ?? t.claimed_amount, r?.currency || t.currency)}</span>
      </div>

      {st.code !== 'CLOSED' && (
        <ol className="rp-steps" aria-label="Refund progress">
          {st.steps.map((name, i) => (
            <li key={name} className={i < st.stepsDone ? 'is-done' : i === st.stepsDone ? 'is-current' : ''}>
              <span className="rp-step-dot" aria-hidden="true">{i < st.stepsDone ? <Check size={11} /> : i + 1}</span>
              <span>{name}</span>
            </li>
          ))}
        </ol>
      )}

      <div className={`mc-status tone-${st.tone}`} role="status">
        <span className="mc-status-label"><i aria-hidden="true" />{st.label}</span>
        <p>{st.description}</p>
      </div>

      {r && (
        <dl className="mc-detail-facts rp-facts">
          <div><dt>Payout record</dt><dd className="mc-ref">#{String(r.id).slice(0, 8).toUpperCase()}</dd></div>
          <div><dt>Last update</dt><dd>{dateTime(r.updated_at || r.created_at)}</dd></div>
          {r.provider_reference && <div><dt>Gateway reference</dt><dd className="mc-ref">{r.provider_reference}</dd></div>}
          {r.requested_by_id && <div><dt>Approved claim</dt><dd>{r.requested_by_id === user.id ? 'You' : 'A colleague'}</dd></div>}
          {r.approved_by_id && <div><dt>Second approval</dt><dd>{r.approved_by_id === user.id ? 'You' : 'A colleague'}</dd></div>}
        </dl>
      )}

      <div className="rp-actions">
        {canStart && p.canPropose && (
          <button className="primary" disabled={busy} onClick={p.onPropose}>
            <CheckCircle2 size={15} /> {st.code === 'PAYMENT_FAILED' ? 'Approve again' : 'Approve refund'} ({money(t.claimed_amount, t.currency)})
          </button>
        )}
        {canStart && !p.canPropose && (
          <span className="hint">The claim is approved by {others(p.proposeRoles)}.</span>
        )}
        {st.code === 'NOT_STARTED' && CLAIM_REJECT_ROLES.includes(user.role) && (
          <button className="secondary rp-danger" disabled={busy} onClick={() => setRejecting(rejecting === 'claim' ? null : 'claim')}>
            <X size={15} /> Reject claim
          </button>
        )}

        {st.code === 'AWAITING_SECOND_APPROVAL' && step?.can_act && (
          <>
            <button className="primary" disabled={busy} onClick={() => p.onApprove(r)}>
              <Check size={15} /> Approve payout
            </button>
            <button className="secondary rp-danger" disabled={busy} onClick={() => setRejecting(rejecting === 'payout' ? null : 'payout')}>
              <X size={15} /> Reject payout
            </button>
          </>
        )}
        {st.code === 'READY_TO_PAY' && step?.can_act && (
          <button className="primary" disabled={busy} onClick={() => p.onExecute(r)}>
            <Send size={15} /> Send payment ({money(r.amount, r.currency)})
          </button>
        )}
        {(st.code === 'OUTCOME_UNCLEAR' || st.code === 'PAYING') && step?.can_act && (
          <button className="secondary" disabled={busy} onClick={() => p.onReconcile(r)}>
            <RefreshCw size={15} /> Confirm with provider
          </button>
        )}
        {st.code === 'STORE_DELIVERY_FAILED' && p.delivery && p.onRetryDelivery && ['administrator', 'supervisor'].includes(user.role) && (
          <button className="secondary" disabled={busy} onClick={() => p.onRetryDelivery!(p.delivery!.id)}>
            <RefreshCw size={15} /> Retry delivery to the store
          </button>
        )}
        {st.code === 'STORE_DELIVERY_FAILED' && !['administrator', 'supervisor'].includes(user.role) && (
          <span className="hint">An Administrator or Supervisor can retry the delivery.</span>
        )}
        {waiting && <span className="hint">{waiting}</span>}
      </div>

      {rejecting && (
        <div className="rp-reject">
          <label htmlFor="rp-reason">
            {rejecting === 'claim' ? 'Why is this claim rejected?' : 'Why is this payout rejected?'} The customer sees this reason.
          </label>
          <textarea id="rp-reason" rows={2} value={reason} onChange={e => setReason(e.target.value)}
            placeholder="e.g. Courier tracking shows the parcel was delivered intact" />
          <div className="rp-actions">
            <button className="primary rp-danger-solid" disabled={busy || reason.trim().length < 3} onClick={confirmReject}>
              Confirm rejection
            </button>
            <button className="secondary" onClick={() => { setRejecting(null); setReason('') }}>Keep it open</button>
          </div>
        </div>
      )}
    </section>
  )
}
