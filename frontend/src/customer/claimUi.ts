// Pure UI logic for the customer refund screens (no React): labels, grouping, validation and timelines.
import type { ClaimReason, CustomerClaimStatus, EligibilityStatus, Purchase, Ticket } from '../api'

export type Tone = 'green' | 'blue' | 'amber' | 'red' | 'neutral'

export const ELIGIBILITY_BADGE: Record<EligibilityStatus, { label: string; tone: Tone }> = {
  ELIGIBLE: { label: 'Eligible', tone: 'green' },
  NEEDS_REVIEW: { label: 'Eligible · reviewed by our team', tone: 'blue' },
  ITEM_PROBLEM_ONLY: { label: 'Damaged or faulty items only', tone: 'amber' },
  NOT_REFUNDABLE: { label: 'Not refundable', tone: 'neutral' },
  EXPIRED: { label: 'Refund period ended', tone: 'neutral' },
  REFUNDED: { label: 'Refunded', tone: 'neutral' },
  ALREADY_CLAIMED: { label: 'Request already made', tone: 'neutral' },
  UNAVAILABLE: { label: 'Details unavailable', tone: 'neutral' },
}

export const CLAIM_TONE: Record<CustomerClaimStatus['code'], Tone> = {
  UNDER_REVIEW: 'blue',
  ACTION_NEEDED: 'amber',
  REFUND_IN_PROGRESS: 'blue',
  REFUNDED: 'green',
  NOT_APPROVED: 'red',
  CLOSED: 'neutral',
}

const FALLBACK_STATUS: CustomerClaimStatus = { code: 'UNDER_REVIEW', label: 'Under review', description: "We're checking your request." }
export const claimStatus = (t: Ticket): CustomerClaimStatus => t.customer_status || FALLBACK_STATUS

export const categoryLabel = (c?: string | null) =>
  (c || 'General').toLowerCase().replace(/_/g, ' ').replace(/^\w/, s => s.toUpperCase())

/** Purchases the customer can claim, and the rest with the reason they can't (never hidden silently). */
export function groupPurchases(purchases: Purchase[]) {
  return {
    available: purchases.filter(p => p.eligibility.claimable && p.purchase_id),
    unavailable: purchases.filter(p => !(p.eligibility.claimable && p.purchase_id)),
  }
}

/** Reasons the customer may pick for this purchase: final-sale or late purchases allow only item problems. */
export function reasonsFor(purchase: Purchase | undefined, reasons: ClaimReason[]): ClaimReason[] {
  if (!purchase) return reasons
  return purchase.eligibility.status === 'ITEM_PROBLEM_ONLY' ? reasons.filter(r => r.item_problem) : reasons
}

export const photoRequired = (purchase: Purchase | undefined) => purchase?.eligibility.status === 'ITEM_PROBLEM_ONLY'

export type ClaimDraft = { purchase?: Purchase; reason?: ClaimReason; details: string; photo: string }

/** What still blocks submission, in the customer's words (null when the request can be sent). */
export function claimProblem(d: ClaimDraft): string | null {
  if (!d.purchase) return 'Choose the product you want a refund for.'
  if (!d.reason) return 'Tell us what went wrong.'
  if (d.reason.details_required && d.details.trim().length < 8) return 'Add a few words about what went wrong (at least 8 characters).'
  if (photoRequired(d.purchase) && !d.photo) return 'Add a photo of the problem.'
  return null
}

export type ClaimFilter = 'all' | 'active' | 'action' | 'done'
const ACTIVE = new Set(['UNDER_REVIEW', 'ACTION_NEEDED', 'REFUND_IN_PROGRESS'])
const DONE = new Set(['REFUNDED', 'NOT_APPROVED', 'CLOSED'])
export function filterClaims(claims: Ticket[], f: ClaimFilter): Ticket[] {
  if (f === 'all') return claims
  return claims.filter(t => {
    const c = claimStatus(t).code
    return f === 'active' ? ACTIVE.has(c) : f === 'action' ? c === 'ACTION_NEEDED' : DONE.has(c)
  })
}

export type TimelineEntry = { at: string; title: string; detail?: string }
/** Key moments of a claim, oldest first. `refundPaidAt` comes from the customer's refund record. */
export function claimTimeline(t: Ticket, refundPaidAt?: string | null): TimelineEntry[] {
  const entries: (TimelineEntry | null)[] = [
    { at: t.created_at, title: 'Request submitted' },
    t.proof_request_sent_at ? { at: t.proof_request_sent_at, title: 'More information requested', detail: t.proof_required || undefined } : null,
    t.refund_decided_at ? { at: t.refund_decided_at, title: 'Decision made' } : null,
    t.rejection_notice_sent_at ? { at: t.rejection_notice_sent_at, title: 'Decision sent to you' } : null,
    refundPaidAt ? { at: refundPaidAt, title: 'Refund paid' } : null,
  ]
  return (entries.filter(Boolean) as TimelineEntry[]).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
}
