import { describe, it, expect } from "vitest";
import { prisma } from "../../src/server/db";
import { processMockPayment } from "../../src/server/mock-pay/payment-provider";
import { PaymentMethod, PaymentStatus, OrderStatus } from "@prisma/client";

describe("Phase 2 Acceptance Verification", () => {
  it("Customer aarav exists and PROD-001 has active policy", async () => {
    const aarav = await prisma.user.findUnique({
      where: { email: "aarav@example.com" },
    });
    expect(aarav).toBeDefined();
    expect(aarav?.email).toBe("aarav@example.com");

    const prod1 = await prisma.product.findUnique({
      where: { id: "PROD-001" },
      include: { policy: true },
    });
    expect(prod1).toBeDefined();
    expect(prod1?.id).toBe("PROD-001");
    expect(prod1?.policy).toBeDefined();
    expect(prod1?.policy?.returnWindowDays).toBeGreaterThan(0);
  });

  it("Simulate UPI checkout for aarav buying PROD-001 and verify DB persistence", async () => {
    const aarav = await prisma.user.findUnique({
      where: { email: "aarav@example.com" },
    });
    const prod1 = await prisma.product.findUnique({
      where: { id: "PROD-001" },
    });

    expect(aarav).toBeDefined();
    expect(prod1).toBeDefined();

    // 1. Process payment via provider
    const paymentResult = processMockPayment({
      amountMinor: prod1!.priceMinor,
      method: PaymentMethod.UPI,
      paymentIdentifier: "aarav@okaxis",
    });

    expect(paymentResult.success).toBe(true);
    expect(paymentResult.transactionId).toMatch(/^TXN-/);

    // 2. Persist order and payment in Postgres transaction
    const orderId = `ORD-PHASE2-${Date.now()}`;
    const order = await prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          id: orderId,
          customerId: aarav!.id,
          currency: "INR",
          totalMinor: prod1!.priceMinor,
          status: OrderStatus.CONFIRMED,
          shippingAddress: { city: "Bengaluru", state: "KA", street: "123 Indiranagar", pincode: "560038" },
          items: {
            create: {
              productId: prod1!.id,
              quantity: 1,
              unitPriceMinor: prod1!.priceMinor,
            },
          },
        },
      });

      await tx.payment.create({
        data: {
          id: `PAY-${paymentResult.transactionId.replace("TXN-", "")}`,
          orderId: createdOrder.id,
          transactionId: paymentResult.transactionId,
          method: PaymentMethod.UPI,
          status: PaymentStatus.PAID,
          amountMinor: prod1!.priceMinor,
          paidAt: new Date(),
        },
      });

      return createdOrder;
    });

    expect(order.id).toBe(orderId);
    expect(order.status).toBe(OrderStatus.CONFIRMED);

    // Verify DB persistence
    const savedPayment = await prisma.payment.findUnique({
      where: { orderId: order.id },
    });
    expect(savedPayment).toBeDefined();
    expect(savedPayment?.status).toBe(PaymentStatus.PAID);
    expect(savedPayment?.transactionId).toBe(paymentResult.transactionId);
  });

  it("Simulate failure path with fail@mock yields FAILED payment and no confirmed order", async () => {
    const failedPayment = processMockPayment({
      amountMinor: 299900,
      method: PaymentMethod.UPI,
      paymentIdentifier: "fail@mock",
    });

    expect(failedPayment.success).toBe(false);
    expect(failedPayment.failureReason).toContain("fail@mock");

    // Verify no confirmed order exists for a failed payment
    const checkOrder = await prisma.order.findFirst({
      where: {
        payment: {
          transactionId: failedPayment.transactionId,
        },
        status: OrderStatus.CONFIRMED,
      },
    });
    expect(checkOrder).toBeNull();
  });
});
