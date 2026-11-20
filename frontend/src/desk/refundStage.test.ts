import { describe, expect, it } from 'vitest'
import type { Ticket } from '../api'
import { refundStage } from './refundStage'

const ticket = (over: Partial<Ticket> & Record<string, any> = {}): Ticket =>
  ({ id: 't1', status: 'TRIAGED', refund_status: 'SUCCESSFUL', decision_bucket: 'GENUINE_REFUNDABLE',
     claimed_amount: 1500, currency: 'INR', classification_evidence: {}, ...over }) as any
const refund = (status: string, over: Record<string, any> = {}) => ({ id: 'r1', ticket_id: 't1', status, amount: 1500, ...over })

describe('refundStage', () => {
  it('walks a RITOS payout through approve, second approval and payment', () => {
    expect(refundStage(ticket(), []).code).toBe('NOT_STARTED')
    expect(refundStage(ticket({ refund_status: 'PENDING_APPROVAL' }), [refund('PENDING_APPROVAL')])).toMatchObject({ code: 'AWAITING_SECOND_APPROVAL', stepsDone: 1 })
    expect(refundStage(ticket({ refund_status: 'APPROVED' }), [refund('APPROVED')])).toMatchObject({ code: 'READY_TO_PAY', stepsDone: 2 })
    const paid = refundStage(ticket({ refund_status: 'REFUNDED', status: 'RESOLVED' }), [refund('REFUNDED', { provider_reference: 'SANDBOX-ABC' })])
    expect(paid).toMatchObject({ code: 'PAID', stepsDone: 3 })
    expect(paid.description).toContain('no real money')
    // a refund recorded as paid without any live gateway is never described as a confirmed payment
    const recorded = refundStage(ticket({ refund_status: 'REFUNDED' }), [refund('REFUNDED', { provider_reference: 'MOCK-SETTLE-1', live_payments: false })])
    expect(recorded.description).toContain('no real money')
  })

  it('never shows an approved or rejected payout as paid', () => {
    expect(refundStage(ticket({ refund_status: 'APPROVED' }), [refund('APPROVED')]).code).not.toBe('PAID')
    expect(refundStage(ticket({ refund_status: 'FAILED' }), [refund('FAILED')]).code).toBe('PAYMENT_FAILED')
    expect(refundStage(ticket({ refund_status: 'RECONCILIATION_REQUIRED' }), [refund('RECONCILIATION_REQUIRED')]).code).toBe('OUTCOME_UNCLEAR')
    const closed = refundStage(ticket({ status: 'REJECTED', refund_status: 'REJECTED' }), [refund('REJECTED', { rejection_reason: 'Already replaced' })])
    expect(closed.code).toBe('CLOSED')
    expect(closed.description).toContain('Already replaced')
  })

  it('store orders are paid by the store: approved means sent, not paid', () => {
    const store = { classification_evidence: { source: 'SHOPFLOW', store_linked: true } }
    expect(refundStage(ticket({ ...store, refund_status: 'APPROVED', status: 'IN_REVIEW' }), []).code).toBe('SENT_TO_STORE')
    expect(refundStage(ticket({ ...store, refund_status: 'REFUNDED', status: 'RESOLVED' }), []).code).toBe('PAID')
    expect(refundStage(ticket({ ...store, refund_status: 'RECONCILIATION_REQUIRED' }), []).code).toBe('STORE_PAYMENT_FAILED')
  })
})
