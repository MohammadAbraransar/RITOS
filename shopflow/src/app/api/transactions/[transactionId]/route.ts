import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRitosOrSession, errorResponse } from "@/server/auth/ritos-guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { transactionId: string } }) {
  const { isRitos, user, error } = await authenticateRitosOrSession(req, ["ADMIN", "SUPPORT_ANALYST", "CUSTOMER"]);
  if (error) return error;

  try {
    const payment = await prisma.payment.findUnique({
      where: { transactionId: params.transactionId },
      include: {
        order: true,
        refundTransactions: true,
      },
    });

    if (!payment) {
      return errorResponse("NOT_FOUND", "Transaction not found", 404);
    }

    if (!isRitos && user && user.role === "CUSTOMER" && payment.order.customerId !== user.id) {
      return errorResponse("FORBIDDEN", "Forbidden", 403);
    }

    const alreadyRefundedMinor = payment.refundTransactions
      .filter((r) => r.status === "SUCCESS")
      .reduce((sum, r) => sum + r.amountMinor, 0);

    const inFlightMinor = payment.refundTransactions
      .filter((r) => ["PENDING", "PROCESSING"].includes(r.status))
      .reduce((sum, r) => sum + r.amountMinor, 0);

    const remainingRefundableMinor = Math.max(0, payment.amountMinor - alreadyRefundedMinor - inFlightMinor);

    return NextResponse.json({
      transaction_id: payment.transactionId,
      order_id: payment.orderId,
      method: payment.method,
      status: payment.status,
      amount_minor: payment.amountMinor,
      paid_at: payment.paidAt ? payment.paidAt.toISOString() : null,
      refund_ledger: {
        transaction_amount_minor: payment.amountMinor,
        already_refunded_minor: alreadyRefundedMinor,
        in_flight_minor: inFlightMinor,
        remaining_refundable_minor: remainingRefundableMinor,
      },
      refund_transactions: payment.refundTransactions.map((rt) => ({
        id: rt.id,
        amount_minor: rt.amountMinor,
        status: rt.status,
        idempotency_key: rt.idempotencyKey,
        settle_at: rt.settleAt ? rt.settleAt.toISOString() : null,
        created_at: rt.createdAt.toISOString(),
      })),
    });
  } catch (err: any) {
    return errorResponse("INTERNAL", err.message, 500);
  }
}
