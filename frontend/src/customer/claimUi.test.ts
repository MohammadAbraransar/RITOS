import { describe, expect, it } from 'vitest'
import type { ClaimReason, Purchase, Ticket } from '../api'
import { claimProblem, claimTimeline, filterClaims, groupPurchases, photoRequired, reasonsFor } from './claimUi'

const purchase = (status: Purchase['eligibility']['status'], extra: Partial<Purchase> = {}): Purchase => ({
  purchase_id: `p-${status}`, transaction_id: `t-${status}`, order_id: 'o', currency: 'INR', purchased_at: '2026-11-01T00:00:00Z',
  quantity: 1, amount: 100, product: { sku: 's', name: 'Item', category: 'GENERAL', brand: null, image_url: null },
  eligibility: { status, claimable: ['ELIGIBLE', 'ITEM_PROBLEM_ONLY', 'NEEDS_REVIEW'].includes(status), message: '',
                 refundable_amount: 100, return_window_days: 14, days_elapsed: 1, window_ends_at: null, existing_claim: null, reason_code: null },
  ...extra,
})
const REASONS: ClaimReason[] = [
  { code: 'PRODUCT_DAMAGED', label: 'Damaged', item_problem: true, details_required: false },
  { code: 'CHANGED_MIND', label: 'Changed mind', item_problem: false, details_required: false },
  { code: 'OTHER', label: 'Something else', item_problem: false, details_required: true },
]
const ticket = (code: string, extra: Partial<Ticket> = {}) =>
  ({ id: code, created_at: '2026-11-01T10:00:00Z', customer_status: { code, label: code, description: '' }, ...extra }) as unknown as Ticket

describe('purchase selection', () => {
  it('separates claimable purchases from the rest, never dropping any', () => {
    const all = [purchase('ELIGIBLE'), purchase('EXPIRED'), purchase('ITEM_PROBLEM_ONLY'), purchase('UNAVAILABLE', { purchase_id: null })]
    const { available, unavailable } = groupPurchases(all)
    expect(available.map(p => p.eligibility.status)).toEqual(['ELIGIBLE', 'ITEM_PROBLEM_ONLY'])
    expect(unavailable.map(p => p.eligibility.status)).toEqual(['EXPIRED', 'UNAVAILABLE'])
  })
  it('offers only item-problem reasons, and requires a photo, for late or final-sale items', () => {
    expect(reasonsFor(purchase('ITEM_PROBLEM_ONLY'), REASONS).map(r => r.code)).toEqual(['PRODUCT_DAMAGED'])
    expect(reasonsFor(purchase('ELIGIBLE'), REASONS)).toHaveLength(3)
    expect(photoRequired(purchase('ITEM_PROBLEM_ONLY'))).toBe(true)
    expect(photoRequired(purchase('ELIGIBLE'))).toBe(false)
  })
})

describe('claim validation', () => {
  const [damaged, , other] = REASONS
  it('asks for the product, then the reason', () => {
    expect(claimProblem({ details: '', photo: '' })).toMatch(/Choose the product/)
    expect(claimProblem({ purchase: purchase('ELIGIBLE'), details: '', photo: '' })).toMatch(/what went wrong/)
  })
  it('needs words for "something else" and a photo when the policy requires one', () => {
    expect(claimProblem({ purchase: purchase('ELIGIBLE'), reason: other, details: 'short', photo: '' })).toMatch(/at least 8/)
    expect(claimProblem({ purchase: purchase('ELIGIBLE'), reason: other, details: 'It arrived open', photo: '' })).toBeNull()
    expect(claimProblem({ purchase: purchase('ITEM_PROBLEM_ONLY'), reason: damaged, details: '', photo: '' })).toMatch(/photo/)
    expect(claimProblem({ purchase: purchase('ITEM_PROBLEM_ONLY'), reason: damaged, details: '', photo: 'data:x' })).toBeNull()
  })
})

describe('my claims', () => {
  const claims = [ticket('UNDER_REVIEW'), ticket('ACTION_NEEDED'), ticket('REFUND_IN_PROGRESS'), ticket('REFUNDED'), ticket('NOT_APPROVED')]
  it('filters by what the customer cares about', () => {
    expect(filterClaims(claims, 'all')).toHaveLength(5)
    expect(filterClaims(claims, 'active').map(t => t.id)).toEqual(['UNDER_REVIEW', 'ACTION_NEEDED', 'REFUND_IN_PROGRESS'])
    expect(filterClaims(claims, 'action').map(t => t.id)).toEqual(['ACTION_NEEDED'])
    expect(filterClaims(claims, 'done').map(t => t.id)).toEqual(['REFUNDED', 'NOT_APPROVED'])
  })
  it('builds a dated timeline, oldest first, including the payout', () => {
    const t = ticket('REFUNDED', { proof_request_sent_at: '2026-11-02T10:00:00Z', proof_required: 'A photo', refund_decided_at: '2026-11-03T10:00:00Z' })
    expect(claimTimeline(t, '2026-11-04T10:00:00Z').map(e => e.title))
      .toEqual(['Request submitted', 'More information requested', 'Decision made', 'Refund paid'])
  })
})
