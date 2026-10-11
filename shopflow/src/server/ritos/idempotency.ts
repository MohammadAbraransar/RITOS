import { prisma } from "@/server/db";
import crypto from "crypto";

export async function checkIdempotency(key: string, endpoint: string, body: any) {
  const bodyHash = crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");

  const existing = await prisma.idempotencyKey.findUnique({
    where: { key },
  });

  if (existing) {
    if (existing.scope !== endpoint || (existing.requestHash && existing.requestHash !== bodyHash)) {
      return {
        isReplay: false,
        error: {
          code: "IDEMPOTENCY_KEY_REUSED",
          message: "Idempotency key was previously used with a different request payload",
          status: 422,
        },
      };
    }

    const resp = existing.response as any;
    return {
      isReplay: true,
      statusCode: resp?.statusCode || 200,
      responseBody: resp?.body || resp,
    };
  }

  return { isReplay: false, bodyHash };
}

export async function storeIdempotency(
  key: string,
  endpoint: string,
  requestHash: string,
  statusCode: number,
  responseBody: any
) {
  return prisma.idempotencyKey.upsert({
    where: { key },
    create: {
      key,
      scope: endpoint,
      requestHash,
      response: { statusCode, body: responseBody },
    },
    update: {
      response: { statusCode, body: responseBody },
    },
  });
}
