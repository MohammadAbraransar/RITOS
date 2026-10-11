import { z } from "zod";

export const CustomerTimelineItemSchema = z.object({
  event: z.string(),
  title: z.string(),
  description: z.string(),
  occurred_at: z.string(),
});

export const CustomerEvidenceSchema = z.object({
  id: z.string(),
  type: z.string(),
  filename: z.string(),
  storedPath: z.string(),
  mime: z.string(),
});

export const CustomerRefundTransactionSchema = z.object({
  id: z.string(),
  amountMinor: z.number(),
  status: z.string(),
  settleAt: z.date().nullable().or(z.string().nullable()),
  createdAt: z.date().or(z.string()),
});

export const CustomerRefundTicketSchema = z.object({
  id: z.string(),
  ticket_number: z.string(),
  status: z.string(),
  reason: z.string(),
  requested_action: z.string(),
  requested_amount_minor: z.number(),
  description: z.string().nullable(),
  created_at: z.string(),
  product: z.object({
    id: z.string(),
    name: z.string(),
    imageUrl: z.string().nullable(),
    sku: z.string(),
  }),
  order: z.object({
    id: z.string(),
    orderedAt: z.date().or(z.string()),
    deliveredAt: z.date().nullable().or(z.string().nullable()),
  }),
  evidence: z.array(CustomerEvidenceSchema),
  refund_transactions: z.array(CustomerRefundTransactionSchema),
  timeline: z.array(CustomerTimelineItemSchema),
});

export const CustomerTicketResponseSchema = z.object({
  ticket: CustomerRefundTicketSchema,
});
