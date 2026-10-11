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
        items: { include: { product: { include: { policy: true } } } },
        payment: { include: { refundTransactions: true } },
        tickets: true,
      },
    });

    if (!order) {
      return errorResponse("NOT_FOUND", "Order not found", 404);
    }

    if (!isRitos && user && user.role === "CUSTOMER" && order.customerId !== user.id) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    let daysSinceDelivery: number | null = null;
    let withinReturnWindow = true;
    const policy = order.items[0]?.product?.policy;
    const returnWindowDays = policy?.returnWindowDays || 30;

    if (order.deliveredAt) {
      const diffMs = Date.now() - new Date(order.deliveredAt).getTime();
      daysSinceDelivery = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      withinReturnWindow = daysSinceDelivery <= returnWindowDays;
    }

    const totalPaid = order.payment?.amountMinor || order.totalMinor;
    const refunded = (order.payment?.refundTransactions || [])
      .filter((t) => t.status === "SUCCESS")
      .reduce((sum, t) => sum + t.amountMinor, 0);
    const remainingRefundableMinor = Math.max(0, totalPaid - refunded);

    // Returns facts only per docs 02 section 6
    return NextResponse.json({
      days_since_delivery: daysSinceDelivery,
      within_return_window: withinReturnWindow,
      policy_type: policy?.policyType || "FULL",
      evidence_required: (policy?.evidenceRequiredReasons || []).length > 0,
      remaining_refundable_minor: remainingRefundableMinor,
      existing_tickets: order.tickets.map((t) => ({
        ticket_id: t.id,
        status: t.status,
        reason: t.reason,
      })),
    });
  } catch (err: any) {
    return errorResponse("INTERNAL", err.message, 500);
  }
}
