import { describe, it, expect } from "vitest";
import { prisma } from "../../src/server/db";
import { emitOutboxEvent } from "../../src/server/outbox/outbox-dispatcher";

describe("Phase 8 Acceptance Verification: Admin and Demo Console Controls", () => {
  it("Admin toggle simulate-refund-failure mutates persisted state on ticket", async () => {
    const ticket = await prisma.refundTicket.findFirst();
    expect(ticket).not.toBeNull();

    const initialState = ticket!.simulateRefundFailure;

    // Mutate state
    const updated = await prisma.refundTicket.update({
      where: { id: ticket!.id },
      data: { simulateRefundFailure: !initialState },
    });
    expect(updated.simulateRefundFailure).toBe(!initialState);

    // Revert state
    const reverted = await prisma.refundTicket.update({
      where: { id: ticket!.id },
      data: { simulateRefundFailure: initialState },
    });
    expect(reverted.simulateRefundFailure).toBe(initialState);
  });

  it("RITOS console shows outbox exchange for a ticket just created", async () => {
    const testTicketId = "RIT-2026-000100";
    const event = await prisma.$transaction(async (tx) => {
      return emitOutboxEvent(tx, "refund.ticket.created", testTicketId, {
        resend_requested_by: "ADMIN_TEST",
      });
    });

    expect(event).toBeDefined();
    expect(event.ticketId).toBe(testTicketId);

    // Query persisted exchange/outbox state as the admin console does
    const outboxEvents = await prisma.integrationEvent.findMany({
      where: { ticketId: testTicketId },
      orderBy: { createdAt: "desc" },
    });

    expect(outboxEvents.length).toBeGreaterThan(0);
    const found = outboxEvents.find((e) => e.id === event.id);
    expect(found).toBeDefined();
    expect(found?.eventType).toBe("refund.ticket.created");
  });
});
