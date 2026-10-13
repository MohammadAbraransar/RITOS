import { prisma } from "@/server/db";
import { buildRefundContext } from "@/server/ritos/context-builder";
import { mockDecide } from "@/server/mock-ritos/mock-decide";
import { config } from "@/server/config";

// Earliest next attempt per failed event (exponential backoff). Kept in memory: after a restart, failed
// events are simply retried once straight away.
const nextAttemptAt = new Map<string, number>();

function backoffMs(attempts: number): number {
  return Math.min(config.outbox.maxBackoffMs, config.outbox.baseBackoffMs * 2 ** Math.max(0, attempts - 1));
}

export async function processOutboxBatch(limit = config.outbox.batchSize) {
  const now = Date.now();
  const pendingEvents = await prisma.integrationEvent.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });

  const results: Array<{ id: string; status: string; error?: string }> = [];

  const handle = async (event: (typeof pendingEvents)[number]) => {
    try {
      if (config.mockRitos) {
        // Direct mock dispatch
        if (event.eventType === "refund.ticket.created") {
          const context = await buildRefundContext(event.ticketId);
          if (context) {
            const decision = mockDecide(context);

            const res = await fetch(`${config.storeBaseUrl}/api/ritos/refund-decision`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.ritosApiKey}`,
                "Idempotency-Key": `mock-decision-${event.id}`,
              },
              body: JSON.stringify(decision),
              signal: AbortSignal.timeout(config.ritosRequestTimeoutMs),
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
        const webhookUrl = `${config.ritosBaseUrl}/webhook/refund-tickets`;

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
            Authorization: `Bearer ${config.ritosApiKey}`,
          },
          body: JSON.stringify(webhookPayload),
          signal: AbortSignal.timeout(config.ritosRequestTimeoutMs),
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
      nextAttemptAt.delete(event.id);
      return true;
    } catch (err: any) {
      const attempts = event.attempts + 1;
      const failed = attempts >= config.outbox.maxAttempts;
      await prisma.integrationEvent.update({
        where: { id: event.id },
        data: {
          status: failed ? "FAILED" : "PENDING",
          attempts,
          lastError: err.message || "Failed to dispatch outbox event",
        },
      });
      if (failed) nextAttemptAt.delete(event.id);
      else nextAttemptAt.set(event.id, Date.now() + backoffMs(attempts));
      results.push({ id: event.id, status: failed ? "FAILED" : "RETRY", error: err.message });
      return false;
    }
  };

  // Different tickets are delivered in parallel; events of the same ticket stay in creation order.
  // An event still backing off holds back the later events of its ticket.
  const byTicket = new Map<string, typeof pendingEvents>();
  const backingOff = new Set<string>();
  let selected = 0;
  for (const event of pendingEvents) {
    if (selected >= limit) break;
    if (backingOff.has(event.ticketId)) continue;
    if ((nextAttemptAt.get(event.id) ?? 0) > now) {
      backingOff.add(event.ticketId);
      continue;
    }
    byTicket.set(event.ticketId, [...(byTicket.get(event.ticketId) || []), event]);
    selected++;
  }
  await Promise.all(
    Array.from(byTicket.values()).map(async (events) => {
      for (const event of events) {
        if (!(await handle(event))) break; // keep per-ticket order behind a failure
      }
    })
  );

  return results;
}
