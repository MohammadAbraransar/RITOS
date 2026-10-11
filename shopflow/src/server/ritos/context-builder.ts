import { prisma } from "@/server/db";

export async function buildRefundContext(ticketId: string) {
  const ticket = await prisma.refundTicket.findUnique({
    where: { id: ticketId },
    include: {
      customer: true,
      order: {
        include: {
          items: true,
          payment: {
            include: {
              refundTransactions: true,
            },
          },
        },
      },
      product: {
        include: {
          policy: true,
        },
      },
      evidence: true,
    },
  });

  if (!ticket) return null;

  const { customer, order, product } = ticket;
  const payment = order.payment;
  const rawSnapshot = ticket.policySnapshot as any;
  const policySnapshot = rawSnapshot || (product.policy ? {
    policy_version: product.policy.version,
    policy_type: product.policy.policyType,
    refund_percentage: product.policy.refundPercentage,
    return_window_days: product.policy.returnWindowDays,
    opened_allowed: product.policy.openedAllowed,
    requires_unused: product.policy.requiresUnused,
    defective_only: product.policy.defectiveOnly,
    exchange_only: product.policy.exchangeOnly,
    replacement_allowed: product.policy.replacementAllowed,
    return_required: product.policy.returnRequired,
    return_shipping: product.policy.returnShipping,
    verification_required: product.policy.verificationRequired,
    evidence_required_reasons: product.policy.evidenceRequiredReasons,
    human_approval_threshold_minor: product.policy.humanApprovalThresholdMinor,
    exceptions: product.policy.exceptions || {},
    snapshot_taken_at: ticket.createdAt.toISOString(),
  } : {});

  // 1. Customer statistics
  const now = new Date();
  const accountAgeDays = Math.max(
    0,
    Math.floor((now.getTime() - new Date(customer.createdAt).getTime()) / (1000 * 60 * 60 * 24))
  );

  const lifetimeOrderCount = await prisma.order.count({
    where: { customerId: customer.id },
  });

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const refundTickets30d = await prisma.refundTicket.count({
    where: { customerId: customer.id, createdAt: { gte: thirtyDaysAgo } },
  });
  const refundTickets90d = await prisma.refundTicket.count({
    where: { customerId: customer.id, createdAt: { gte: ninetyDaysAgo } },
  });
  const refundTicketsLifetime = await prisma.refundTicket.count({
    where: { customerId: customer.id },
  });

  // 2. Refund history (all past completed tickets of this customer)
  const pastTickets = await prisma.refundTicket.findMany({
    where: {
      customerId: customer.id,
      id: { not: ticket.id },
    },
    include: {
      refundTransactions: { where: { status: "SUCCESS" } },
    },
    orderBy: { createdAt: "desc" },
  });

  const refundHistory = pastTickets.map((pt) => {
    const refundedMinor = pt.refundTransactions.reduce((sum, rt) => sum + rt.amountMinor, 0);
    return {
      ticket_id: pt.id,
      order_id: pt.orderId,
      product_id: pt.productId,
      status: pt.status,
      refunded_amount_minor: refundedMinor,
      created_at: pt.createdAt.toISOString(),
    };
  });

  // 3. Related tickets (tickets on the same transaction or same order item)
  const relatedDbTickets = await prisma.refundTicket.findMany({
    where: {
      transactionId: ticket.transactionId,
      id: { not: ticket.id },
    },
    include: {
      refundTransactions: { where: { status: "SUCCESS" } },
    },
  });

  const relatedTickets = relatedDbTickets.map((rt) => {
    const refundedMinor = rt.refundTransactions.reduce((sum, t) => sum + t.amountMinor, 0);
    return {
      ticket_id: rt.id,
      relation: "SAME_TRANSACTION",
      status: rt.status,
      refunded_amount_minor: refundedMinor,
    };
  });

  // 4. Refund ledger
  const txnAmountMinor = payment?.amountMinor || ticket.requestedAmountMinor;
  const allTxnRefunds = payment
    ? payment.refundTransactions
    : await prisma.refundTransaction.findMany({ where: { transactionId: ticket.transactionId } });

  const alreadyRefundedMinor = allTxnRefunds
    .filter((r) => r.status === "SUCCESS")
    .reduce((sum, r) => sum + r.amountMinor, 0);

  const inFlightMinor = allTxnRefunds
    .filter((r) => ["PENDING", "PROCESSING"].includes(r.status))
    .reduce((sum, r) => sum + r.amountMinor, 0);

  const remainingRefundableMinor = Math.max(0, txnAmountMinor - alreadyRefundedMinor - inFlightMinor);

  // 5. Derived facts calculation
  let daysSinceDelivery: number | null = null;
  let returnWindowExpiresAt: string | null = null;
  let withinReturnWindow = true;

  const returnWindowDays = policySnapshot.return_window_days ?? (product.policy?.returnWindowDays || 30);

  if (order.deliveredAt) {
    const delivTime = new Date(order.deliveredAt).getTime();
    daysSinceDelivery = Math.max(0, Math.floor((now.getTime() - delivTime) / (1000 * 60 * 60 * 24)));
    const expiresDate = new Date(delivTime + returnWindowDays * 24 * 60 * 60 * 1000);
    returnWindowExpiresAt = expiresDate.toISOString();
    withinReturnWindow = daysSinceDelivery <= returnWindowDays;
  } else {
    // If not delivered yet, window hasn't expired unless order was cancelled
    withinReturnWindow = true;
  }

  // Evidence required calculation
  const evidenceRequiredReasons: string[] = policySnapshot.evidence_required_reasons || product.policy?.evidenceRequiredReasons || [];
  const evidenceRequired = evidenceRequiredReasons.includes(ticket.reason);
  const evidenceCount = ticket.evidence.length;

  const requestedExceedsRemaining = ticket.requestedAmountMinor > remainingRefundableMinor;

  const hvThreshold = policySnapshot.human_approval_threshold_minor ?? product.policy?.humanApprovalThresholdMinor ?? 5000000;
  const aboveHighValueThreshold = ticket.requestedAmountMinor >= (hvThreshold || 5000000);

  // Conflict detection
  const claimDataConflicts: string[] = [];
  if (ticket.reason === "ORDER_NEVER_ARRIVED" && order.deliveryStatus === "DELIVERED") {
    claimDataConflicts.push("Reason is ORDER_NEVER_ARRIVED but order.delivery_status is DELIVERED");
  }
  const targetOrderItem = order.items.find((it) => it.id === ticket.orderItemId);
  if (targetOrderItem) {
    if (ticket.requestedAmountMinor > targetOrderItem.unitPriceMinor * targetOrderItem.quantity) {
      claimDataConflicts.push(
        `Requested amount ${ticket.requestedAmountMinor} exceeds item price ${targetOrderItem.unitPriceMinor * targetOrderItem.quantity}`
      );
    }
  }

  const reasonPolicyNotes: string[] = [];
  if (ticket.reason === "PRODUCT_DAMAGED") {
    reasonPolicyNotes.push("Policy accepts damaged items with evidence");
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  return {
    context_version: "1.0",
    generated_at: now.toISOString(),
    ticket: {
      ticket_id: ticket.id,
      status: ticket.status,
      reason: ticket.reason,
      description: ticket.description,
      requested_action: ticket.requestedAction,
      requested_amount_minor: ticket.requestedAmountMinor,
      currency: "INR",
      created_at: ticket.createdAt.toISOString(),
    },
    customer: {
      customer_id: customer.id,
      name: customer.name,
      email: customer.email,
      account_age_days: accountAgeDays,
      lifetime_order_count: lifetimeOrderCount,
      refund_tickets_30d: refundTickets30d,
      refund_tickets_90d: refundTickets90d,
      refund_tickets_lifetime: refundTicketsLifetime,
      risk_metadata: customer.riskMetadata || {},
    },
    order: {
      order_id: order.id,
      status: order.status,
      delivery_status: order.deliveryStatus,
      ordered_at: order.orderedAt.toISOString(),
      delivered_at: order.deliveredAt ? order.deliveredAt.toISOString() : null,
      total_minor: order.totalMinor,
      shipping_address: order.shippingAddress,
      items: order.items.map((it) => ({
        order_item_id: it.id,
        product_id: it.productId,
        quantity: it.quantity,
        unit_price_minor: it.unitPriceMinor,
        unit_serial: it.unitSerial,
      })),
    },
    product: {
      product_id: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      brand: product.brand,
      price_minor: product.priceMinor,
      is_digital: product.isDigital,
      is_personalized: product.isPersonalized,
      is_clearance: product.isClearance,
    },
    transaction: {
      transaction_id: ticket.transactionId,
      payment_id: payment?.id || `PAY-${ticket.transactionId.replace("TXN-", "")}`,
      amount_minor: txnAmountMinor,
      payment_method: payment?.method || "UPI",
      payment_status: payment?.status || "PAID",
      paid_at: payment?.paidAt ? payment.paidAt.toISOString() : order.orderedAt.toISOString(),
    },
    refund_policy: {
      policy_version: policySnapshot.policy_version || product.policy?.version || 1,
      policy_type: policySnapshot.policy_type || product.policy?.policyType || "FULL",
      refund_percentage: policySnapshot.refund_percentage ?? product.policy?.refundPercentage ?? 100,
      return_window_days: returnWindowDays,
      opened_allowed: policySnapshot.opened_allowed ?? product.policy?.openedAllowed ?? true,
      requires_unused: policySnapshot.requires_unused ?? product.policy?.requiresUnused ?? false,
      defective_only: policySnapshot.defective_only ?? product.policy?.defectiveOnly ?? false,
      exchange_only: policySnapshot.exchange_only ?? product.policy?.exchangeOnly ?? false,
      replacement_allowed: policySnapshot.replacement_allowed ?? product.policy?.replacementAllowed ?? true,
      return_required: policySnapshot.return_required ?? product.policy?.returnRequired ?? true,
      return_shipping: policySnapshot.return_shipping || product.policy?.returnShipping || "FREE",
      verification_required: policySnapshot.verification_required || product.policy?.verificationRequired || "NONE",
      evidence_required_reasons: evidenceRequiredReasons,
      human_approval_threshold_minor: policySnapshot.human_approval_threshold_minor ?? product.policy?.humanApprovalThresholdMinor ?? null,
      exceptions: policySnapshot.exceptions || product.policy?.exceptions || {},
      snapshot_taken_at: policySnapshot.snapshot_taken_at || ticket.createdAt.toISOString(),
    },
    evidence: ticket.evidence.map((ev) => ({
      evidence_id: ev.id,
      type: ev.type,
      filename: ev.filename,
      mime: ev.mime,
      size_bytes: ev.sizeBytes,
      sha256: ev.sha256,
      url: `${baseUrl}/api/ritos/evidence/${ev.id}/download`,
      uploaded_at: ev.uploadedAt.toISOString(),
    })),
    refund_history: refundHistory,
    related_tickets: relatedTickets,
    refund_ledger: {
      transaction_amount_minor: txnAmountMinor,
      already_refunded_minor: alreadyRefundedMinor,
      in_flight_minor: inFlightMinor,
      remaining_refundable_minor: remainingRefundableMinor,
    },
    derived_facts: {
      days_since_delivery: daysSinceDelivery,
      return_window_expires_at: returnWindowExpiresAt,
      within_return_window: withinReturnWindow,
      evidence_required: evidenceRequired,
      evidence_count: evidenceCount,
      requested_exceeds_remaining: requestedExceedsRemaining,
      above_high_value_threshold: aboveHighValueThreshold,
      claim_data_conflicts: claimDataConflicts,
      reason_policy_notes: reasonPolicyNotes,
    },
    timestamps: {
      order_created: order.orderedAt.toISOString(),
      delivered: order.deliveredAt ? order.deliveredAt.toISOString() : null,
      ticket_created: ticket.createdAt.toISOString(),
    },
  };
}
