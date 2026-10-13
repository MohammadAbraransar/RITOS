import { prisma } from "@/server/db";
import { qualified } from "@/server/db-schema";

// Ticket ids are RIT-<year>-<sequence>. If the sequence cannot be read the error propagates: a guessed id
// could collide with or impersonate another ticket.
const MAX_COLLISION_RETRIES = 100; // ids inserted outside the sequence (e.g. imports) are skipped
const ticketId = (seq: number) => `RIT-${new Date().getUTCFullYear()}-${String(seq).padStart(6, "0")}`;

export async function peekNextTicketId(tx?: any): Promise<string> {
  const client = tx || prisma;
  const res = (await client.$queryRawUnsafe(
    `SELECT last_value FROM ${qualified("refund_ticket_seq")};`
  )) as Array<{ last_value: string | number }>;
  return ticketId(parseInt(String(res[0].last_value), 10) + 1);
}

export async function getNextTicketId(tx?: any): Promise<string> {
  const client = tx || prisma;
  for (let i = 0; i < MAX_COLLISION_RETRIES; i++) {
    const res = (await client.$queryRawUnsafe(
      `SELECT nextval('${qualified("refund_ticket_seq")}')::text as next_val;`
    )) as Array<{ next_val: string }>;
    const candidate = ticketId(parseInt(res[0].next_val, 10));
    const exists = await client.refundTicket.findUnique({ where: { id: candidate } });
    if (!exists) return candidate;
  }
  throw new Error(`No free ticket id after ${MAX_COLLISION_RETRIES} sequence values`);
}
