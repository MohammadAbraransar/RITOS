// Where a claim's refund stands, for the desk (pure logic, no React). One answer per ticket, derived from the
// ticket and its latest refund record, so every screen (drawer, queues, register) shows the same stage.
import type { Ticket } from '../api'

export type StageTone = 'green' | 'blue' | 'amber' | 'red' | 'neutral'
export type RefundStageCode =
  | 'NOT_STARTED'              // eligible; nobody has approved the claim yet
  | 'AWAITING_SECOND_APPROVAL' // approved by one person, waiting for an independent approver
  | 'READY_TO_PAY'             // approved twice; a third person sends the payment
  | 'PAYING'                   // sent to the payment gateway
  | 'OUTCOME_UNCLEAR'          // gateway did not answer; confirm with the provider before anything else
  | 'PAYMENT_FAILED'           // gateway declined; nothing was paid
  | 'PAID'                     // the gateway (or the store) confirmed the refund
  | 'SENT_TO_STORE'            // store order: decision sent, the store pays
  | 'STORE_PAYMENT_FAILED'     // store order: the store reported its payment failed
  | 'CLOSED'                   // rejected or cancelled: no refund

export type RefundStage = {
  code: RefundStageCode
  label: string
  tone: StageTone
  description: string
  refund?: any          // the refund record the stage comes from (RITOS ledger claims)
  storeLinked: boolean
  stepsDone: number     // of STEPS (0-3)
  steps: string[]
}

const LEDGER_STEPS = ['Claim approved', 'Second approval', 'Payment sent']
const STORE_STEPS = ['Claim approved', 'Sent to store', 'Store paid customer']

export const isStoreLinked = (t: Ticket) => {
  const ev = (t as any).classification_evidence || {}
  return ev.source === 'SHOPFLOW' && !!ev.store_linked
}

/** Latest refund record for the ticket (the API lists refunds newest first). */
export const latestRefund = (t: Ticket, refunds: any[]) => refunds.find((r: any) => r.ticket_id === t.id)

/** Only the sandbox gateway is implemented: its references start with SANDBOX- and no real money moves. */
export const isSandboxPayment = (r?: any) => !!r?.provider_reference && String(r.provider_reference).startsWith('SANDBOX-')

export function refundStage(t: Ticket, refunds: any[]): RefundStage {
  const store = isStoreLinked(t)
  const r = store ? undefined : latestRefund(t, refunds)
  const steps = store ? STORE_STEPS : LEDGER_STEPS
  const s = (code: RefundStageCode, label: string, tone: StageTone, stepsDone: number, description: string): RefundStage =>
    ({ code, label, tone, stepsDone, description, refund: r, storeLinked: store, steps })

  if (t.refund_status === 'REFUNDED' || r?.status === 'REFUNDED') {
    return s('PAID', 'Refund completed', 'green', 3, store
      ? 'The store reported the refund as paid.'
      : isSandboxPayment(r)
        ? 'Paid through the sandbox gateway. This is a test environment: no real money moved.'
        : r?.live_payments === false
          ? 'Recorded as paid, but no live payment gateway is connected, so no real money moved.'
          : 'The payment gateway confirmed the refund.')
  }
  if (t.status === 'REJECTED' || ['REJECTED', 'CANCELLED'].includes(t.refund_status)) {
    const why = r?.rejection_reason || t.policy_evaluation_reason
    return s('CLOSED', 'Closed, not refunded', 'red', 0, why ? `Reason: ${why}` : 'This claim was not approved.')
  }
  if (t.status === 'RESOLVED') return s('CLOSED', 'Closed', 'neutral', 0, 'This claim is closed without a refund.')

  if (store) {
    if (t.refund_status === 'APPROVED')
      return s('SENT_TO_STORE', 'Approved, sent to the store', 'blue', 2,
        'The decision was sent to ShopFlow, which pays the customer and reports back when it is done.')
    if (t.refund_status === 'RECONCILIATION_REQUIRED')
      return s('STORE_PAYMENT_FAILED', 'Store payment failed', 'amber', 2,
        'ShopFlow reported that its refund payment failed. Check the order in the store before trying again.')
    return s('NOT_STARTED', 'Waiting for approval', 'amber', 0, 'Approving the claim sends the decision to the store, which pays the customer.')
  }

  switch (r?.status) {
    case 'PENDING_APPROVAL':
      return s('AWAITING_SECOND_APPROVAL', 'Waiting for second approval', 'amber', 1,
        'The claim was approved. A different person must approve the payout before any money is sent.')
    case 'APPROVED':
      return s('READY_TO_PAY', 'Approved, ready to pay', 'blue', 2,
        'Approved by two people. A third person sends the payment. No money has moved yet.')
    case 'PROCESSING':
      return s('PAYING', 'Payment in progress', 'blue', 2, 'The payment was sent to the gateway and is waiting for its answer.')
    case 'RECONCILIATION_REQUIRED':
      return s('OUTCOME_UNCLEAR', 'Payment outcome unclear', 'amber', 2,
        'The gateway did not confirm the payment. Confirm the outcome with the provider; do not pay again.')
    case 'FAILED':
      return s('PAYMENT_FAILED', 'Payment failed', 'red', 0,
        'The gateway declined the payment and nothing was paid. Approve the claim again to start a new payout.')
  }
  return s('NOT_STARTED', 'Waiting for approval', 'amber', 0, 'Eligible for a refund. Approving the claim starts the payout.')
}
