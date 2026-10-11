import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireAuth, errorResponse } from "@/server/auth/guards";
import { emitOutboxEvent } from "@/server/outbox/outbox-dispatcher";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { ticketId: string } }) {
  const { user, error } = await requireAuth(["ADMIN", "SUPPORT_ANALYST"]);
  if (error || !user) return error;

  try {
    const ticket = await prisma.refundTicket.findUnique({
      where: { id: params.ticketId },
    });

    if (!ticket) {
      return errorResponse("NOT_FOUND", `Ticket ${params.ticketId} not found`, 404);
    }

    const event = await prisma.$transaction(async (tx) => {
      return emitOutboxEvent(tx, "refund.ticket.created", ticket.id, {
        resend_requested_by: user.id,
      });
    });

    return NextResponse.json({
      success: true,
      ticket_id: ticket.id,
      event_id: event.id,
      message: `Ticket ${ticket.id} queued for resending to RITOS`,
    });
  } catch (err: any) {
    return errorResponse("INTERNAL", err.message, 500);
  }
}
