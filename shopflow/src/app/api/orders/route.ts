import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireAuth, errorResponse } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { user, error } = await requireAuth(["CUSTOMER", "ADMIN", "SUPPORT_ANALYST"]);
  if (error || !user) return error;

  try {
    const orders = await prisma.order.findMany({
      where: { customerId: user.id },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                imageUrl: true,
                sku: true,
                policy: true,
              },
            },
          },
        },
        payment: {
          select: {
            transactionId: true,
            method: true,
            status: true,
            amountMinor: true,
          },
        },
        tickets: {
          select: {
            id: true,
            status: true,
            reason: true,
            requestedAmountMinor: true,
            createdAt: true,
          },
        },
      },
      orderBy: { orderedAt: "desc" },
    });

    return NextResponse.json({
      orders: orders.map((o) => ({
        id: o.id,
        order_number: o.id,
        status: o.status,
        delivery_status: o.deliveryStatus,
        ordered_at: o.orderedAt.toISOString(),
        delivered_at: o.deliveredAt ? o.deliveredAt.toISOString() : null,
        total_minor: o.totalMinor,
        currency: o.currency,
        items_count: o.items.reduce((s, it) => s + it.quantity, 0),
        items: o.items.map((it) => ({
          id: it.id,
          product_id: it.productId,
          product_name: it.product.name,
          product_sku: it.product.sku,
          image_url: it.product.imageUrl,
          quantity: it.quantity,
          unit_price_minor: it.unitPriceMinor,
          policy: it.product.policy
            ? {
                policy_type: it.product.policy.policyType,
                return_window_days: it.product.policy.returnWindowDays,
              }
            : null,
        })),
        payment: o.payment
          ? {
              transaction_id: o.payment.transactionId,
              method: o.payment.method,
              status: o.payment.status,
              amount_minor: o.payment.amountMinor,
            }
          : null,
        tickets: o.tickets.map((t) => ({
          id: t.id,
          ticket_number: t.id,
          status: t.status,
          reason: t.reason,
          requested_amount_minor: t.requestedAmountMinor,
          created_at: t.createdAt.toISOString(),
        })),
      })),
    });
  } catch (err: any) {
    // Never show another customer's or invented orders: report the outage.
    console.error("[Orders API] Database unavailable:", err?.message);
    return errorResponse("SERVICE_UNAVAILABLE", "Orders are temporarily unavailable, please retry", 503);
  }
}
