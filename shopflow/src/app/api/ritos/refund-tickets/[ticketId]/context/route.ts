import { NextResponse } from "next/server";
import { authenticateRitosOrSession, errorResponse } from "@/server/auth/ritos-guard";
import { buildRefundContext } from "@/server/ritos/context-builder";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { ticketId: string } }) {
  const auth = await authenticateRitosOrSession(req, ["ADMIN", "SUPPORT_ANALYST"]);
  if (auth.error) return auth.error;

  try {
    const context = await buildRefundContext(params.ticketId);
    if (!context) {
      return errorResponse("NOT_FOUND", `No ticket ${params.ticketId}`, 404);
    }

    return NextResponse.json(context);
  } catch (err: any) {
    return errorResponse("INTERNAL", err.message || "Failed to generate context", 500);
  }
}
