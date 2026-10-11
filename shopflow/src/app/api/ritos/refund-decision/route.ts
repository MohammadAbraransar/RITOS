import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireRitosAuth, errorResponse } from "@/server/auth/ritos-guard";
import { checkIdempotency, storeIdempotency } from "@/server/ritos/idempotency";
import { transitionTicket } from "@/server/state-machine/ticket-state-machine";
import { executeRefundTransaction } from "@/server/services/refund-execution.service";
import { emitOutboxEvent } from "@/server/outbox/outbox-dispatcher";
import { TicketStatus, DecisionType } from "@prisma/client";

export const dynamic = "force-dynamic";

const DecisionSchema = z.object({
  ticket_id: z.string(),
  decision: z.enum(["APPROVED", "PARTIALLY_APPROVED", "REJECTED", "HUMAN_REVIEW"]),
  refund_percentage: z.number().int().min(0).max(100),
  refund_amount_minor: z.number().int().nonnegative(),
  reason: z.string(),
  confidence_score: z.number().min(0).max(1),
  processed_by: z.string(),
  requires_human_review: z.boolean(),
  agent_trace: z.any().optional(),
});

export async function POST(req: Request) {
  const { error } = requireRitosAuth(req);
  if (error) return error;

  const idempotencyKey = req.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return errorResponse("VALIDATION_ERROR", "Missing Idempotency-Key header", 400);
  }

  const body = await req.json();
  const parsed = DecisionSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid decision payload", 422, parsed.error.format());
  }

  const data = parsed.data;

  // 1. Check idempotency
  const idemp = await checkIdempotency(idempotencyKey, "/api/ritos/refund-decision", data);
  if (idemp.error) {
    return errorResponse(idemp.error.code, idemp.error.message, idemp.error.status);
  }
  if (idemp.isReplay) {
    return NextResponse.json(idemp.responseBody, {
      status: idemp.statusCode,
      headers: { "Idempotent-Replayed": "true" },
    });
  }

  try {
    const ticket = await prisma.refundTicket.findUnique({
      where: { id: data.ticket_id },
      include: {
        order: {
          include: {
            payment: {
              include: { refundTransactions: true },
            },
          },
        },
      },
    });

    if (!ticket) {
      return errorResponse("NOT_FOUND", `Ticket ${data.ticket_id} not found`, 404);
    }

    // Must be PENDING_RITOS or PROCESSING
    if (!["PENDING_RITOS", "PROCESSING"].includes(ticket.status)) {
      return errorResponse(
        "ILLEGAL_TRANSITION",
        `Cannot record decision for ticket in status ${ticket.status}. Must be PENDING_RITOS or PROCESSING.`,
        409
      );
    }

    // Guardrails on ledger
    const payment = ticket.order.payment;
    if (["APPROVED", "PARTIALLY_APPROVED"].includes(data.decision)) {
      const alreadyRefunded = (payment?.refundTransactions || [])
        .filter((r) => r.status === "SUCCESS")
        .reduce((sum, r) => sum + r.amountMinor, 0);
      const remainingRefundable = Math.max(0, (payment?.amountMinor || 0) - alreadyRefunded);

      if (data.refund_amount_minor > remainingRefundable) {
        return errorResponse(
          "AMOUNT_EXCEEDS_REFUNDABLE",
          `Decision refund amount ${data.refund_amount_minor} exceeds remaining refundable ${remainingRefundable}`,
          422
        );
      }

      if (remainingRefundable === 0) {
        return errorResponse("DUPLICATE_REFUND", "Refund ledger is already fully refunded", 409);
      }
    }

    const decisionId = `DEC-${Date.now()}`;
    const targetStatus = data.decision as TicketStatus;

    // Persist decision and transition ticket
    await prisma.$transaction(async (tx) => {
      await tx.refundDecision.create({
        data: {
          id: decisionId,
          ticketId: ticket.id,
          decision: data.decision as DecisionType,
          refundPercentage: data.refund_percentage,
          refundAmountMinor: data.refund_amount_minor,
          reason: data.reason,
          confidenceScore: data.confidence_score,
          processedBy: data.processed_by,
          requiresHumanReview: data.requires_human_review,
          agentTrace: data.agent_trace || [],
        },
      });

      await transitionTicket(
        tx,
        ticket.id,
        targetStatus,
        data.processed_by,
        "DECISION_RECORDED",
        {
          decision: data.decision,
          confidence_score: data.confidence_score,
          refund_amount_minor: data.refund_amount_minor,
        }
      );

      // Customer notification for decisions
      const title =
        data.decision === "APPROVED" || data.decision === "PARTIALLY_APPROVED"
          ? "Refund approved"
          : data.decision === "REJECTED"
          ? "Refund request update"
          : "Refund request under review";

      const bodyMsg =
        data.decision === "APPROVED" || data.decision === "PARTIALLY_APPROVED"
          ? `₹${(data.refund_amount_minor / 100).toLocaleString("en-IN")} refund approved.`
          : data.decision === "REJECTED"
          ? "Your refund request could not be approved based on policy terms."
          : "Your refund request has been escalated to our team for additional review.";

      await tx.notification.create({
        data: {
          userId: ticket.customerId,
          ticketId: ticket.id,
          title,
          body: bodyMsg,
          channel: "IN_APP",
        },
      });

      await emitOutboxEvent(tx, "refund.decision.received", ticket.id, {
        decision: data.decision,
        amount_minor: data.refund_amount_minor,
      });
    });

    let nextStep = "CLOSED";
    if (data.decision === "HUMAN_REVIEW") {
      nextStep = "HUMAN_REVIEW_QUEUE";
    } else if (["APPROVED", "PARTIALLY_APPROVED"].includes(data.decision)) {
      nextStep = "AWAIT_REFUND_EXECUTION";

      // If EXECUTION_OWNER=shopflow (default), auto-execute refund
      const execOwner = process.env.EXECUTION_OWNER || "shopflow";
      if (execOwner === "shopflow" && payment) {
        try {
          await executeRefundTransaction({
            transaction_id: payment.transactionId,
            amount_minor: data.refund_amount_minor,
            ticket_id: ticket.id,
            idempotency_key: `auto-exec-${ticket.id}-${Date.now()}`,
          });
          nextStep = "REFUND_EXECUTED";
        } catch (err: any) {
          console.error("Auto refund execution failed:", err);
        }
      }
    }

    const responsePayload = {
      ticket_id: ticket.id,
      status: targetStatus,
      next: nextStep,
    };

    await storeIdempotency(idempotencyKey, "/api/ritos/refund-decision", idemp.bodyHash!, 200, responsePayload);

    return NextResponse.json(responsePayload);
  } catch (err: any) {
    return errorResponse("INTERNAL", err.message || "Failed to process decision", 500);
  }
}
