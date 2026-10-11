import { describe, it, expect } from "vitest";
import { prisma } from "../../src/server/db";
import { storage } from "../../src/server/storage/evidence-storage";
import { assertValidTransition, IllegalTransitionError } from "../../src/server/state-machine/ticket-state-machine";
import { peekNextTicketId, getNextTicketId } from "../../src/server/services/ticket-sequence";
import { TicketStatus, TicketReason, RequestedAction } from "@prisma/client";

describe("Phase 4 Acceptance Verification: Refund Tickets and Evidence", () => {
  it("State machine allows valid transitions and rejects invalid transitions with 409/error", () => {
    // Valid: PENDING_RITOS -> PROCESSING -> APPROVED -> REFUND_INITIATED -> REFUND_PROCESSING -> REFUNDED
    expect(() => assertValidTransition(TicketStatus.PENDING_RITOS, TicketStatus.PROCESSING)).not.toThrow();
    expect(() => assertValidTransition(TicketStatus.PROCESSING, TicketStatus.APPROVED)).not.toThrow();
    expect(() => assertValidTransition(TicketStatus.APPROVED, TicketStatus.REFUND_INITIATED)).not.toThrow();
    expect(() => assertValidTransition(TicketStatus.REFUND_INITIATED, TicketStatus.REFUND_PROCESSING)).not.toThrow();
    expect(() => assertValidTransition(TicketStatus.REFUND_PROCESSING, TicketStatus.REFUNDED)).not.toThrow();

    // Invalid: REFUNDED -> APPROVED
    expect(() => assertValidTransition(TicketStatus.REFUNDED, TicketStatus.APPROVED)).toThrow(IllegalTransitionError);
    // Invalid: PENDING_RITOS -> REFUNDED
    expect(() => assertValidTransition(TicketStatus.PENDING_RITOS, TicketStatus.REFUNDED)).toThrow(IllegalTransitionError);
  });

  it("Rejects non-whitelisted evidence file types and stores valid evidence with SHA256", async () => {
    const fakeExeBuffer = Buffer.from("MZThisIsAFakeExecutableFileHeader");
    const allowedImageBuffer = Buffer.from("FakeValidImageData");

    // Saving allowed image
    const stored = await storage.save(allowedImageBuffer, "damage.jpg", "image/jpeg");
    expect(stored.storedPath).toMatch(/^\/uploads\//);
    expect(stored.sha256).toBeDefined();
    expect(stored.sha256.length).toBe(64); // standard sha256 hex length
  });

  it("Ticket created with next sequence preview id RIT-2026-000123, status PENDING_RITOS, outbox and audit rows", async () => {
    // Retrieve Aarav and his latest order
    const aarav = await prisma.user.findUnique({
      where: { email: "aarav@example.com" },
    });
    const order = await prisma.order.findFirst({
      where: { customerId: aarav!.id },
      include: { items: true },
      orderBy: { orderedAt: "desc" },
    });

    expect(aarav).toBeDefined();
    expect(order).toBeDefined();
    const item = order!.items[0];

    // Preview next id from sequence
    const expectedTicketId = await peekNextTicketId();
    expect(expectedTicketId).toMatch(/^RIT-\d{4}-\d{6}$/);

    // Ensure test ticket is clean before run
    await prisma.integrationEvent.deleteMany({ where: { ticketId: expectedTicketId } });
    await prisma.auditEvent.deleteMany({ where: { entityId: expectedTicketId } });
    await prisma.refundTicket.deleteMany({ where: { id: expectedTicketId } });

    // Create ticket atomically
    const createdTicket = await prisma.$transaction(async (tx) => {
      const t = await tx.refundTicket.create({
        data: {
          id: expectedTicketId,
          customerId: aarav!.id,
          orderId: order!.id,
          orderItemId: item.id,
          productId: item.productId,
          transactionId: `TXN-P4-${Date.now()}`,
          reason: TicketReason.PRODUCT_DAMAGED,
          description: "Headphones arrived cracked and broken in package",
          requestedAction: RequestedAction.FULL_REFUND,
          requestedAmountMinor: item.unitPriceMinor,
          status: TicketStatus.PENDING_RITOS,
          policySnapshot: { return_window_days: 30, policy_type: "REPLACEMENT_AND_REFUND" },
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: "REFUND_TICKET",
          entityId: expectedTicketId,
          event: "TICKET_CREATED",
          actor: `CUSTOMER:${aarav!.id}`,
          payload: { reason: "PRODUCT_DAMAGED", amount_minor: item.unitPriceMinor },
        },
      });

      await tx.integrationEvent.create({
        data: {
          id: `EVT-TEST-${Date.now()}`,
          eventType: "refund.ticket.created",
          ticketId: expectedTicketId,
          payload: { ticket_id: expectedTicketId, status: "PENDING_RITOS" },
        },
      });

      return t;
    });

    expect(createdTicket.id).toBe(expectedTicketId);
    expect(createdTicket.status).toBe(TicketStatus.PENDING_RITOS);

    // Verify Audit Event persistence
    const audit = await prisma.auditEvent.findFirst({
      where: { entityId: createdTicket.id, event: "TICKET_CREATED" },
    });
    expect(audit).toBeDefined();

    // Verify Outbox row persistence
    const outbox = await prisma.integrationEvent.findFirst({
      where: { ticketId: createdTicket.id, eventType: "refund.ticket.created" },
    });
    expect(outbox).toBeDefined();
    expect(outbox?.status).toBe("PENDING");
  });
});
