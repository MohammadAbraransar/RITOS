import { describe, it, expect } from "vitest";
import { z } from "zod";
import { buildRefundContext } from "../../src/server/ritos/context-builder";

// Strict Zod schema validating the contract in docs/02 §1
const ContextContractSchema = z.object({
  context_version: z.literal("1.0"),
  generated_at: z.string(),
  ticket: z.object({
    ticket_id: z.string(),
    status: z.string(),
    reason: z.string(),
    description: z.string(),
    requested_action: z.string(),
    requested_amount_minor: z.number().int().positive(),
    currency: z.literal("INR"),
    created_at: z.string(),
  }),
  customer: z.object({
    customer_id: z.string(),
    name: z.string(),
    email: z.string().email(),
    account_age_days: z.number().int().nonnegative(),
    lifetime_order_count: z.number().int().nonnegative(),
    refund_tickets_30d: z.number().int().nonnegative(),
    refund_tickets_90d: z.number().int().nonnegative(),
    refund_tickets_lifetime: z.number().int().nonnegative(),
    risk_metadata: z.record(z.any()),
  }),
  order: z.object({
    order_id: z.string(),
    status: z.string(),
    delivery_status: z.string(),
    ordered_at: z.string(),
    delivered_at: z.string().nullable(),
    total_minor: z.number().int().positive(),
    shipping_address: z.any(),
    items: z.array(
      z.object({
        order_item_id: z.string(),
        product_id: z.string(),
        quantity: z.number().int().positive(),
        unit_price_minor: z.number().int().positive(),
        unit_serial: z.string().nullable(),
      })
    ),
  }),
  product: z.object({
    product_id: z.string(),
    sku: z.string(),
    name: z.string(),
    category: z.string(),
    brand: z.string(),
    price_minor: z.number().int().positive(),
    is_digital: z.boolean(),
    is_personalized: z.boolean(),
    is_clearance: z.boolean(),
  }),
  transaction: z.object({
    transaction_id: z.string(),
    payment_id: z.string(),
    amount_minor: z.number().int().positive(),
    payment_method: z.string(),
    payment_status: z.string(),
    paid_at: z.string(),
  }),
  refund_policy: z.object({
    policy_version: z.number().int().positive(),
    policy_type: z.string(),
    refund_percentage: z.number().int(),
    return_window_days: z.number().int().nonnegative(),
    opened_allowed: z.boolean(),
    requires_unused: z.boolean(),
    defective_only: z.boolean(),
    exchange_only: z.boolean(),
    replacement_allowed: z.boolean(),
    return_required: z.boolean(),
    return_shipping: z.string(),
    verification_required: z.string(),
    evidence_required_reasons: z.array(z.string()),
    human_approval_threshold_minor: z.number().nullable(),
    exceptions: z.record(z.any()),
    snapshot_taken_at: z.string(),
  }),
  evidence: z.array(
    z.object({
      evidence_id: z.string(),
      type: z.string(),
      filename: z.string(),
      mime: z.string(),
      size_bytes: z.number().int().positive(),
      sha256: z.string(),
      url: z.string(),
      uploaded_at: z.string(),
    })
  ),
  refund_history: z.array(
    z.object({
      ticket_id: z.string(),
      order_id: z.string(),
      product_id: z.string(),
      status: z.string(),
      refunded_amount_minor: z.number().int().nonnegative(),
      created_at: z.string(),
    })
  ),
  related_tickets: z.array(
    z.object({
      ticket_id: z.string(),
      relation: z.string(),
      status: z.string(),
      refunded_amount_minor: z.number().int().nonnegative(),
    })
  ),
  refund_ledger: z.object({
    transaction_amount_minor: z.number().int().positive(),
    already_refunded_minor: z.number().int().nonnegative(),
    in_flight_minor: z.number().int().nonnegative(),
    remaining_refundable_minor: z.number().int().nonnegative(),
  }),
  derived_facts: z.object({
    days_since_delivery: z.number().nullable(),
    return_window_expires_at: z.string().nullable(),
    within_return_window: z.boolean(),
    evidence_required: z.boolean(),
    evidence_count: z.number().int().nonnegative(),
    requested_exceeds_remaining: z.boolean(),
    above_high_value_threshold: z.boolean(),
    claim_data_conflicts: z.array(z.string()),
    reason_policy_notes: z.array(z.string()),
  }),
  timestamps: z.object({
    order_created: z.string(),
    delivered: z.string().nullable(),
    ticket_created: z.string(),
  }),
});

describe("Phase 5 Acceptance Verification: RITOS Read API & Contract", () => {
  it("Validates context JSON against strict Zod schema for Scenario 1 (RIT-2026-000100)", async () => {
    const context = await buildRefundContext("RIT-2026-000100");
    expect(context).not.toBeNull();
    const parsed = ContextContractSchema.safeParse(context);
    expect(parsed.success).toBe(true);
    expect(context?.derived_facts.within_return_window).toBe(true);
    expect(context?.derived_facts.evidence_required).toBe(true);
    expect(context?.derived_facts.evidence_count).toBeGreaterThan(0);
  });

  it("Scenario 4 (RIT-2026-000106): within_return_window = false", async () => {
    const context = await buildRefundContext("RIT-2026-000106");
    expect(context).not.toBeNull();
    expect(context?.derived_facts.within_return_window).toBe(false);
  });

  it("Scenario 7 (RIT-2026-000112): related_tickets contains REFUNDED sibling and remaining_refundable_minor = 0", async () => {
    const context = await buildRefundContext("RIT-2026-000112");
    expect(context).not.toBeNull();
    const sibling = context?.related_tickets.find((t) => t.ticket_id === "RIT-2026-000111");
    expect(sibling).toBeDefined();
    expect(sibling?.status).toBe("REFUNDED");
    expect(context?.refund_ledger.remaining_refundable_minor).toBe(0);
  });

  it("Scenario 8 (RIT-2026-000114): contains conflict string for ORDER_NEVER_ARRIVED while order is DELIVERED", async () => {
    const context = await buildRefundContext("RIT-2026-000114");
    expect(context).not.toBeNull();
    expect(context?.derived_facts.claim_data_conflicts.length).toBeGreaterThan(0);
    expect(context?.derived_facts.claim_data_conflicts[0]).toContain(
      "Reason is ORDER_NEVER_ARRIVED but order.delivery_status is DELIVERED"
    );
  });
});
