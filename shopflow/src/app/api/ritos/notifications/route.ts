import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireRitosAuth, errorResponse } from "@/server/auth/ritos-guard";
import { NotificationChannel } from "@prisma/client";

export const dynamic = "force-dynamic";

const NotificationSchema = z.object({
  ticket_id: z.string(),
  title: z.string().min(1),
  body: z.string().min(1),
  channel: z.enum(["IN_APP", "EMAIL_MOCK"]).default("IN_APP"),
});

export async function POST(req: Request) {
  const { error } = requireRitosAuth(req);
  if (error) return error;

  const body = await req.json();
  const parsed = NotificationSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid notification parameters", 422, parsed.error.format());
  }

  const { ticket_id, title, body: msgBody, channel } = parsed.data;

  try {
    const ticket = await prisma.refundTicket.findUnique({
      where: { id: ticket_id },
    });

    if (!ticket) {
      return errorResponse("NOT_FOUND", `Ticket ${ticket_id} not found`, 404);
    }

    const [notif] = await prisma.$transaction([
      prisma.notification.create({
        data: {
          userId: ticket.customerId,
          ticketId: ticket.id,
          title,
          body: msgBody,
          channel: channel as NotificationChannel,
        },
      }),
      // Also on the ticket timeline, so the customer sees what RITOS asked for (e.g. a photo) where they track the claim.
      prisma.auditEvent.create({
        data: { entityType: "REFUND_TICKET", entityId: ticket.id, event: "RITOS_MESSAGE", actor: "RITOS", payload: { title, body: msgBody } },
      }),
    ]);

    return NextResponse.json({
      id: notif.id,
      ticket_id: ticket.id,
      channel: notif.channel,
      status: "DELIVERED",
    }, { status: 201 });
  } catch (err: any) {
    return errorResponse("INTERNAL", err.message, 500);
  }
}
