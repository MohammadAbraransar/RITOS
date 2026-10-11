import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireRitosAuth, errorResponse } from "@/server/auth/ritos-guard";
import { transitionTicket } from "@/server/state-machine/ticket-state-machine";
import { TicketStatus, RefundTxStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { error } = requireRitosAuth(req);
  if (error) return error;

  try {
    const refund = await prisma.refundTransaction.findUnique({
      where: { id: params.id },
      include: {
        ticket: true,
      },
    });

    if (!refund) {
      return errorResponse("NOT_FOUND", `Refund ${params.id} not found`, 404);
    }

    // Lazy settlement check: if settle_at <= now and status is PENDING, settle it lazily
    let currentStatus = refund.status;
    let updatedAt = refund.createdAt;

    if (currentStatus === "PENDING" && refund.settleAt && refund.settleAt.getTime() <= Date.now()) {
      await prisma.$transaction(async (tx) => {
        await tx.refundTransaction.update({
          where: { id: refund.id },
          data: { status: RefundTxStatus.SUCCESS },
        });

        // Advance ticket state to REFUNDED
        if (refund.ticket && refund.ticket.status !== "REFUNDED") {
          try {
            await transitionTicket(
              tx,
              refund.ticketId,
              TicketStatus.REFUNDED,
              "SETTLEMENT_POLLER",
              "REFUND_COMPLETED",
              { refund_id: refund.id, amount_minor: refund.amountMinor }
            );
          } catch {}
        }
      });

      currentStatus = RefundTxStatus.SUCCESS;
      updatedAt = new Date();
    }

    return NextResponse.json({
      refund_id: refund.id,
      status: currentStatus,
      amount_minor: refund.amountMinor,
      transaction_id: refund.transactionId,
      ticket_id: refund.ticketId,
      updated_at: updatedAt.toISOString(),
    });
  } catch (err: any) {
    return errorResponse("INTERNAL", err.message, 500);
  }
}
