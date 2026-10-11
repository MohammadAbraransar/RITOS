import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/server/auth/session";
import { errorResponse } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return errorResponse("UNAUTHORIZED", "Not logged in", 401);
  }

  // Whitelist output schema: never return riskMetadata or passwordHash
  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    created_at: user.createdAt.toISOString(),
  });
}
