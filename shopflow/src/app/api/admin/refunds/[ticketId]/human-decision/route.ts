import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireAuth, errorResponse } from "@/server/auth/guards";
import { transitionTicket } from "@/server/state-machine/ticket-state-machine";
import { executeRefundTransaction } from "@/server/services/refund-execution.service";
import { emitOutboxEvent } from "@/server/outbox/outbox-dispatcher";
import { TicketStatus, DecisionType } from "@prisma/client";

export const dynamic = "force-dynamic";

const HumanDecisionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "MODIFY"]),
  refund_amount_minor: z.number().int().nonnegative().optional(),
  note: z.string().min(1),
});

export async function POST(req: Request, { params }: { params: { ticketId: string } }) {
  const { user, error } = await requireAuth(["SUPPORT_ANALYST", "ADMIN"]);
  if (error || !user) return error;

  const body = await req.json();
  const parsed = HumanDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid human decision", 422, parsed.error.format());
  }

  const { action, refund_amount_minor, note } = parsed.data;

  try {
    const ticket = await prisma.refundTicket.findUnique({
      where: { id: params.ticketId },
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
      return errorResponse("NOT_FOUND", `Ticket ${params.ticketId} not found`, 404);
    }

    if (ticket.status !== "HUMAN_REVIEW") {
      return errorResponse(
        "ILLEGAL_TRANSITION",
        `Ticket must be in HUMAN_REVIEW status (currently ${ticket.status})`,
        409
      );
    }

    const payment = ticket.order.payment;
    const alreadyRefunded = (payment?.refundTransactions || [])
      .filter((r) => r.status === "SUCCESS")
      .reduce((sum, r) => sum + r.amountMinor, 0);
    const remainingRefundable = Math.max(0, (payment?.amountMinor || 0) - alreadyRefunded);

    let finalAmountMinor = 0;
    let targetStatus: TicketStatus = TicketStatus.REJECTED;
    let decisionType: DecisionType = DecisionType.REJECTED;

    if (action === "APPROVE") {
      finalAmountMinor = Math.min(ticket.requestedAmountMinor, remainingRefundable);
      targetStatus = TicketStatus.APPROVED;
      decisionType = DecisionType.APPROVED;
    } else if (action === "MODIFY") {
      if (refund_amount_minor === undefined || refund_amount_minor <= 0) {
        return errorResponse("VALIDATION_ERROR", "MODIFY action requires positive refund_amount_minor", 422);
      }
      if (refund_amount_minor > remainingRefundable) {
        return errorResponse("AMOUNT_EXCEEDS_REFUNDABLE", `Amount exceeds remaining refundable ${remainingRefundable}`, 422);
      }
      finalAmountMinor = refund_amount_minor;
      targetStatus = finalAmountMinor === remainingRefundable ? TicketStatus.APPROVED : TicketStatus.PARTIALLY_APPROVED;
      decisionType = finalAmountMinor === remainingRefundable ? DecisionType.APPROVED : DecisionType.PARTIALLY_APPROVED;
    } else {
      targetStatus = TicketStatus.REJECTED;
      decisionType = DecisionType.REJECTED;
    }

    // Persist human decision and transition ticket
    await prisma.$transaction(async (tx) => {
      const decisionId = `DEC-HUMAN-${Date.now()}`;
      await tx.refundDecision.create({
        data: {
          id: decisionId,
          ticketId: ticket.id,
          decision: decisionType,
          refundPercentage: Math.round((finalAmountMinor / (ticket.requestedAmountMinor || 1)) * 100),
          refundAmountMinor: finalAmountMinor,
          reason: note,
          confidenceScore: 1.0,
          processedBy: `HUMAN:${user.id}`,
          requiresHumanReview: false,
          humanNote: note,
        },
      });

      await transitionTicket(
        tx,
        ticket.id,
        targetStatus,
        `HUMAN:${user.id}`,
        "HUMAN_DECIDED",
        { action, amount_minor: finalAmountMinor, note }
      );

      // Customer notification
      await tx.notification.create({
        data: {
          userId: ticket.customerId,
          ticketId: ticket.id,
          title: targetStatus === "REJECTED" ? "Refund request rejected" : "Refund approved by support",
          body:
            targetStatus === "REJECTED"
              ? `Review note: ${note}`
              : `Support approved ₹${(finalAmountMinor / 100).toLocaleString("en-IN")}. Note: ${note}`,
          channel: "IN_APP",
        },
      });

      await emitOutboxEvent(tx, "refund.human.decided", ticket.id, {
        decision: decisionType,
        amount_minor: finalAmountMinor,
        analyst_id: user.id,
      });
    });

    // Execute refund if approved
    if (["APPROVED", "PARTIALLY_APPROVED"].includes(targetStatus) && payment) {
      const execOwner = process.env.EXECUTION_OWNER || "shopflow";
      if (execOwner === "shopflow") {
        await executeRefundTransaction({
          transaction_id: payment.transactionId,
          amount_minor: finalAmountMinor,
          ticket_id: ticket.id,
          idempotency_key: `human-exec-${ticket.id}-${Date.now()}`,
        });
      }
    }

    return NextResponse.json({
      success: true,
      ticket_id: ticket.id,
      status: targetStatus,
      amount_minor: finalAmountMinor,
      note,
    });
  } catch (err: any) {
    return errorResponse("INTERNAL", err.message || "Failed to process human decision", 500);
  }
}
