import { prisma } from "@/server/db";
import { buildRefundContext } from "@/server/ritos/context-builder";
import { mockDecide } from "@/server/mock-ritos/mock-decide";

export async function processOutboxBatch(limit = 10) {
  const pendingEvents = await prisma.integrationEvent.findMany({
    where: { status: "PENDING" },
    take: limit,
    orderBy: { createdAt: "asc" },
  });

  const results: Array<{ id: string; status: string; error?: string }> = [];

  const handle = async (event: (typeof pendingEvents)[number]) => {
    try {
      if (process.env.MOCK_RITOS === "true") {
        // Direct mock dispatch
        if (event.eventType === "refund.ticket.created") {
          const context = await buildRefundContext(event.ticketId);
          if (context) {
            const decision = mockDecide(context);

            const baseUrl = process.env.SHOPFLOW_BASE_URL || "http://localhost:3000";
            const apiKey = process.env.RITOS_API_KEY || "ritos_dev_key_secret_2026";

            const res = await fetch(`${baseUrl}/api/ritos/refund-decision`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
                "Idempotency-Key": `mock-decision-${event.id}`,
              },
              body: JSON.stringify(decision),
            });

            if (!res.ok) {
              const text = await res.text();
              throw new Error(`Mock decision callback failed: ${res.status} ${text}`);
            }
          }
        }

        await prisma.integrationEvent.update({
          where: { id: event.id },
          data: { status: "SENT", sentAt: new Date(), attempts: event.attempts + 1 },
        });

        results.push({ id: event.id, status: "SENT" });
      } else {
        // Real RITOS Webhook posting
        const baseUrl = process.env.RITOS_BASE_URL || "http://127.0.0.1:8000";
        const webhookUrl = `${baseUrl}/webhook/refund-tickets`;
        const apiKey = process.env.RITOS_API_KEY || "ritos_dev_key_secret_2026";

        const webhookPayload = {
          event_id: event.id,
          event_type: event.eventType,
          timestamp: event.createdAt.toISOString(),
          ticket_id: event.ticketId,
          status: "PENDING_RITOS",
          ...(event.payload as Record<string, any> || {})
        };

        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(webhookPayload),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`RITOS webhook failed: ${res.status} ${text}`);
        }

        await prisma.integrationEvent.update({
          where: { id: event.id },
          data: { status: "SENT", sentAt: new Date(), attempts: event.attempts + 1 },
        });

        results.push({ id: event.id, status: "SENT" });
      }
    } catch (err: any) {
      await prisma.integrationEvent.update({
        where: { id: event.id },
        data: {
          status: event.attempts >= 4 ? "FAILED" : "PENDING",
          attempts: event.attempts + 1,
          lastError: err.message || "Failed to dispatch outbox event",
        },
      });
      results.push({ id: event.id, status: "RETRY", error: err.message });
    }
  };

  // Different tickets are delivered in parallel; events of the same ticket stay in creation order.
  const byTicket = new Map<string, typeof pendingEvents>();
  for (const event of pendingEvents) {
    byTicket.set(event.ticketId, [...(byTicket.get(event.ticketId) || []), event]);
  }
  await Promise.all(
    Array.from(byTicket.values()).map(async (events) => {
      for (const event of events) await handle(event);
    })
  );

  return results;
}
