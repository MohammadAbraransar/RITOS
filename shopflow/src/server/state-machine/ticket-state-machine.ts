import { TicketStatus, PrismaClient } from "@prisma/client";

export const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  PENDING_RITOS: ["PROCESSING", "APPROVED", "PARTIALLY_APPROVED", "REJECTED", "HUMAN_REVIEW"],
  PROCESSING: ["APPROVED", "PARTIALLY_APPROVED", "REJECTED", "HUMAN_REVIEW"],
  HUMAN_REVIEW: ["APPROVED", "PARTIALLY_APPROVED", "REJECTED"],
  APPROVED: ["REFUND_INITIATED"],
  PARTIALLY_APPROVED: ["REFUND_INITIATED"],
  REFUND_INITIATED: ["REFUND_PROCESSING", "FAILED"],
  REFUND_PROCESSING: ["REFUNDED", "FAILED"],
  FAILED: ["REFUND_INITIATED"],
  REFUNDED: [],
  REJECTED: [],
};

export class IllegalTransitionError extends Error {
  constructor(public currentStatus: TicketStatus, public targetStatus: TicketStatus) {
    super(`Illegal ticket status transition from ${currentStatus} to ${targetStatus}`);
    this.name = "IllegalTransitionError";
  }
}

export function assertValidTransition(from: TicketStatus, to: TicketStatus): void {
  const allowed = ALLOWED_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw new IllegalTransitionError(from, to);
  }
}

export async function transitionTicket(
  tx: any,
  ticketId: string,
  targetStatus: TicketStatus,
  actor: string,
  event: string,
  payload: Record<string, any> = {}
) {
  const ticket = await tx.refundTicket.findUnique({
    where: { id: ticketId },
  });

  if (!ticket) {
    throw new Error(`Ticket ${ticketId} not found`);
  }

  assertValidTransition(ticket.status, targetStatus);

  const updated = await tx.refundTicket.update({
    where: { id: ticketId },
    data: {
      status: targetStatus,
      updatedAt: new Date(),
    },
  });

  await tx.auditEvent.create({
    data: {
      entityType: "REFUND_TICKET",
      entityId: ticketId,
      event,
      actor,
      payload: {
        from_status: ticket.status,
        to_status: targetStatus,
        ...payload,
      },
    },
  });

  return updated;
}
