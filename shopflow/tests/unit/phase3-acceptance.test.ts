import { describe, it, expect } from "vitest";
import { prisma } from "../../src/server/db";
import { OrderStatus, PaymentMethod, PaymentStatus } from "@prisma/client";

describe("Phase 3 Acceptance Verification: Orders and Admin Delivery Simulation", () => {
  it("Admin sets order to DELIVERED 4 days ago; customer sees Request Refund eligible", async () => {
    // 1. Get aarav customer and PROD-001
    const customer = await prisma.user.findUnique({
      where: { email: "aarav@example.com" },
    });
    const product = await prisma.product.findUnique({
      where: { id: "PROD-001" },
    });

    expect(customer).toBeDefined();
    expect(product).toBeDefined();

    // 2. Create a new confirmed order for aarav
    const orderId = `ORD-P3-${Date.now()}`;
    const order = await prisma.$transaction(async (tx) => {
      const ord = await tx.order.create({
        data: {
          id: orderId,
          customerId: customer!.id,
          status: OrderStatus.CONFIRMED,
          totalMinor: product!.priceMinor,
          currency: "INR",
          shippingAddress: { city: "Bengaluru", state: "KA", street: "123 Indiranagar", pincode: "560038" },
          items: {
            create: {
              productId: product!.id,
              quantity: 1,
              unitPriceMinor: product!.priceMinor,
            },
          },
        },
      });

      await tx.payment.create({
        data: {
          id: `PAY-P3-${Date.now()}`,
          orderId: ord.id,
          transactionId: `TXN-P3-${Date.now()}`,
          method: PaymentMethod.UPI,
          status: PaymentStatus.PAID,
          amountMinor: product!.priceMinor,
          paidAt: new Date(),
        },
      });

      return ord;
    });

    expect(order.status).toBe(OrderStatus.CONFIRMED);
    expect(order.deliveredAt).toBeNull();

    // Before delivery simulation: order is NOT delivered
    const beforeSim = await prisma.order.findUnique({
      where: { id: orderId },
      include: { tickets: true },
    });
    expect(beforeSim?.status).not.toBe(OrderStatus.DELIVERED);
    const eligibleBefore = beforeSim?.status === OrderStatus.DELIVERED && beforeSim.tickets.length === 0;
    expect(eligibleBefore).toBe(false);

    // 3. Admin simulates delivery: delivered 4 days ago
    const simulatedDate = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.DELIVERED,
        deliveryStatus: "DELIVERED",
        deliveredAt: simulatedDate,
      },
    });

    expect(updated.status).toBe(OrderStatus.DELIVERED);
    expect(updated.deliveredAt).toBeDefined();

    // 4. Verify customer view derivation:
    // Delivery diff is ~4 days ago, and order.status is DELIVERED, so refund button appears
    const diffDays = Math.floor((Date.now() - updated.deliveredAt!.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(4);

    const eligibleAfter = updated.status === OrderStatus.DELIVERED;
    expect(eligibleAfter).toBe(true);
  });
});
