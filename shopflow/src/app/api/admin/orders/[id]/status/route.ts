import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireAuth, errorResponse } from "@/server/auth/guards";
import { OrderStatus } from "@prisma/client";

const UpdateStatusSchema = z.object({
  status: z.enum([
    "PENDING",
    "CONFIRMED",
    "PROCESSING",
    "SHIPPED",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "CANCELLED",
  ]),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(["ADMIN", "SUPPORT_ANALYST"]);
  if (error || !user) return error;

  const body = await req.json();
  const parsed = UpdateStatusSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid order status", 422, parsed.error.format());
  }

  const { status } = parsed.data;

  try {
    const existing = await prisma.order.findUnique({
      where: { id: params.id },
    });
    if (!existing) {
      return errorResponse("NOT_FOUND", "Order not found", 404);
    }

    const updated = await prisma.order.update({
      where: { id: params.id },
      data: {
        status: status as OrderStatus,
        deliveryStatus: status === "DELIVERED" ? "DELIVERED" : status,
        deliveredAt: status === "DELIVERED" ? (existing.deliveredAt || new Date()) : null,
      },
    });

    return NextResponse.json({
      success: true,
      order: {
        id: updated.id,
        status: updated.status,
        delivered_at: updated.deliveredAt ? updated.deliveredAt.toISOString() : null,
      },
    });
  } catch (err: any) {
    return errorResponse("SERVER_ERROR", err.message || "Failed to update order status", 500);
  }
}
