// "Request refund" from the dashboard: everything is taken from the order (product, order number, purchase date,
// amount paid, refund amount, the customer's details); the customer only answers what the order can't tell us:
// why they are returning it, plus a photo when the item's policy requires one. The server derives and re-checks
// every value again on submit (POST /tickets), exactly as for File New Claim.
import { useRef, useState, type ChangeEvent } from 'react'
import { AlertCircle, ArrowRight, Check, Info, Loader2, Lock, Send, Trash2, UploadCloud, X } from 'lucide-react'
import { api, type ClaimReason, type Purchase, type Ticket, type User } from '../api'
import { money, shortDate } from '../format'
import { ProductThumb } from './ProductThumb'
import './customer.css'
import { CLAIM_TONE, categoryLabel, claimProblem, claimStatus, photoRequired, reasonsFor } from './claimUi'

const MAX_PHOTO_BYTES = 5 * 1024 * 1024

type Props = {
  purchase: Purchase
  reasons: ClaimReason[]
  user: User
  onClose: () => void
  onSubmitted: (claim: Ticket) => void
  onOpenClaim: (claim: Ticket) => void
}

export function QuickRefund({ purchase: p, reasons, user, onClose, onSubmitted, onOpenClaim }: Props) {
  const allowed = reasonsFor(p, reasons)
  const [reasonCode, setReasonCode] = useState<string | null>(allowed.length === 1 ? allowed[0].code : null)
  const [details, setDetails] = useState('')
  const [showNote, setShowNote] = useState(false)
  const [photo, setPhoto] = useState<{ data: string; name: string } | null>(null)
  const [photoError, setPhotoError] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [claim, setClaim] = useState<Ticket | null>(null)
  const inFlight = useRef(false)

  const reason = allowed.find(r => r.code === reasonCode)
  const needPhoto = photoRequired(p)
  const askPhoto = needPhoto || !!reason?.item_problem      // offered for item problems, required only by policy
  const askDetails = !!reason?.details_required || showNote
  const problem = claimProblem({ purchase: p, reason, details, photo: photo?.data || '' })
  const e = p.eligibility

  function onPhoto(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    setPhotoError('')
    if (!file) return
    if (!file.type.startsWith('image/')) return setPhotoError('Please choose an image file (PNG, JPG or WEBP).')
    if (file.size > MAX_PHOTO_BYTES) return setPhotoError('That photo is larger than 5 MB. Please choose a smaller one.')
    const reader = new FileReader()
    reader.onload = r => setPhoto({ data: String(r.target?.result || ''), name: file.name })
    reader.onerror = () => setPhotoError("We couldn't read that file. Please try another photo.")
    reader.readAsDataURL(file)
  }

  async function submit() {
    if (problem || !reason || !p.purchase_id || inFlight.current) return
    inFlight.current = true
    setSubmitting(true); setError('')
    try {
      const created = await api.submitClaim({
        transaction_id: p.transaction_id, purchase_id: p.purchase_id, reason: reason.code,
        description: details.trim() || undefined, evidence_images: photo ? [photo.data] : [],
      })
      setClaim(created)
      onSubmitted(created)
    } catch (err) {
      setError((err as Error).message || 'Something went wrong. Please try again.')
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="ticket-drawer mc-drawer" onClick={ev => ev.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="qr-title">
        <div className="drawer-top">
          <div className="mc-drawer-head">
            <ProductThumb category={p.product?.category} imageUrl={p.product?.image_url} size={44} />
            <div>
              <h2 id="qr-title">{claim ? 'Refund requested' : 'Request a refund'}</h2>
              <span className="mc-ref">{p.product?.name} · Order {p.order_id}</span>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="drawer-scroll mc-drawer-body">
          {claim ? (
            <>
              <div className={`mc-status is-large tone-${CLAIM_TONE[claimStatus(claim).code]}`} role="status">
                <span className="mc-status-label"><i aria-hidden="true" />{claimStatus(claim).label}</span>
                <p>{claimStatus(claim).description}</p>
              </div>
              <dl className="mc-detail-facts">
                <div><dt>Reference</dt><dd className="mc-ref">{claim.ticket_number}</dd></div>
                <div><dt>Refund amount</dt><dd className="mc-amount">{money(claim.claimed_amount, claim.currency)}</dd></div>
              </dl>
              <p className="mc-muted">We'll post every update on this request, and you can follow it under My Claims.</p>
              <div className="qr-actions">
                <button type="button" className="primary" onClick={() => onOpenClaim(claim)}>View request <ArrowRight size={15} /></button>
                <button type="button" className="secondary" onClick={onClose}>Done</button>
              </div>
            </>
          ) : (
            <>
              {/* Taken from the order: nothing to type */}
              <section className="mc-section" aria-labelledby="qr-order">
                <h3 id="qr-order"><Check size={15} aria-hidden="true" /> From your order</h3>
                <dl className="mc-detail-facts">
                  <div><dt>Product</dt><dd>{p.product?.name}</dd></div>
                  <div><dt>Category</dt><dd>{categoryLabel(p.product?.category)}</dd></div>
                  <div><dt>Order number</dt><dd className="mc-ref">{p.order_id}</dd></div>
                  <div><dt>Bought</dt><dd>{shortDate(p.purchased_at)}</dd></div>
                  <div><dt>Amount paid</dt><dd>{money(p.amount, p.currency)}{p.quantity && p.quantity > 1 ? ` · Qty ${p.quantity}` : ''}</dd></div>
                  {e.window_ends_at && e.status === 'ELIGIBLE' && <div><dt>Refundable until</dt><dd>{shortDate(e.window_ends_at)}</dd></div>}
                  <div><dt>Refund to</dt><dd>Original payment method</dd></div>
                  <div><dt>Requested by</dt><dd>{user.full_name}<br /><span className="mc-ref">{user.email}</span></dd></div>
                </dl>
                <div className="fc-amount qr-amount">
                  <span className="fc-amount-label"><Lock size={13} aria-hidden="true" /> Refund amount</span>
                  <strong>{money(e.refundable_amount, p.currency)}</strong>
                  <p>Set from your order{e.refundable_amount < p.amount ? ', minus what has already been refunded' : ''}; it can't be changed.</p>
                </div>
              </section>

              {e.status !== 'ELIGIBLE' && e.message && (
                <p className={`fc-note${e.status === 'ITEM_PROBLEM_ONLY' ? ' is-amber' : ''}`}><Info size={15} aria-hidden="true" /> {e.message}</p>
              )}

              {/* The one thing the order can't tell us */}
              <section className="mc-section" aria-labelledby="qr-reason">
                <h3 id="qr-reason">Why are you returning it?</h3>
                <div className="fc-reasons" role="radiogroup" aria-labelledby="qr-reason">
                  {allowed.map(r => (
                    <label key={r.code} className={`fc-reason${r.code === reasonCode ? ' is-selected' : ''}`}>
                      <input type="radio" name="qr-reason" className="visually-hidden" checked={r.code === reasonCode}
                        onChange={() => { setReasonCode(r.code); setError('') }} />
                      {r.label}
                    </label>
                  ))}
                </div>
              </section>

              {askPhoto && (
                <section className="mc-section" aria-labelledby="qr-photo">
                  <h3 id="qr-photo">Photo of the problem {needPhoto
                    ? <span className="fc-required">required by this item's refund policy</span>
                    : <span className="fc-optional">optional, but it helps us decide faster</span>}</h3>
                  {photo ? (
                    <div className="fc-photo">
                      <img src={photo.data} alt="Your uploaded photo" />
                      <span className="fc-photo-name">{photo.name}</span>
                      <button type="button" className="icon-btn" onClick={() => setPhoto(null)} aria-label="Remove photo"><Trash2 size={16} /></button>
                    </div>
                  ) : (
                    <label className="fc-drop">
                      <input type="file" accept="image/*" className="visually-hidden" onChange={onPhoto} aria-labelledby="qr-photo" />
                      <UploadCloud size={20} aria-hidden="true" />
                      <span><strong>Add a photo</strong> PNG, JPG or WEBP, up to 5 MB</span>
                    </label>
                  )}
                  {photoError && <p className="fc-error" role="alert">{photoError}</p>}
                </section>
              )}

              {askDetails ? (
                <section className="mc-section">
                  <label htmlFor="qr-details" className="fc-label">
                    {reason?.details_required ? 'Tell us what happened' : <>Note for our team <span className="fc-optional">optional</span></>}
                  </label>
                  <textarea id="qr-details" className="qr-textarea" rows={3} maxLength={2000} value={details}
                    onChange={ev => setDetails(ev.target.value)} />
                </section>
              ) : reason && (
                <button type="button" className="text-btn qr-add-note" onClick={() => setShowNote(true)}>+ Add a note (optional)</button>
              )}

              {error && <div className="error-box" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</div>}

              <div className="qr-actions">
                <button type="button" className="primary fc-submit" onClick={submit} disabled={submitting || !!problem} aria-busy={submitting}>
                  {submitting
                    ? <><Loader2 size={16} className="fc-spin" aria-hidden="true" /> Submitting…</>
                    : <><Send size={15} aria-hidden="true" /> Submit refund request</>}
                </button>
                {problem && reason && <p className="fc-help" role="status">{problem}</p>}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
