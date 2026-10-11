import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRitosOrSession, errorResponse } from "@/server/auth/ritos-guard";
import { TicketStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await authenticateRitosOrSession(req, ["ADMIN", "SUPPORT_ANALYST"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status") || "PENDING_RITOS";
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const cursor = searchParams.get("cursor");

    const tickets = await prisma.refundTicket.findMany({
      where: {
        status: statusParam as TicketStatus,
      },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        customerId: true,
        orderId: true,
        productId: true,
        transactionId: true,
        reason: true,
        requestedAmountMinor: true,
        status: true,
        createdAt: true,
      },
    });

    let nextCursor: string | null = null;
    if (tickets.length > limit) {
      const nextItem = tickets.pop();
      nextCursor = nextItem ? nextItem.id : null;
    }

    return NextResponse.json({
      tickets: tickets.map((t) => ({
        ticket_id: t.id,
        customer_id: t.customerId,
        order_id: t.orderId,
        product_id: t.productId,
        transaction_id: t.transactionId,
        reason: t.reason,
        requested_amount_minor: t.requestedAmountMinor,
        status: t.status,
        created_at: t.createdAt.toISOString(),
      })),
      next_cursor: nextCursor,
    });
  } catch (err: any) {
    return errorResponse("INTERNAL", err.message, 500);
  }
}
