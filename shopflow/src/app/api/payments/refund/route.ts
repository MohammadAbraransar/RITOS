import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireRitosAuth, errorResponse } from "@/server/auth/ritos-guard";
import { checkIdempotency, storeIdempotency } from "@/server/ritos/idempotency";
import { executeRefundTransaction } from "@/server/services/refund-execution.service";

export const dynamic = "force-dynamic";

const RefundRequestSchema = z.object({
  transaction_id: z.string(),
  amount_minor: z.number().int().positive(),
  ticket_id: z.string(),
});

export async function POST(req: Request) {
  const { error } = requireRitosAuth(req);
  if (error) return error;

  const idempotencyKey = req.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return errorResponse("VALIDATION_ERROR", "Missing Idempotency-Key header", 400);
  }

  const body = await req.json();
  const parsed = RefundRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid parameters", 422, parsed.error.format());
  }

  const data = parsed.data;

  // 1. Check idempotency
  const idemp = await checkIdempotency(idempotencyKey, "/api/payments/refund", data);
  if (idemp.error) {
    return errorResponse(idemp.error.code, idemp.error.message, idemp.error.status);
  }
  if (idemp.isReplay) {
    return NextResponse.json(idemp.responseBody, {
      status: idemp.statusCode,
      headers: { "Idempotent-Replayed": "true" },
    });
  }

  try {
    const result = await executeRefundTransaction({
      transaction_id: data.transaction_id,
      amount_minor: data.amount_minor,
      ticket_id: data.ticket_id,
      idempotency_key: idempotencyKey,
    });

    await storeIdempotency(
      idempotencyKey,
      "/api/payments/refund",
      idemp.bodyHash!,
      200,
      result.refund
    );

    return NextResponse.json(result.refund, {
      headers: result.isReplay ? { "Idempotent-Replayed": "true" } : {},
    });
  } catch (err: any) {
    if (err.status && err.code) {
      return errorResponse(err.code, err.message, err.status, err.details);
    }
    return errorResponse("INTERNAL", err.message || "Failed to execute refund", 500);
  }
}
