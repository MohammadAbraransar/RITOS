import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireRitosAuth, errorResponse } from "@/server/auth/ritos-guard";
import { storage } from "@/server/storage/evidence-storage";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { evidenceId: string } }) {
  const { error } = requireRitosAuth(req);
  if (error) return error;

  try {
    const evidence = await prisma.refundEvidence.findUnique({
      where: { id: params.evidenceId },
    });

    if (!evidence) {
      return errorResponse("NOT_FOUND", "Evidence not found", 404);
    }

    const buffer = await storage.get(evidence.storedPath);

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": evidence.mime,
        "Content-Disposition": `inline; filename="${evidence.filename}"`,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (err: any) {
    return errorResponse("INTERNAL", err.message || "Failed to download evidence", 500);
  }
}
