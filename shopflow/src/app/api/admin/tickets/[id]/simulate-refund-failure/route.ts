import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireAuth, errorResponse } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(["ADMIN", "SUPPORT_ANALYST"]);
  if (error || !user) return error;

  try {
    const ticket = await prisma.refundTicket.findUnique({
      where: { id: params.id },
    });

    if (!ticket) {
      return errorResponse("NOT_FOUND", `Ticket ${params.id} not found`, 404);
    }

    const updated = await prisma.refundTicket.update({
      where: { id: params.id },
      data: {
        simulateRefundFailure: !ticket.simulateRefundFailure,
      },
    });

    return NextResponse.json({
      success: true,
      ticket_id: updated.id,
      simulate_refund_failure: updated.simulateRefundFailure,
      message: `Simulate refund failure set to ${updated.simulateRefundFailure}`,
    });
  } catch (err: any) {
    return errorResponse("INTERNAL", err.message, 500);
  }
}
