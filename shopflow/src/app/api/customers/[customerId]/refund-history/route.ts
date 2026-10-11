import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRitosOrSession, errorResponse } from "@/server/auth/ritos-guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { customerId: string } }) {
  const { isRitos, user, error } = await authenticateRitosOrSession(req, ["ADMIN", "SUPPORT_ANALYST", "CUSTOMER"]);
  if (error) return error;

  if (!isRitos && user && user.role === "CUSTOMER" && params.customerId !== user.id) {
    return errorResponse("FORBIDDEN", "Forbidden", 403);
  }

  try {
    const tickets = await prisma.refundTicket.findMany({
      where: { customerId: params.customerId },
      include: {
        refundTransactions: { where: { status: "SUCCESS" } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      customer_id: params.customerId,
      refund_history: tickets.map((t) => ({
        ticket_id: t.id,
        order_id: t.orderId,
        product_id: t.productId,
        status: t.status,
        reason: t.reason,
        refunded_amount_minor: t.refundTransactions.reduce((s, r) => s + r.amountMinor, 0),
        created_at: t.createdAt.toISOString(),
      })),
    });
  } catch (err: any) {
    return errorResponse("INTERNAL", err.message, 500);
  }
}
