import { prisma } from "@/server/db";

export async function peekNextTicketId(tx?: any): Promise<string> {
  const client = tx || prisma;
  try {
    const res = (await client.$queryRawUnsafe(
      `SELECT last_value FROM refund_ticket_seq;`
    )) as Array<{ last_value: string | number }>;
    const seqVal = parseInt(String(res[0]?.last_value || 122), 10);
    return `RIT-2026-${String(seqVal + 1).padStart(6, "0")}`;
  } catch {
    return `RIT-2026-000123`;
  }
}

export async function getNextTicketId(tx?: any): Promise<string> {
  const client = tx || prisma;
  for (let i = 0; i < 100; i++) {
    let num = 123;
    try {
      const res = (await client.$queryRawUnsafe(
        `SELECT nextval('refund_ticket_seq')::text as next_val;`
      )) as Array<{ next_val: string }>;
      num = parseInt(res[0]?.next_val || "123", 10);
    } catch {
      num = 123 + i;
    }
    const candidate = `RIT-2026-${String(num).padStart(6, "0")}`;
    const exists = await client.refundTicket.findUnique({ where: { id: candidate } });
    if (!exists) {
      return candidate;
    }
  }
  return `RIT-2026-${String(Date.now()).slice(-6)}`;
}
