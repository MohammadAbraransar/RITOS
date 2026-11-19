// Customer "File New Claim": pick a purchased item, say what went wrong, submit.
// Product, category, order, transaction and refund amount all come from the purchase record (GET /customer/purchases);
// the backend derives and re-checks them again on submit, so nothing here is trusted on its own.
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  AlertCircle, ArrowUpRight, Check, FileSearch, Info, Loader2, Lock, PackageOpen, Receipt, RefreshCw, Scale, Send,
  Trash2, UploadCloud
} from 'lucide-react'
import { api, type ClaimReason, type Purchase, type Ticket } from '../api'
import { money, shortDate } from '../format'
import { ProductThumb } from './ProductThumb'
import './customer.css'
import { ELIGIBILITY_BADGE, categoryLabel, claimProblem, groupPurchases, photoRequired, reasonsFor } from './claimUi'

const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const MAX_DETAILS = 2000

type Props = {
  preselectTransactionId?: string | null
  onSubmitted: (claim: Ticket) => void
  onCancel: () => void
  onOpenClaim: (claimId: string) => void
}

export function FileClaim({ preselectTransactionId, onSubmitted, onCancel, onOpenClaim }: Props) {
  const [purchases, setPurchases] = useState<Purchase[] | null>(null)
  const [reasons, setReasons] = useState<ClaimReason[]>([])
  const [loadError, setLoadError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reasonCode, setReasonCode] = useState<string | null>(null)
  const [details, setDetails] = useState('')
  const [photo, setPhoto] = useState<{ data: string; name: string } | null>(null)
  const [photoError, setPhotoError] = useState('')
  const [showUnavailable, setShowUnavailable] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [triedSubmit, setTriedSubmit] = useState(false)
  const inFlight = useRef(false)  // blocks a second submit before React re-renders the disabled button

  async function loadPurchases() {
    setLoadError('')
    try {
      const res = await api.customerPurchases()
      setPurchases(res.items)
      setReasons(res.reasons)
    } catch (err) {
      setLoadError((err as Error).message)
      setPurchases(prev => prev ?? null)
    }
  }
  useEffect(() => { loadPurchases() }, [])

  const { available, unavailable } = useMemo(() => groupPurchases(purchases || []), [purchases])
  const selected = available.find(p => p.purchase_id === selectedId)
  const allowedReasons = reasonsFor(selected, reasons)
  const reason = allowedReasons.find(r => r.code === reasonCode)
  const problem = claimProblem({ purchase: selected, reason, details, photo: photo?.data || '' })

  // Arriving from "Request Refund" on an order: select its first claimable item, or show why it can't be claimed
  useEffect(() => {
    if (!purchases || !preselectTransactionId) return
    const match = available.find(p => p.transaction_id === preselectTransactionId)
    if (match) setSelectedId(match.purchase_id)
    else if (unavailable.some(p => p.transaction_id === preselectTransactionId)) setShowUnavailable(true)
  }, [purchases, preselectTransactionId])

  // A reason that the newly selected item doesn't allow is cleared rather than silently kept
  useEffect(() => {
    if (reasonCode && !allowedReasons.some(r => r.code === reasonCode)) setReasonCode(null)
  }, [selectedId, reasons])

  function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    setPhotoError('')
    if (!file) return
    if (!file.type.startsWith('image/')) return setPhotoError('Please choose an image file (PNG, JPG or WEBP).')
    if (file.size > MAX_PHOTO_BYTES) return setPhotoError('That photo is larger than 5 MB. Please choose a smaller one.')
    const reader = new FileReader()
    reader.onload = ev => setPhoto({ data: String(ev.target?.result || ''), name: file.name })
    reader.onerror = () => setPhotoError("We couldn't read that file. Please try another photo.")
    reader.readAsDataURL(file)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setTriedSubmit(true)
    if (problem || !selected?.purchase_id || !reason || inFlight.current) return
    inFlight.current = true
    setSubmitting(true)
    setSubmitError('')
    try {
      const claim = await api.submitClaim({
        transaction_id: selected.transaction_id,
        purchase_id: selected.purchase_id,
        reason: reason.code,
        description: details.trim() || undefined,
        evidence_images: photo ? [photo.data] : [],
      })
      onSubmitted(claim)
    } catch (err) {
      setSubmitError((err as Error).message || 'Something went wrong. Please try again.')
      loadPurchases()  // eligibility may have changed (for example, a request already exists)
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  const loading = purchases === null && !loadError

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">REFUNDS</div>
          <h1>Request a refund</h1>
          <p>Choose the item, tell us what went wrong, and we'll take it from there.</p>
        </div>
        <div className="heading-actions">
          <button type="button" className="secondary" onClick={onCancel}>Back to my dashboard</button>
        </div>
      </div>

      <form className="fc-layout" onSubmit={submit} noValidate>
        <div className="fc-main">
          {/* STEP 1: PRODUCT */}
          <section className="panel fc-section" aria-labelledby="fc-step1">
            <header className="fc-section-head">
              <span className="fc-step-no" aria-hidden="true">1</span>
              <div>
                <h2 id="fc-step1">Choose the item</h2>
                <p>Select the product you want a refund for.</p>
              </div>
            </header>

            {loading && (
              <div className="fc-products" aria-busy="true" aria-label="Loading your purchases">
                {[0, 1, 2].map(i => <div key={i} className="fc-product fc-skeleton" />)}
              </div>
            )}

            {loadError && (
              <div className="fc-state is-error" role="alert">
                <AlertCircle size={20} aria-hidden="true" />
                <div>
                  <strong>We couldn't load your purchases</strong>
                  <p>{loadError}</p>
                </div>
                <button type="button" className="secondary compact" onClick={loadPurchases}>
                  <RefreshCw size={14} /> Try again
                </button>
              </div>
            )}

            {purchases && purchases.length === 0 && (
              <div className="fc-state">
                <PackageOpen size={22} aria-hidden="true" />
                <div>
                  <strong>No purchases yet</strong>
                  <p>When you buy something, it will appear here and you can request a refund for it.</p>
                </div>
              </div>
            )}

            {purchases && purchases.length > 0 && available.length === 0 && (
              <div className="fc-state">
                <Info size={20} aria-hidden="true" />
                <div>
                  <strong>None of your purchases can be refunded right now</strong>
                  <p>You can see the reason for each item below.</p>
                </div>
              </div>
            )}

            {available.length > 0 && (
              <div className="fc-products" role="radiogroup" aria-labelledby="fc-step1">
                {available.map(p => (
                  <label key={p.purchase_id} className={`fc-product is-selectable${p.purchase_id === selectedId ? ' is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="purchase"
                      className="visually-hidden"
                      checked={p.purchase_id === selectedId}
                      onChange={() => { setSelectedId(p.purchase_id); setSubmitError('') }}
                    />
                    <PurchaseBody p={p} />
                    <span className="fc-check" aria-hidden="true"><Check size={14} /></span>
                  </label>
                ))}
              </div>
            )}

            {unavailable.length > 0 && (
              <details
                className="fc-unavailable"
                open={showUnavailable || available.length === 0}
                onToggle={e => setShowUnavailable((e.target as HTMLDetailsElement).open)}
              >
                <summary>Not available for a refund ({unavailable.length})</summary>
                <ul className="fc-products">
                  {unavailable.map(p => (
                    <li key={p.purchase_id || p.transaction_id} className="fc-product is-disabled" aria-disabled="true">
                      <PurchaseBody p={p} />
                      {p.eligibility.existing_claim && (
                        <button type="button" className="text-btn fc-view-claim" onClick={() => onOpenClaim(p.eligibility.existing_claim!.id)}>
                          View request <ArrowUpRight size={13} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          {/* STEP 2: WHAT WENT WRONG */}
          <section className={`panel fc-section${selected ? '' : ' is-inactive'}`} aria-labelledby="fc-step2">
            <header className="fc-section-head">
              <span className="fc-step-no" aria-hidden="true">2</span>
              <div>
                <h2 id="fc-step2">What went wrong?</h2>
                <p>{selected ? `Tell us about the ${selected.product?.name}.` : 'Choose an item first.'}</p>
              </div>
            </header>

            {selected?.eligibility.status === 'ITEM_PROBLEM_ONLY' && (
              <p className="fc-note is-amber"><Info size={15} aria-hidden="true" /> {selected.eligibility.message}</p>
            )}
            {selected?.eligibility.status === 'NEEDS_REVIEW' && (
              <p className="fc-note"><Info size={15} aria-hidden="true" /> {selected.eligibility.message}</p>
            )}

            <fieldset className="fc-fieldset" disabled={!selected}>
              <legend className="fc-label">Reason</legend>
              <div className="fc-reasons">
                {allowedReasons.map(r => (
                  <label key={r.code} className={`fc-reason${r.code === reasonCode ? ' is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="reason"
                      className="visually-hidden"
                      checked={r.code === reasonCode}
                      onChange={() => setReasonCode(r.code)}
                    />
                    {r.label}
                  </label>
                ))}
              </div>

              <div className="fc-field">
                <span className="fc-label" id="fc-photo-label">
                  Photo of the problem{' '}
                  {photoRequired(selected)
                    ? <span className="fc-required">required</span>
                    : <span className="fc-optional">optional{reason?.item_problem ? ', but it helps us decide faster' : ''}</span>}
                </span>
                {photo ? (
                  <div className="fc-photo">
                    <img src={photo.data} alt="Your uploaded photo" />
                    <span className="fc-photo-name">{photo.name}</span>
                    <button type="button" className="icon-btn" onClick={() => setPhoto(null)} aria-label="Remove photo">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ) : (
                  <label className="fc-drop">
                    <input type="file" accept="image/*" className="visually-hidden" onChange={onPhoto} aria-labelledby="fc-photo-label" />
                    <UploadCloud size={20} aria-hidden="true" />
                    <span><strong>Add a photo</strong> PNG, JPG or WEBP, up to 5 MB</span>
                  </label>
                )}
                {photoError && <p className="fc-error" role="alert">{photoError}</p>}
              </div>

              <div className="fc-field">
                <label htmlFor="fc-details" className="fc-label">
                  {reason?.details_required ? 'Tell us what happened' : <>Additional details <span className="fc-optional">optional</span></>}
                </label>
                <p className="fc-help" id="fc-details-help">
                  Anything that helps us review your request, for example what you noticed when you opened the package.
                </p>
                <textarea
                  id="fc-details"
                  rows={4}
                  maxLength={MAX_DETAILS}
                  value={details}
                  onChange={e => setDetails(e.target.value)}
                  aria-describedby="fc-details-help"
                />
                <span className="fc-count" aria-hidden="true">{details.length}/{MAX_DETAILS}</span>
              </div>
            </fieldset>
          </section>
        </div>

        <aside className="fc-side">
          {/* SUMMARY + SUBMIT */}
          <section className="panel fc-summary" aria-labelledby="fc-summary-title">
            <h2 id="fc-summary-title">Your request</h2>
            {selected ? (
              <>
                <div className="fc-summary-product">
                  <ProductThumb category={selected.product?.category} imageUrl={selected.product?.image_url} size={44} />
                  <div>
                    <strong>{selected.product?.name}</strong>
                    <span>{categoryLabel(selected.product?.category)}</span>
                  </div>
                </div>
                <dl className="fc-summary-list">
                  <div><dt>Bought</dt><dd>{shortDate(selected.purchased_at)}</dd></div>
                  <div><dt>Reason</dt><dd>{reason?.label || 'Not chosen yet'}</dd></div>
                  {selected.eligibility.window_ends_at && selected.eligibility.status === 'ELIGIBLE' && (
                    <div><dt>Refundable until</dt><dd>{shortDate(selected.eligibility.window_ends_at)}</dd></div>
                  )}
                </dl>
                <div className="fc-amount" aria-live="polite">
                  <span className="fc-amount-label"><Lock size={13} aria-hidden="true" /> Refund amount</span>
                  <strong>{money(selected.eligibility.refundable_amount, selected.currency)}</strong>
                  <p>
                    What you paid for this item
                    {selected.eligibility.refundable_amount < selected.amount ? ', minus what has already been refunded' : ''}.
                    It's set from your order and can't be changed.
                  </p>
                </div>
              </>
            ) : (
              <p className="fc-summary-empty">Choose an item to see your refund amount.</p>
            )}

            {submitError && (
              <div className="error-box" role="alert"><AlertCircle size={15} aria-hidden="true" /> {submitError}</div>
            )}
            {triedSubmit && problem && !submitError && <p className="fc-error" role="alert">{problem}</p>}

            <button type="submit" className="primary fc-submit" disabled={submitting} aria-busy={submitting}>
              {submitting
                ? <><Loader2 size={16} className="fc-spin" aria-hidden="true" /> Submitting…</>
                : <><Send size={15} aria-hidden="true" /> Submit Refund Request</>}
            </button>
          </section>

          <ReviewSteps />
        </aside>
      </form>
    </>
  )
}

function PurchaseBody({ p }: { p: Purchase }) {
  const badge = ELIGIBILITY_BADGE[p.eligibility.status]
  const e = p.eligibility
  const note = e.status === 'ELIGIBLE'
    ? (e.window_ends_at ? `Refundable until ${shortDate(e.window_ends_at)}` : '')
    : e.message
  return (
    <>
      <ProductThumb category={p.product?.category} imageUrl={p.product?.image_url} />
      <span className="fc-product-body">
        <span className="fc-product-name">{p.product?.name || `Order from ${shortDate(p.purchased_at)}`}</span>
        <span className="fc-product-meta">
          {p.product ? `${categoryLabel(p.product.category)} · ` : ''}Bought {shortDate(p.purchased_at)}
          {p.quantity && p.quantity > 1 ? ` · Qty ${p.quantity}` : ''}
        </span>
        <span className="fc-product-foot">
          <strong>{money(p.amount, p.currency)}</strong>
          <span className={`fc-badge tone-${badge.tone}`}>{badge.label}</span>
        </span>
        {note && <span className="fc-product-note">{note}</span>}
      </span>
    </>
  )
}

/** The review process, in the customer's terms: the same three checks and three outcomes the desks use. */
function ReviewSteps() {
  return (
    <section className="panel fc-process" aria-labelledby="fc-process-title">
      <h2 id="fc-process-title">How we review your request</h2>
      <ol className="fc-steps">
        <li>
          <span className="fc-step-icon" aria-hidden="true"><Receipt size={16} /></span>
          <div><strong>We confirm your purchase</strong><p>We match your request to your payment and check how much can be refunded.</p></div>
        </li>
        <li>
          <span className="fc-step-icon" aria-hidden="true"><Scale size={16} /></span>
          <div><strong>We check the return policy</strong><p>We check your item's category and how long ago you bought it.</p></div>
        </li>
        <li>
          <span className="fc-step-icon" aria-hidden="true"><FileSearch size={16} /></span>
          <div><strong>We review the details</strong><p>We look at your photos and request. A member of our team steps in when needed.</p></div>
        </li>
      </ol>
      <div className="fc-outcomes">
        <p className="fc-outcomes-title">Possible outcomes</p>
        <ul>
          <li><i className="tone-green" aria-hidden="true" /><span><strong>Approved:</strong> the refund goes back to your original payment method.</span></li>
          <li><i className="tone-amber" aria-hidden="true" /><span><strong>More information needed:</strong> we'll ask you for a photo or details.</span></li>
          <li><i className="tone-red" aria-hidden="true" /><span><strong>Not eligible:</strong> we'll explain why.</span></li>
        </ul>
      </div>
    </section>
  )
}
