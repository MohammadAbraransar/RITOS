// Plain-language wording for everything the desk shows. Raw database values (statuses, codes, roles) never reach
// the screen: they are looked up here, and anything unknown falls back to readable title case.
// To change wording, edit this file only.

type Tone = 'green' | 'amber' | 'red' | 'blue' | 'grey'
export type Label = { text: string; tone: Tone }

export const humanize = (v: string) =>
  v.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

const L = (text: string, tone: Tone = 'blue'): Label => ({ text, tone })

// Which desk the claim is on
export const DESK: Record<string, Label> = {
  CS_1: L('CS-1 · Fast-track', 'green'),
  CS_2: L('CS-2 · Review', 'amber'),
  CS_3: L('CS-3 · Not eligible', 'red'),
}

// RITOS's verdict on the claim
export const BUCKET: Record<string, Label> = {
  GENUINE_REFUNDABLE: L('Eligible for refund', 'green'),
  EXCEPTIONAL_PROOF_NEEDED: L('Needs review', 'amber'),
  NON_REFUNDABLE: L('Not eligible', 'red'),
}

// What the claim is waiting for (the orchestrator's next action)
export const NEXT_ACTION: Record<string, Label> = {
  AUTO_APPROVE: L('Approved automatically', 'green'),
  AWAIT_APPROVAL: L('Waiting for payout approval', 'amber'),
  AWAIT_PROOF: L('Waiting for customer evidence', 'amber'),
  MANUAL_REVIEW: L('With a reviewer', 'amber'),
  AUTO_REJECT: L('Rejected by policy', 'red'),
}

// Ticket lifecycle
export const TICKET_STATUS: Record<string, Label> = {
  NEW: L('New', 'blue'),
  TRIAGED: L('Received', 'blue'),
  IN_REVIEW: L('In review', 'amber'),
  AWAITING_INFORMATION: L('Waiting for customer', 'amber'),
  ESCALATED: L('Escalated', 'red'),
  RESOLVED: L('Resolved', 'green'),
  REJECTED: L('Rejected', 'red'),
  REOPENED: L('Reopened', 'amber'),
}

// Refund (payout) lifecycle
export const REFUND_STATUS: Record<string, Label> = {
  DRAFT: L('Draft', 'grey'),
  PENDING_APPROVAL: L('Waiting for a second approver', 'amber'),
  APPROVED: L('Approved, ready to pay', 'blue'),
  PROCESSING: L('Paying…', 'blue'),
  REFUNDED: L('Refunded', 'green'),
  REJECTED: L('Payout rejected', 'red'),
  FAILED: L('Payment failed', 'red'),
  RECONCILIATION_REQUIRED: L('Payment outcome unclear', 'amber'),
}

// The customer's original payment, and the store's refund state, as recorded on the ticket
export const PAYMENT_STATUS: Record<string, Label> = {
  SUCCESSFUL: L('Paid by customer', 'green'),
  PENDING: L('Payment pending', 'amber'),
  UNKNOWN: L('Payment unknown', 'grey'),
  APPROVED: L('Refund approved', 'green'),
  REJECTED: L('Refund rejected', 'red'),
  REFUNDED: L('Refunded', 'green'),
  PENDING_APPROVAL: L('Waiting for approval', 'amber'),
}

// Agent 1's ledger check
export const LEDGER_STATUS: Record<string, Label> = {
  VERIFIED: L('Payment verified', 'green'),
  PENDING_VERIFICATION: L('Being checked', 'blue'),
  TRANSACTION_NOT_FOUND: L('Payment not found', 'red'),
  CUSTOMER_MISMATCH: L('Payment belongs to another customer', 'red'),
  CURRENCY_MISMATCH: L('Currency does not match the payment', 'amber'),
  AMOUNT_MISMATCH: L('Amount exceeds what was paid', 'amber'),
  INSUFFICIENT_REFUNDABLE_BALANCE: L('Not enough refundable balance left', 'amber'),
  PAYMENT_PENDING: L('Payment not yet captured', 'amber'),
  MANUAL_VERIFICATION_REQUIRED: L('Payment needs manual check', 'amber'),
  ALREADY_REFUNDED: L('Already refunded', 'red'),
}

export const PROOF_STATUS: Record<string, Label> = {
  NOT_REQUIRED: L('Not needed', 'grey'),
  NOT_REQUESTED: L('Not requested', 'grey'),
  PROOF_REQUESTED: L('Requested from customer', 'amber'),
  REQUESTED: L('Requested from customer', 'amber'),
  UNDER_REVIEW: L('Under review', 'amber'),
  PROOF_VERIFIED: L('Verified', 'green'),
}

export const ROLE: Record<string, string> = {
  customer: 'Customer',
  cs_1: 'CS-1 agent',
  cs_2: 'CS-2 agent',
  cs_3: 'CS-3 agent',
  support_agent: 'Support agent',
  supervisor: 'Supervisor',
  finance_approver: 'Finance',
  refund_operations: 'Refund operations',
  risk_analyst: 'Risk analyst',
  administrator: 'Administrator',
  auditor: 'Auditor',
}

