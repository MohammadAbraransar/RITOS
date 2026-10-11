import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRitosOrSession, errorResponse } from "@/server/auth/ritos-guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { ticketId: string } }) {
  const { isRitos, user, error } = await authenticateRitosOrSession(req, ["ADMIN", "SUPPORT_ANALYST", "CUSTOMER"]);
  if (error) return error;

  try {
    const ticket = await prisma.refundTicket.findUnique({
      where: { id: params.ticketId },
      include: {
        product: true,
        order: true,
        evidence: true,
        decisions: true,
        refundTransactions: true,
      },
    });

    if (!ticket) {
      return errorResponse("NOT_FOUND", `Ticket ${params.ticketId} not found`, 404);
    }

    if (!isRitos && user && user.role === "CUSTOMER" && ticket.customerId !== user.id) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    return NextResponse.json({
      ticket_id: ticket.id,
      customer_id: ticket.customerId,
      order_id: ticket.orderId,
      product_id: ticket.productId,
      transaction_id: ticket.transactionId,
      status: ticket.status,
      reason: ticket.reason,
      description: ticket.description,
      requested_action: ticket.requestedAction,
      requested_amount_minor: ticket.requestedAmountMinor,
      created_at: ticket.createdAt.toISOString(),
      updated_at: ticket.updatedAt.toISOString(),
    });
  } catch (err: any) {
    return errorResponse("INTERNAL", err.message, 500);
  }
}
