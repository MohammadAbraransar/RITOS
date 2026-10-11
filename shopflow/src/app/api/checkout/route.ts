import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireAuth, errorResponse } from "@/server/auth/guards";
import { processMockPayment } from "@/server/mock-pay/payment-provider";
import { getCart, clearCart } from "@/server/services/cart.service";
import { OrderStatus, PaymentStatus, PaymentMethod } from "@prisma/client";

const CheckoutSchema = z.object({
  payment_method: z.enum(["UPI", "CARD", "NETBANKING", "COD"]),
  payment_identifier: z.string().optional(),
  shipping_address: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    pincode: z.string().min(1),
  }),
});

export async function POST(req: Request) {
  const { user, error } = await requireAuth(["CUSTOMER", "ADMIN"]);
  if (error || !user) return error;

  const body = await req.json();
  const parsed = CheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid checkout parameters", 422, parsed.error.format());
  }

  const { payment_method, payment_identifier, shipping_address } = parsed.data;
  const items = await getCart();
  if (items.length === 0) {
    return errorResponse("VALIDATION_ERROR", "Cart is empty", 422);
  }

  const totalMinor = items.reduce((sum, item) => sum + item.priceMinor * item.quantity, 0);

  // 1. Process payment with mock provider
  const payResult = processMockPayment({
    amountMinor: totalMinor,
    method: payment_method as PaymentMethod,
    paymentIdentifier: payment_identifier,
  });

  const orderNumber = Math.floor(10000 + Math.random() * 90000);
  const orderId = `ORD-${orderNumber}`;

  // 2. Failure path: payment declined (e.g. fail@mock)
  if (!payResult.success) {
    // Record failed payment and cancelled order
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          id: orderId,
          customerId: user.id,
          status: OrderStatus.CANCELLED,
          totalMinor,
          currency: "INR",
          shippingAddress: shipping_address,
          orderedAt: new Date(),
          deliveryStatus: "CANCELLED_PAYMENT_FAILED",
        },
      });

      await tx.payment.create({
        data: {
          id: `PAY-${payResult.transactionId.replace("TXN-", "")}`,
          orderId: order.id,
          transactionId: payResult.transactionId,
          method: payment_method as PaymentMethod,
          status: PaymentStatus.FAILED,
          amountMinor: totalMinor,
          paidAt: null,
        },
      });
    });

    return errorResponse(
      "PAYMENT_FAILED",
      payResult.failureReason || "Payment was declined by the provider",
      400,
      { transaction_id: payResult.transactionId }
    );
  }

  // 3. Success path: create order, order items, and payment in a transaction
  const createdOrder = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        id: orderId,
        customerId: user.id,
        status: OrderStatus.CONFIRMED,
        totalMinor,
        currency: "INR",
        shippingAddress: shipping_address,
        orderedAt: new Date(),
        deliveryStatus: "PROCESSING",
      },
    });

    for (const item of items) {
      await tx.orderItem.create({
        data: {
          orderId: order.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPriceMinor: item.priceMinor,
        },
      });

      // Reduce stock
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }

    const payment = await tx.payment.create({
      data: {
        id: `PAY-${payResult.transactionId.replace("TXN-", "")}`,
        orderId: order.id,
        transactionId: payResult.transactionId,
        method: payment_method as PaymentMethod,
        status: PaymentStatus.PAID,
        amountMinor: totalMinor,
        paidAt: new Date(),
      },
    });

    return { order, payment };
  });

  // 4. Clear cart on success
  await clearCart();

  return NextResponse.json({
    order_id: createdOrder.order.id,
    status: createdOrder.order.status,
    total_minor: createdOrder.order.totalMinor,
    currency: createdOrder.order.currency,
    transaction_id: createdOrder.payment.transactionId,
    payment_status: createdOrder.payment.status,
    ordered_at: createdOrder.order.orderedAt.toISOString(),
  });
}
