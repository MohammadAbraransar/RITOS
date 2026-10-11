import { prisma } from "@/server/db";
import crypto from "crypto";

export async function emitOutboxEvent(
  tx: any,
  eventType: string,
  ticketId: string,
  payloadData: Record<string, any> = {}
) {
  const eventId = `EVT-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const contextUrl = `${baseUrl}/api/ritos/refund-tickets/${ticketId}/context`;

  const payload = {
    event_id: eventId,
    event_type: eventType,
    occurred_at: new Date().toISOString(),
    ticket_id: ticketId,
    context_url: contextUrl,
    ...payloadData,
  };

  return tx.integrationEvent.create({
    data: {
      id: eventId,
      eventType,
      ticketId,
      payload,
      status: "PENDING",
      attempts: 0,
    },
  });
}
