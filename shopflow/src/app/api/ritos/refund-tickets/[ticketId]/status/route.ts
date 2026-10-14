import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireRitosAuth, errorResponse } from "@/server/auth/ritos-guard";
import { transitionTicket } from "@/server/state-machine/ticket-state-machine";
import { TicketStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

// PROCESSING = RITOS is working on it; HUMAN_REVIEW = a person on the RITOS desk must decide.
const StatusReportSchema = z.object({
  status: z.enum(["PROCESSING", "HUMAN_REVIEW"]),
});
const ALLOWED_FROM: Record<"PROCESSING" | "HUMAN_REVIEW", string[]> = {
  PROCESSING: ["PENDING_RITOS"],
  HUMAN_REVIEW: ["PENDING_RITOS", "PROCESSING"],
};

export async function POST(req: Request, { params }: { params: { ticketId: string } }) {
  const { error } = requireRitosAuth(req);
  if (error) return error;

  const body = await req.json();
  const parsed = StatusReportSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "status must be PROCESSING or HUMAN_REVIEW", 422);
  }

  try {
    const ticket = await prisma.refundTicket.findUnique({
      where: { id: params.ticketId },
    });

    if (!ticket) {
      return errorResponse("NOT_FOUND", `Ticket ${params.ticketId} not found`, 404);
    }

    const target = parsed.data.status;
    if (ticket.status === target) {
      return NextResponse.json({ ticket_id: ticket.id, status: target, unchanged: true }); // replay
    }
    if (!ALLOWED_FROM[target].includes(ticket.status)) {
      return errorResponse("ILLEGAL_TRANSITION", `Cannot set ticket in status ${ticket.status} to ${target}`, 409);
    }

    await prisma.$transaction(async (tx) => {
      await transitionTicket(
        tx,
        ticket.id,
        target as TicketStatus,
        "RITOS",
        target === "HUMAN_REVIEW" ? "RITOS_HUMAN_REVIEW" : "RITOS_PROCESSING_STARTED"
      );
    });

    return NextResponse.json({ ticket_id: ticket.id, status: target });
  } catch (err: any) {
    return errorResponse("INTERNAL", err.message, 500);
  }
}
