import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireAuth, errorResponse } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { user, error } = await requireAuth(["ADMIN", "SUPPORT_ANALYST"]);
  if (error || !user) return error;

  const { searchParams } = new URL(req.url);
  const ticketId = searchParams.get("ticketId");

  try {
    const exchanges = await prisma.ritosExchange.findMany({
      where: ticketId ? { ticketId } : undefined,
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const outboxEvents = await prisma.integrationEvent.findMany({
      where: ticketId ? { ticketId } : undefined,
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({
      exchanges: exchanges.map((ex) => ({
        id: ex.id,
        ticket_id: ex.ticketId,
        direction: ex.direction,
        endpoint: ex.endpoint,
        request: ex.request,
        response: ex.response,
        http_status: ex.httpStatus,
        latency_ms: ex.latencyMs,
        created_at: ex.createdAt.toISOString(),
      })),
      outbox_events: outboxEvents.map((oe) => ({
        id: oe.id,
        event_type: oe.eventType,
        ticket_id: oe.ticketId,
        status: oe.status,
        attempts: oe.attempts,
        last_error: oe.lastError,
        payload: oe.payload,
        created_at: oe.createdAt.toISOString(),
        sent_at: oe.sentAt ? oe.sentAt.toISOString() : null,
      })),
    });
  } catch (err: any) {
    return errorResponse("INTERNAL", err.message, 500);
  }
}
