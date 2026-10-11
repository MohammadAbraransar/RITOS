import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireAuth, errorResponse } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { user, error } = await requireAuth(["ADMIN", "SUPPORT_ANALYST"]);
  if (error || !user) return error;

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status");

  try {
    const orders = await prisma.order.findMany({
      where: statusFilter ? { status: statusFilter as any } : undefined,
      include: {
        customer: {
          select: { id: true, name: true, email: true },
        },
        items: {
          include: {
            product: {
              select: { id: true, name: true, sku: true },
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
          },
        },
      },
      orderBy: { orderedAt: "desc" },
    });

    return NextResponse.json({
      orders: orders.map((o) => ({
        id: o.id,
        order_number: o.id,
        customer: o.customer,
        status: o.status,
        delivery_status: o.deliveryStatus,
        ordered_at: o.orderedAt.toISOString(),
        delivered_at: o.deliveredAt ? o.deliveredAt.toISOString() : null,
        total_minor: o.totalMinor,
        currency: o.currency,
        items_count: o.items.reduce((sum, it) => sum + it.quantity, 0),
        items_summary: o.items.map((it) => `${it.product.name} (x${it.quantity})`).join(", "),
        payment: o.payment,
        tickets: o.tickets,
      })),
    });
  } catch (err: any) {
    return errorResponse("SERVER_ERROR", err.message || "Failed to fetch admin orders", 500);
  }
}