// Why the claim was routed the way it was (decision reason codes)
export const REASON: Record<string, string> = {
  LEDGER_VERIFIED: 'Payment verified in the ledger',
  LEDGER_DUPLICATE_CLAIM: 'Duplicate of an earlier claim for the same item',
  LEDGER_ALREADY_REFUNDED: 'This payment was already refunded',
  LEDGER_TRANSACTION_NOT_FOUND: 'Payment could not be found',
  LEDGER_CUSTOMER_MISMATCH: 'Payment belongs to a different customer',
  LEDGER_CURRENCY_MISMATCH: 'Claim currency differs from the payment',
  LEDGER_AMOUNT_MISMATCH: 'Claimed more than was paid',
  LEDGER_INSUFFICIENT_REFUNDABLE_BALANCE: 'Not enough refundable balance left on this payment',
  LEDGER_PAYMENT_PENDING: 'The payment has not been captured yet',
  LEDGER_MANUAL_VERIFICATION_REQUIRED: 'The payment needs a manual check',
  LEDGER_UNKNOWN_STATUS: 'Unrecognised payment state',
  PAYMENT_ISSUE_RECONCILIATION: 'Payment dispute: check with the payment provider',
  POLICY_WITHIN_WINDOW: 'Within the return window',
  POLICY_WINDOW_EXPIRED: 'Return window has expired',
  POLICY_FINAL_SALE: 'Final-sale item',
  POLICY_DEFECT_EXCEPTION: 'Outside the window, but a verified defect is accepted',
  POLICY_DEFECT_UNVERIFIED: 'Defect must be verified before the exception applies',
  POLICY_MISSING: 'No return policy configured for this category',
  POLICY_DATE_UNKNOWN: 'No trusted purchase or delivery date',
  CLAIM_CONTRADICTION: 'Claim conflicts with delivery or order records',
  LOGISTICS_UNVERIFIED: 'Non-delivery not yet confirmed by the carrier',
  EVIDENCE_MISSING: 'Photos are required for this claim',
  EVIDENCE_IDENTITY_MISMATCH: 'Photo may show a different product',
  EVIDENCE_DEFECT_NOT_VISIBLE: 'The claimed defect is not visible',
  EVIDENCE_NEAR_DUPLICATE: 'Photo closely matches another claim',
  EVIDENCE_VERIFIED: 'Photos verified',
  EVIDENCE_IDENTITY_INCONCLUSIVE: 'Photo does not clearly show the product',
  EVIDENCE_IDENTITY_NOT_ASSESSABLE: 'Photo too unclear to identify the product',
  EVIDENCE_IDENTITY_PROCESSING_FAILED: 'Photo could not be processed',
  EVIDENCE_DEFECT_INCONCLUSIVE: 'Photo does not clearly show the defect',
  EVIDENCE_DEFECT_NOT_ASSESSABLE: 'Photo too unclear to judge the defect',
  EVIDENCE_DEFECT_PROCESSING_FAILED: 'Photo could not be checked for the defect',
  RISK_SUPERVISORY_REVIEW: 'Risk signals need a supervisor',
  AMOUNT_ABOVE_AUTO_LIMIT: 'Amount above the automatic approval limit',
  AUTOMATION_STEP_FAILED: 'An automated check failed; a person must review',
}

// Payout steps (the four-eyes rule)
export const PAYOUT_ACTION: Record<string, string> = {
  propose: 'authorize the payout',
  propose_supervised: 'approve the payout',
  approve: 'approve the payout (second person)',
  execute: 'send the money',
  reconcile: 'confirm the payment outcome with the provider',
}

// What started each automation run (ticket history)
export const RUN_TRIGGER: Record<string, string> = {
  INTAKE: 'checked the new claim',
  MANUAL: 'checked the claim',
  STORE_RESEND: 're-checked after an update from the store',
  EVIDENCE_UPLOADED: 're-checked after the customer added evidence',
  MANUAL_RERUN: 're-ran the checks',
  HUMAN_DECISION: 'made a decision',
}

export const HUMAN_DECISION: Record<string, string> = {
  PROOF_ACCEPTED: 'accepted the evidence',
  PROOF_REQUESTED: 'asked the customer for evidence',
  APPROVED: 'approved the refund',
  REJECTED: 'rejected the claim',
}

export function label(dict: Record<string, Label>, value?: string | null): Label {
  if (!value) return { text: '—', tone: 'grey' }
  return dict[value] || { text: humanize(value), tone: 'blue' }
}
export const roleName = (r?: string | null) => (r ? ROLE[r] || humanize(r) : '—')
export const reasonText = (code: string) => REASON[code] || humanize(code)

// Any status value, whichever lifecycle it belongs to (for generic status pills)
export function anyStatus(value?: string | null): Label {
  if (!value) return { text: '—', tone: 'grey' }
  return TICKET_STATUS[value] || REFUND_STATUS[value] || NEXT_ACTION[value] || BUCKET[value] || PAYMENT_STATUS[value]
    || LEDGER_STATUS[value] || PROOF_STATUS[value] || { text: humanize(value), tone: 'blue' }
}
