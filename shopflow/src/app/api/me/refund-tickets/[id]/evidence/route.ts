import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireAuth, errorResponse } from "@/server/auth/guards";
import { emitOutboxEvent } from "@/server/outbox/outbox-dispatcher";
import { saveEvidenceFiles, evidenceRows } from "@/server/evidence/uploads";
import { TicketStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

// A ticket accepts new proof only while RITOS or a reviewer is still deciding it.
const OPEN_STATUSES: TicketStatus[] = [TicketStatus.PENDING_RITOS, TicketStatus.PROCESSING, TicketStatus.HUMAN_REVIEW];

/** Customer adds the photos RITOS asked for; RITOS is told and re-runs its agents with the new evidence. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(["CUSTOMER"]);
  if (error || !user) return error;

  const ticket = await prisma.refundTicket.findUnique({ where: { id: params.id } });
  if (!ticket) return errorResponse("NOT_FOUND", "Refund ticket not found", 404);
  if (ticket.customerId !== user.id) return errorResponse("FORBIDDEN", "You do not own this ticket", 403);
  if (!OPEN_STATUSES.includes(ticket.status)) {
    return errorResponse("INVALID_STATE", `Evidence cannot be added to a ${ticket.status} ticket`, 409);
  }

  const formData = await req.formData();
  const upload = await saveEvidenceFiles(formData.getAll("files") as Array<File | string>);
  if ("error" in upload) return errorResponse(upload.error.code, upload.error.message, 422);
  if (upload.saved.length === 0) return errorResponse("VALIDATION_ERROR", "Attach at least one file", 422);

  await prisma.$transaction(async (tx) => {
    await tx.refundEvidence.createMany({ data: evidenceRows(upload.saved).map((row) => ({ ...row, ticketId: ticket.id })) });
    await tx.auditEvent.create({
      data: {
        entityType: "REFUND_TICKET",
        entityId: ticket.id,
        event: "EVIDENCE_ADDED",
        actor: `CUSTOMER:${user.id}`,
        payload: { evidence_count: upload.saved.length },
      },
    });
    await emitOutboxEvent(tx, "refund.evidence.added", ticket.id);
  });

  return NextResponse.json({ success: true, ticket_id: ticket.id, added: upload.saved.length }, { status: 201 });
}
