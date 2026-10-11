import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRitosOrSession, errorResponse } from "@/server/auth/ritos-guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { isRitos, user, error } = await authenticateRitosOrSession(req, ["ADMIN", "SUPPORT_ANALYST", "CUSTOMER"]);
  if (error) return error;

  try {
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: {
        items: true,
        payment: {
          include: { refundTransactions: true },
        },
        tickets: true,
      },
    });

    if (!order) {
      return errorResponse("NOT_FOUND", "Order not found", 404);
    }

    if (!isRitos && user && user.role === "CUSTOMER" && order.customerId !== user.id) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    return NextResponse.json({
      order_id: order.id,
      customer_id: order.customerId,
      status: order.status,
      delivery_status: order.deliveryStatus,
      ordered_at: order.orderedAt.toISOString(),
      delivered_at: order.deliveredAt ? order.deliveredAt.toISOString() : null,
      total_minor: order.totalMinor,
      currency: order.currency,
      items: order.items,
      payment: order.payment,
      tickets: order.tickets,
    });
  } catch (err: any) {
    return errorResponse("INTERNAL", err.message, 500);
  }
}
