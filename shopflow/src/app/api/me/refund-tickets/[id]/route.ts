import { settleRefund } from "@/server/services/settlement.service";
import { RefundTxStatus, TicketStatus } from "@prisma/client";
import { config } from "@/server/config";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireAuth, errorResponse } from "@/server/auth/guards";
import { CustomerTicketResponseSchema } from "@/server/schemas/customer";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(["CUSTOMER", "ADMIN", "SUPPORT_ANALYST"]);
  if (error || !user) return error;

  try {
    const ticket = await prisma.refundTicket.findUnique({
      where: { id: params.id },
      include: {
        product: {
          select: { id: true, name: true, imageUrl: true, sku: true },
        },
        order: {
          select: { id: true, orderedAt: true, currency: true, deliveredAt: true },
        },
        evidence: {
          select: { id: true, type: true, filename: true, storedPath: true, mime: true },
        },
        refundTransactions: {
          select: { id: true, amountMinor: true, status: true, settleAt: true, createdAt: true },
        },
      },
    });

    if (!ticket) {
      return errorResponse("NOT_FOUND", "Refund ticket not found", 404);
    }

    if (user.role === "CUSTOMER" && ticket.customerId !== user.id) {
      return errorResponse("FORBIDDEN", "You do not own this ticket", 403);
    }

    // Lazy settlement check: if any refund transaction is PENDING and settleAt <= now, settle it
    if (ticket.status !== "REFUNDED") {
      const pendingTx = ticket.refundTransactions.find(
        (rt) => rt.status === "PENDING" && rt.settleAt && rt.settleAt.getTime() <= Date.now()
      );
      if (pendingTx) {
        try {
          if (await settleRefund(pendingTx.id)) {
            ticket.status = TicketStatus.REFUNDED;
            pendingTx.status = RefundTxStatus.SUCCESS; // keep the returned copy in step with the database
          }
        } catch (err: any) {
          console.error(`[Settlement] ticket ${ticket.id} could not be settled: ${err?.message || err}`);
        }
      }
    }

    // Load audit events for customer timeline
    const auditEvents = await prisma.auditEvent.findMany({
      where: { entityType: "REFUND_TICKET", entityId: ticket.id },
      orderBy: { createdAt: "asc" },
    });

    // Friendly timeline mapping strictly without internal scores/traces
    const timeline = auditEvents.map((ae) => {
      let title = "Ticket Event";
      let description = "Status updated";

      if (ae.event === "TICKET_CREATED") {
        title = "Ticket Submitted";
        description = "Your refund request was received and submitted for review.";
      } else if (ae.event === "RITOS_HUMAN_REVIEW") {
        title = "With Our Review Team";
        description = "A specialist is reviewing your request; we will update you here.";
      } else if (ae.event === "RITOS_PROCESSING_STARTED") {
        title = "Under Orchestration";
        description = "Automated policy and order verification is underway.";
      } else if (ae.event === "DECISION_RECORDED") {
        const payload = ae.payload as any;
        if (payload?.decision === "APPROVED") {
          title = "Refund Approved";
          description = payload?.refund_amount_minor
            ? `Approved for ${new Intl.NumberFormat(config.storeLocale, { style: "currency", currency: ticket.order.currency }).format(payload.refund_amount_minor / 100)}.`
            : "Refund approved.";
        } else if (payload?.decision === "REJECTED") {
          title = "Request Rejected";
          description = payload?.reason || "Refund request did not meet return policy requirements.";
        } else if (payload?.decision === "HUMAN_REVIEW") {
          title = "Additional Verification";
          description = "Your request has been routed to our customer support team for review.";
        }
      } else if (ae.event === "REFUND_EXECUTED") {
        title = "Refund Initiated";
        description = "Payout initiated to your original payment method." +
          (config.refundCreditEstimate ? ` Expected credit: ${config.refundCreditEstimate}.` : "");
      } else if (ae.event === "EVIDENCE_ADDED") {
        title = "Photos Added";
        description = "Your new evidence was sent for review.";
      } else if (ae.event === "RITOS_MESSAGE") {
        const payload = ae.payload as any;
        title = payload?.title || "Update on your request";
        description = payload?.body || "";
      } else if (ae.event === "REFUND_COMPLETED") {
        title = "Refund Settled";
        description = "Payout settled successfully.";
      }

      return {
        event: ae.event,
        title,
        description,
        occurred_at: ae.createdAt.toISOString(),
      };
    });

    const payload = CustomerTicketResponseSchema.parse({
      ticket: {
        id: ticket.id,
        ticket_number: ticket.id,
        status: ticket.status,
        reason: ticket.reason,
        requested_action: ticket.requestedAction,
        requested_amount_minor: ticket.requestedAmountMinor,
        description: ticket.description,
        created_at: ticket.createdAt.toISOString(),
        product: ticket.product,
        order: ticket.order,
        evidence: ticket.evidence,
        refund_transactions: ticket.refundTransactions,
        timeline,
      },
    });

    return NextResponse.json(payload);
  } catch (err: any) {
    return errorResponse("SERVER_ERROR", err.message || "Failed to load ticket", 500);
  }
}
