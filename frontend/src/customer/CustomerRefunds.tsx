// Customer "Refunds": every request that has reached the refund stage, in the same card design as My Claims.
// Built from the claims (store orders are refunded by the store, so they have no RITOS payout record) and
// enriched with the payout record when there is one. Wording comes from the API's customer_status.
import { ChevronRight, CircleDollarSign, RefreshCw } from 'lucide-react'
import type { Ticket } from '../api'
import { dateTime, money } from '../format'
import { ProductThumb } from './ProductThumb'
import './customer.css'
import { CLAIM_TONE, categoryLabel, claimStatus } from './claimUi'

const REFUND_STAGE = new Set(['PENDING_APPROVAL', 'APPROVED', 'PROCESSING', 'RECONCILIATION_REQUIRED', 'FAILED', 'REFUNDED'])

type Props = { refunds: any[]; claims: Ticket[]; loaded: boolean; onOpen: (t: Ticket) => void; onRetry: () => void }

export function CustomerRefunds({ refunds, claims, loaded, onOpen, onRetry }: Props) {
  const rows = claims
    .filter(t => REFUND_STAGE.has(t.refund_status) || refunds.some(r => r.ticket_id === t.id && r.status !== 'REJECTED'))
    .map(t => ({ claim: t, payout: refunds.find(r => r.ticket_id === t.id) }))
  const paid = rows.filter(x => claimStatus(x.claim).code === 'REFUNDED')
  const paidTotal = paid.reduce((sum, x) => sum + Number(x.payout?.amount ?? x.claim.claimed_amount), 0)

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">REFUNDS</div>
          <h1>My refunds</h1>
          <p>Approved requests and where each payment stands.</p>
        </div>
        <div className="heading-actions">
          <button type="button" className="secondary" onClick={onRetry}><RefreshCw size={15} /> Refresh</button>
        </div>
      </div>

      {loaded && rows.length > 0 && (
        <dl className="mc-detail-facts panel" style={{ padding: '14px 16px', marginBottom: '16px' }}>
          <div><dt>Refunded</dt><dd className="mc-amount">{money(paidTotal, rows[0].claim.currency)}</dd></div>
          <div><dt>In progress</dt><dd>{rows.length - paid.length}</dd></div>
        </dl>
      )}

      {!loaded && (
        <div className="mc-grid" aria-busy="true" aria-label="Loading your refunds">
          {[0, 1].map(i => <div key={i} className="mc-card mc-skeleton" />)}
        </div>
      )}

      {loaded && rows.length === 0 && (
        <div className="panel mc-empty">
          <span className="mc-empty-icon" aria-hidden="true"><CircleDollarSign size={26} /></span>
          <h2>No refunds yet</h2>
          <p>When one of your requests is approved, its refund and payment status appear here.</p>
        </div>
      )}

      {rows.length > 0 && (
        <ul className="mc-grid">
          {rows.map(({ claim: t, payout }) => {
            const s = claimStatus(t)
            return (
              <li key={t.id} className="mc-card" onClick={() => onOpen(t)}>
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
                  <div><dt>Amount</dt><dd className="mc-amount">{money(payout?.amount ?? t.claimed_amount, payout?.currency || t.currency)}</dd></div>
                  <div><dt>Updated</dt><dd>{dateTime(payout?.updated_at || t.updated_at)}</dd></div>
                  <div><dt>{payout?.provider_reference ? 'Payment ref.' : 'Request'}</dt>
                    <dd className="mc-ref">{payout?.provider_reference || t.ticket_number}</dd></div>
                </dl>
                <button type="button" className="mc-open" onClick={e => { e.stopPropagation(); onOpen(t) }}>
                  View request <ChevronRight size={15} aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
