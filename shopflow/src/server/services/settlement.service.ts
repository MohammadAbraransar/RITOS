import { prisma } from "@/server/db";
import { RefundTxStatus } from "@prisma/client";
import { settleTicketRefund } from "@/server/state-machine/ticket-state-machine";

/**
 * Settle one refund whose payment provider has confirmed it (mock provider: settle_at has passed).
 * Safe to call from several places at once: only the caller that flips PENDING -> SUCCESS advances the ticket.
 */
export async function settleRefund(refundId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.refundTransaction.updateMany({
      where: { id: refundId, status: RefundTxStatus.PENDING, settleAt: { lte: new Date() } },
      data: { status: RefundTxStatus.SUCCESS },
    });
    if (claimed.count === 0) return false; // not due yet, or someone else settled it
    const refund = await tx.refundTransaction.findUniqueOrThrow({ where: { id: refundId } });
    await settleTicketRefund(tx, refund.ticketId, "SETTLEMENT_POLLER", {
      refund_id: refund.id,
      amount_minor: refund.amountMinor,
    });
    return true;
  });
}

/** Background job: settle every refund that is due, so tickets reach REFUNDED without anyone opening a page. */
export async function settleDueRefunds(limit: number): Promise<number> {
  const due = await prisma.refundTransaction.findMany({
    where: { status: RefundTxStatus.PENDING, settleAt: { lte: new Date() } },
    select: { id: true },
    orderBy: { settleAt: "asc" },
    take: limit,
  });
  let settled = 0;
  for (const r of due) {
    try {
      if (await settleRefund(r.id)) settled++;
    } catch (err: any) {
      console.warn(`[Settlement] refund ${r.id} could not be settled: ${err?.message || err}`);
    }
  }
  return settled;
}
