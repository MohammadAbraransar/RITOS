import { NextResponse } from "next/server";
import { authenticateRitosOrSession, errorResponse } from "@/server/auth/ritos-guard";
import { processOutboxBatch } from "@/server/outbox/processor";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { error } = await authenticateRitosOrSession(req, ["ADMIN", "SUPPORT_ANALYST"]);
  if (error) return error;

  try {
    const results = await processOutboxBatch(20);
    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    });
  } catch (err: any) {
    return errorResponse("INTERNAL", err.message || "Failed to process outbox", 500);
  }
}
