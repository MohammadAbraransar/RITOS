import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function verify() {
  const products = await prisma.product.count();
  const policies = await prisma.refundPolicy.count();
  const customers = await prisma.user.count({ where: { role: "CUSTOMER" } });
  const staff = await prisma.user.count({
    where: { role: { in: ["SUPPORT_ANALYST", "ADMIN"] } },
  });
  const orders = await prisma.order.count();
  const payments = await prisma.payment.count();
  const tickets = await prisma.refundTicket.findMany({
    select: { id: true, status: true, customerId: true, productId: true },
    orderBy: { id: "asc" },
  });
  const decisions = await prisma.refundDecision.count();
  const audits = await prisma.auditEvent.count();
  const outbox = await prisma.integrationEvent.count();
  const refundTxs = await prisma.refundTransaction.count();
  const seqRes = await prisma.$queryRawUnsafe<{ next_preview: string }[]>(
    "SELECT 'RIT-2026-' || LPAD((last_value + 1)::text, 6, '0') as next_preview FROM refund_ticket_seq;"
  );

  console.log(
    JSON.stringify(
      {
        products,
        policies,
        customers,
        staff,
        orders,
        payments,
        ticketCount: tickets.length,
        decisions,
        audits,
        outbox,
        refundTxs,
        nextTicketPreview: seqRes[0]?.next_preview,
        tickets: tickets.map((t) => ({
          id: t.id,
          status: t.status,
          customerId: t.customerId,
          productId: t.productId,
        })),
      },
      null,
      2
    )
  );
}

verify()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
