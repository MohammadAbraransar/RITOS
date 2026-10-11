import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireRitosAuth, errorResponse } from "@/server/auth/ritos-guard";
import { transitionTicket } from "@/server/state-machine/ticket-state-machine";
import { TicketStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const StatusReportSchema = z.object({
  status: z.literal("PROCESSING"),
});

export async function POST(req: Request, { params }: { params: { ticketId: string } }) {
  const { error } = requireRitosAuth(req);
  if (error) return error;

  const body = await req.json();
  const parsed = StatusReportSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Only PROCESSING status is allowed", 422);
  }

  try {
    const ticket = await prisma.refundTicket.findUnique({
      where: { id: params.ticketId },
    });

    if (!ticket) {
      return errorResponse("NOT_FOUND", `Ticket ${params.ticketId} not found`, 404);
    }

    if (ticket.status !== "PENDING_RITOS") {
      return errorResponse(
        "ILLEGAL_TRANSITION",
        `Cannot set ticket in status ${ticket.status} to PROCESSING`,
        409
      );
    }

    await prisma.$transaction(async (tx) => {
      await transitionTicket(
        tx,
        ticket.id,
        TicketStatus.PROCESSING,
        "RITOS",
        "RITOS_PROCESSING_STARTED"
      );
    });

    return NextResponse.json({
      ticket_id: ticket.id,
      status: "PROCESSING",
    });
  } catch (err: any) {
    return errorResponse("INTERNAL", err.message, 500);
  }
}
