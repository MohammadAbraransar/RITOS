import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "../../src/server/db";
import { executeRefundTransaction } from "../../src/server/services/refund-execution.service";
import { assertValidTransition, IllegalTransitionError } from "../../src/server/state-machine/ticket-state-machine";
import { TicketStatus, OrderStatus, PaymentMethod, PaymentStatus } from "@prisma/client";

describe("Phase 6 Acceptance Verification: Decision Callback & Refund Execution", () => {
  let testPaymentTxnId: string;
  let testTicketId: string;
  const testAmountMinor = 299900;

  beforeAll(async () => {
    // Create dedicated test order and payment
    const aarav = await prisma.user.findUnique({ where: { email: "aarav@example.com" } });
    const orderId = `ORD-P6-${Date.now()}`;
    testPaymentTxnId = `TXN-P6-${Date.now()}`;
    testTicketId = `RIT-2026-999${Math.floor(100 + Math.random() * 800)}`;

    await prisma.$transaction(async (tx) => {
      await tx.order.create({
        data: {
          id: orderId,
          customerId: aarav!.id,
          status: OrderStatus.DELIVERED,
          deliveryStatus: "DELIVERED",
          totalMinor: testAmountMinor,
          shippingAddress: { city: "Bengaluru", pincode: "560038" },
          items: {
            create: {
              productId: "PROD-001",
              quantity: 1,
              unitPriceMinor: testAmountMinor,
            },
          },
        },
      });

      await tx.payment.create({
        data: {
          id: `PAY-P6-${Date.now()}`,
          orderId,
          transactionId: testPaymentTxnId,
          method: PaymentMethod.UPI,
          status: PaymentStatus.PAID,
          amountMinor: testAmountMinor,
          paidAt: new Date(),
        },
      });

      const orderItem = await tx.orderItem.findFirst({ where: { orderId } });

      await tx.refundTicket.create({
        data: {
          id: testTicketId,
          customerId: aarav!.id,
          orderId,
          orderItemId: orderItem!.id,
          productId: "PROD-001",
          transactionId: testPaymentTxnId,
          reason: "PRODUCT_DAMAGED",
          description: "Testing phase 6 concurrency",
          requestedAction: "FULL_REFUND",
          requestedAmountMinor: testAmountMinor,
          status: TicketStatus.APPROVED,
          policySnapshot: {},
        },
      });
    });
  });

  it("Two parallel calls to /api/payments/refund with the same key create exactly one refund_transactions row", async () => {
    const key = `idem-key-same-${Date.now()}`;

    const [res1, res2] = await Promise.all([
      executeRefundTransaction({
        transaction_id: testPaymentTxnId,
        amount_minor: 100000,
        ticket_id: testTicketId,
        idempotency_key: key,
      }),
      executeRefundTransaction({
        transaction_id: testPaymentTxnId,
        amount_minor: 100000,
        ticket_id: testTicketId,
        idempotency_key: key,
      }),
    ]);

    expect(res1.refund.refund_id).toBe(res2.refund.refund_id);

    const rows = await prisma.refundTransaction.findMany({
      where: { idempotencyKey: key },
    });
    expect(rows.length).toBe(1);
  });

  it("Same ticket, different key, while the first is SUCCESS -> 409 DUPLICATE_REFUND", async () => {
    const differentKey = `idem-key-diff-${Date.now()}`;

    await expect(
      executeRefundTransaction({
        transaction_id: testPaymentTxnId,
        amount_minor: 50000,
        ticket_id: testTicketId,
        idempotency_key: differentKey,
      })
    ).rejects.toMatchObject({
      status: 409,
      code: "DUPLICATE_REFUND",
    });
  });

  it("Two concurrent refunds that together exceed the payment amount -> one succeeds, one 422", async () => {
    // Create new payment with exact balance 100,000 minor
    const aarav = await prisma.user.findUnique({ where: { email: "aarav@example.com" } });
    const orderId = `ORD-EXCEED-${Date.now()}`;
    const txnId = `TXN-EXCEED-${Date.now()}`;
    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    const ticketA = `RIT-2026-9${randSuffix}1`;
    const ticketB = `RIT-2026-9${randSuffix}2`;

    await prisma.refundTransaction.deleteMany({ where: { ticketId: { in: [ticketA, ticketB] } } });
    await prisma.auditEvent.deleteMany({ where: { entityId: { in: [ticketA, ticketB] } } });
    await prisma.refundTicket.deleteMany({ where: { id: { in: [ticketA, ticketB] } } });

    await prisma.$transaction(async (tx) => {
      await tx.order.create({
        data: {
          id: orderId,
          customerId: aarav!.id,
          status: OrderStatus.DELIVERED,
          totalMinor: 100000,
          shippingAddress: {},
          items: {
            create: { productId: "PROD-001", quantity: 1, unitPriceMinor: 100000 },
          },
        },
      });

      await tx.payment.create({
        data: {
          id: `PAY-EX-${Date.now()}`,
          orderId,
          transactionId: txnId,
          method: PaymentMethod.UPI,
          status: PaymentStatus.PAID,
          amountMinor: 100000,
        },
      });

      const itm = await tx.orderItem.findFirst({ where: { orderId } });

      await tx.refundTicket.create({
        data: {
          id: ticketA,
          customerId: aarav!.id,
          orderId,
          orderItemId: itm!.id,
          productId: "PROD-001",
          transactionId: txnId,
          reason: "PRODUCT_DAMAGED",
          description: "ticket A",
          requestedAction: "FULL_REFUND",
          requestedAmountMinor: 70000,
          status: TicketStatus.APPROVED,
          policySnapshot: {},
        },
      });

      await tx.refundTicket.create({
        data: {
          id: ticketB,
          customerId: aarav!.id,
          orderId,
          orderItemId: itm!.id,
          productId: "PROD-001",
          transactionId: txnId,
          reason: "PRODUCT_DAMAGED",
          description: "ticket B",
          requestedAction: "FULL_REFUND",
          requestedAmountMinor: 70000,
          status: TicketStatus.APPROVED,
          policySnapshot: {},
        },
      });
    });

    const results = await Promise.allSettled([
      executeRefundTransaction({
        transaction_id: txnId,
        amount_minor: 70000,
        ticket_id: ticketA,
        idempotency_key: `key-A-${Date.now()}`,
      }),
      executeRefundTransaction({
        transaction_id: txnId,
        amount_minor: 70000,
        ticket_id: ticketB,
        idempotency_key: `key-B-${Date.now()}`,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const rejError: any = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejError.status).toBe(422);
    expect(rejError.code).toBe("AMOUNT_EXCEEDS_REFUNDABLE");
  });

  it("Illegal transition (e.g. REFUNDED -> APPROVED) throws IllegalTransitionError / 409", () => {
    expect(() => assertValidTransition(TicketStatus.REFUNDED, TicketStatus.APPROVED)).toThrow(
      IllegalTransitionError
    );
  });
});
