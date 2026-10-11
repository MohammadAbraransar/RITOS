import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRitosOrSession, errorResponse } from "@/server/auth/ritos-guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { customerId: string } }) {
  const { isRitos, user, error } = await authenticateRitosOrSession(req, ["ADMIN", "SUPPORT_ANALYST", "CUSTOMER"]);
  if (error) return error;

  try {
    const customer = await prisma.user.findUnique({
      where: { id: params.customerId },
    });

    if (!customer) {
      return errorResponse("NOT_FOUND", "Customer not found", 404);
    }

    if (!isRitos && user && user.role === "CUSTOMER" && customer.id !== user.id) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    const orderCount = await prisma.order.count({ where: { customerId: customer.id } });
    const ticketCount = await prisma.refundTicket.count({ where: { customerId: customer.id } });

    const responseData: any = {
      customer_id: customer.id,
      name: customer.name,
      email: customer.email,
      created_at: customer.createdAt.toISOString(),
      lifetime_order_count: orderCount,
      refund_tickets_count: ticketCount,
    };

    // RITOS API key only receives risk_metadata
    if (isRitos) {
      responseData.risk_metadata = customer.riskMetadata || {};
    }

    return NextResponse.json(responseData);
  } catch (err: any) {
    return errorResponse("INTERNAL", err.message, 500);
  }
}
