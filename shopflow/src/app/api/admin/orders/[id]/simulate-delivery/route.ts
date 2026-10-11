import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireAuth, errorResponse } from "@/server/auth/guards";
import { OrderStatus } from "@prisma/client";

const SimulateDeliverySchema = z.object({
  days_ago: z.number().int().min(0).max(365).default(0),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(["ADMIN", "SUPPORT_ANALYST"]);
  if (error || !user) return error;

  const body = await req.json();
  const parsed = SimulateDeliverySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid days_ago parameter", 422, parsed.error.format());
  }

  const { days_ago } = parsed.data;

  try {
    const existing = await prisma.order.findUnique({
      where: { id: params.id },
    });
    if (!existing) {
      return errorResponse("NOT_FOUND", "Order not found", 404);
    }

    const simulatedDeliveredAt = new Date(Date.now() - days_ago * 24 * 60 * 60 * 1000);

    const updated = await prisma.order.update({
      where: { id: params.id },
      data: {
        status: OrderStatus.DELIVERED,
        deliveryStatus: "DELIVERED",
        deliveredAt: simulatedDeliveredAt,
      },
    });

    return NextResponse.json({
      success: true,
      order: {
        id: updated.id,
        status: updated.status,
        delivered_at: updated.deliveredAt?.toISOString(),
        days_ago,
      },
      message: `Order simulated as DELIVERED ${days_ago} days ago (${simulatedDeliveredAt.toLocaleDateString()})`,
    });
  } catch (err: any) {
    return errorResponse("SERVER_ERROR", err.message || "Failed to simulate delivery", 500);
  }
}
