export function mockDecide(context: any) {
  const {
    ticket,
    customer,
    refund_policy,
    related_tickets,
    refund_ledger,
    derived_facts,
  } = context;

  const agentTrace: Array<{ agent: string; output: any; ms: number }> = [
    { agent: "intake", output: { ticket_id: ticket.ticket_id, reason: ticket.reason }, ms: 140 },
    { agent: "verification", output: { customer_id: customer.customer_id, account_age: customer.account_age_days }, ms: 210 },
    { agent: "policy", output: { policy_type: refund_policy.policy_type, return_window_days: refund_policy.return_window_days }, ms: 180 },
  ];

  // Rule 1: related_tickets has a REFUNDED/in-flight ticket on the same transaction and ledger remaining = 0
  const hasPriorRefund = related_tickets.some((rt: any) =>
    ["REFUNDED", "REFUND_INITIATED", "REFUND_PROCESSING"].includes(rt.status)
  );
  if (hasPriorRefund && refund_ledger.remaining_refundable_minor === 0) {
    agentTrace.push({ agent: "duplicate_detection", output: { duplicate_found: true }, ms: 90 });
    return {
      ticket_id: ticket.ticket_id,
      decision: "REJECTED",
      refund_percentage: 0,
      refund_amount_minor: 0,
      reason: "Refund already issued for this transaction",
      confidence_score: 0.97,
      processed_by: "MOCK_RITOS",
      requires_human_review: false,
      agent_trace: agentTrace,
    };
  }

  // Rule 2: claim_data_conflicts non-empty -> HUMAN_REVIEW
  if (derived_facts.claim_data_conflicts && derived_facts.claim_data_conflicts.length > 0) {
    agentTrace.push({ agent: "conflict_detector", output: { conflicts: derived_facts.claim_data_conflicts }, ms: 120 });
    return {
      ticket_id: ticket.ticket_id,
      decision: "HUMAN_REVIEW",
      refund_percentage: 0,
      refund_amount_minor: ticket.requested_amount_minor,
      reason: `Claim conflicts with tracking: ${derived_facts.claim_data_conflicts.join("; ")}`,
      confidence_score: 0.55,
      processed_by: "MOCK_RITOS",
      requires_human_review: true,
      agent_trace: agentTrace,
    };
  }

  // Rule 3: Suspicious pattern: refund_tickets_30d >= 4 and account_age_days < 30
  if (customer.refund_tickets_30d >= 4 && customer.account_age_days < 30) {
    agentTrace.push({ agent: "risk_scoring", output: { flagged_velocity: true }, ms: 300 });
    return {
      ticket_id: ticket.ticket_id,
      decision: "HUMAN_REVIEW",
      refund_percentage: 0,
      refund_amount_minor: ticket.requested_amount_minor,
      reason: "Velocity check flagged: high ticket volume on new account",
      confidence_score: 0.40,
      processed_by: "MOCK_RITOS",
      requires_human_review: true,
      agent_trace: agentTrace,
    };
  }

  // Rule 4: High-value threshold or policy HV applies
  if (
    derived_facts.above_high_value_threshold ||
    refund_policy.policy_type === "FULL_HIGH_VALUE" ||
    (refund_policy.human_approval_threshold_minor && ticket.requested_amount_minor >= refund_policy.human_approval_threshold_minor)
  ) {
    agentTrace.push({ agent: "high_value_guard", output: { high_value: true }, ms: 80 });
    return {
      ticket_id: ticket.ticket_id,
      decision: "HUMAN_REVIEW",
      refund_percentage: 100,
      refund_amount_minor: ticket.requested_amount_minor,
      reason: "High-value ticket requires human confirmation",
      confidence_score: 0.80,
      processed_by: "MOCK_RITOS",
      requires_human_review: true,
      agent_trace: agentTrace,
    };
  }

  // Rule 5: Evidence required and evidence_count == 0
  if (derived_facts.evidence_required && derived_facts.evidence_count === 0) {
    agentTrace.push({ agent: "evidence_validator", output: { missing_evidence: true }, ms: 110 });
    return {
      ticket_id: ticket.ticket_id,
      decision: "HUMAN_REVIEW",
      refund_percentage: 0,
      refund_amount_minor: ticket.requested_amount_minor,
      reason: "Required photographic evidence was not provided",
      confidence_score: 0.60,
      processed_by: "MOCK_RITOS",
      requires_human_review: true,
      agent_trace: agentTrace,
    };
  }

  // Rule 6: Non-refundable policy and no matching exception
  if (refund_policy.policy_type === "NON_REFUNDABLE" || refund_policy.refund_percentage === 0) {
    const exceptions = refund_policy.exceptions || {};
    const hasException =
      (ticket.reason === "PRODUCT_DEFECTIVE" && exceptions.manufacturing_defect) ||
      (ticket.reason === "DUPLICATE_CHARGE" && exceptions.duplicate_billing);

    if (!hasException) {
      agentTrace.push({ agent: "policy_evaluator", output: { non_refundable: true }, ms: 150 });
      return {
        ticket_id: ticket.ticket_id,
        decision: "REJECTED",
        refund_percentage: 0,
        refund_amount_minor: 0,
        reason: "Item is strictly non-refundable under catalog terms",
        confidence_score: 0.95,
        processed_by: "MOCK_RITOS",
        requires_human_review: false,
        agent_trace: agentTrace,
      };
    }
  }

  // Rule 7: within_return_window == false
  if (derived_facts.within_return_window === false) {
    agentTrace.push({ agent: "policy_evaluator", output: { window_expired: true }, ms: 120 });
    return {
      ticket_id: ticket.ticket_id,
      decision: "REJECTED",
      refund_percentage: 0,
      refund_amount_minor: 0,
      reason: `Return window of ${refund_policy.return_window_days} days has expired`,
      confidence_score: 0.95,
      processed_by: "MOCK_RITOS",
      requires_human_review: false,
      agent_trace: agentTrace,
    };
  }

  // Rule 8: Exchange-only policy and requested FULL_REFUND without defect exception
  if (refund_policy.exchange_only && ticket.requested_action === "FULL_REFUND") {
    agentTrace.push({ agent: "policy_evaluator", output: { exchange_only: true }, ms: 100 });
    return {
      ticket_id: ticket.ticket_id,
      decision: "REJECTED",
      refund_percentage: 0,
      refund_amount_minor: 0,
      reason: "Item is eligible for exchange only; refund not permitted",
      confidence_score: 0.90,
      processed_by: "MOCK_RITOS",
      requires_human_review: false,
      agent_trace: agentTrace,
    };
  }

  // Rule 9: defective_only and reason not in (DEFECTIVE, DAMAGED, WRONG_PRODUCT)
  if (
    refund_policy.defective_only &&
    !["PRODUCT_DEFECTIVE", "PRODUCT_DAMAGED", "WRONG_PRODUCT"].includes(ticket.reason)
  ) {
    agentTrace.push({ agent: "policy_evaluator", output: { not_defective: true }, ms: 100 });
    return {
      ticket_id: ticket.ticket_id,
      decision: "REJECTED",
      refund_percentage: 0,
      refund_amount_minor: 0,
      reason: "Policy permits refunds for defective or damaged items only",
      confidence_score: 0.92,
      processed_by: "MOCK_RITOS",
      requires_human_review: false,
      agent_trace: agentTrace,
    };
  }

  // Rule 10: policy percentage < 100 -> PARTIALLY_APPROVED
  if (refund_policy.refund_percentage < 100 && refund_policy.refund_percentage > 0) {
    const partialAmount = Math.round((ticket.requested_amount_minor * refund_policy.refund_percentage) / 100);
    agentTrace.push({ agent: "policy_evaluator", output: { partial_percent: refund_policy.refund_percentage }, ms: 140 });
    return {
      ticket_id: ticket.ticket_id,
      decision: "PARTIALLY_APPROVED",
      refund_percentage: refund_policy.refund_percentage,
      refund_amount_minor: partialAmount,
      reason: `Policy grants ${refund_policy.refund_percentage}% partial refund`,
      confidence_score: 0.93,
      processed_by: "MOCK_RITOS",
      requires_human_review: false,
      agent_trace: agentTrace,
    };
  }

  // Rule 11: otherwise -> APPROVED 100%
  agentTrace.push({ agent: "decision_aggregator", output: { outcome: "APPROVED" }, ms: 90 });
  return {
    ticket_id: ticket.ticket_id,
    decision: "APPROVED",
    refund_percentage: 100,
    refund_amount_minor: ticket.requested_amount_minor,
    reason: "Eligible under product refund policy; evidence provided; within window.",
    confidence_score: 0.96,
    processed_by: "MOCK_RITOS",
    requires_human_review: false,
    agent_trace: agentTrace,
  };
}
