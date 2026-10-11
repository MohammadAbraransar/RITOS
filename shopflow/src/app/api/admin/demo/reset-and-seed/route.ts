import { NextResponse } from "next/server";
import { requireAuth, errorResponse } from "@/server/auth/guards";
import { exec } from "child_process";
import util from "util";

const execPromise = util.promisify(exec);

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { user, error } = await requireAuth(["ADMIN"]);
  if (error || !user) return error;

  try {
    const { stdout, stderr } = await execPromise("npm run db:seed");
    return NextResponse.json({
      success: true,
      message: "Database truncated and seeded to initial demo state",
      output: stdout,
    });
  } catch (err: any) {
    return errorResponse("INTERNAL", err.message || "Failed to reset and seed database", 500);
  }
}
