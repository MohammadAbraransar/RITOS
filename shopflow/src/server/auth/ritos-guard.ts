import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/server/auth/session";
import { config } from "@/server/config";
import { timingSafeEqual } from "crypto";

function keyMatches(token: string, key: string): boolean {
  const a = Buffer.from(token);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function errorResponse(code: string, message: string, status: number = 400, details: any = {}) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        details,
      },
    },
    { status }
  );
}

export async function authenticateRitosOrSession(req: Request, allowedRoles: string[] = ["ADMIN", "SUPPORT_ANALYST"]) {
  const authHeader = req.headers.get("authorization") || "";
  const ritosKey = config.ritosApiKey;

  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    if (keyMatches(token, ritosKey)) {
      return { isRitos: true, user: null, error: null };
    }
    return { isRitos: false, user: null, error: errorResponse("UNAUTHORIZED", "Invalid RITOS API key", 401) };
  }

  // Otherwise a signed-in staff user, validated against the live DB session (never the cookie alone)
  const user = await getAuthenticatedUser();
  if (user) {
    const identity = { id: user.id, role: user.role, email: user.email };
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      return { isRitos: false, user: identity, error: errorResponse("FORBIDDEN", "Insufficient permissions", 403) };
    }
    return { isRitos: false, user: identity, error: null };
  }

  return { isRitos: false, user: null, error: errorResponse("UNAUTHORIZED", "Authentication required", 401) };
}

export function requireRitosAuth(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const ritosKey = config.ritosApiKey;

  if (!authHeader.startsWith("Bearer ")) {
    return { error: errorResponse("UNAUTHORIZED", "Missing Bearer token", 401) };
  }

  const token = authHeader.substring(7).trim();
  if (!keyMatches(token, ritosKey)) {
    return { error: errorResponse("UNAUTHORIZED", "Invalid RITOS API key", 401) };
  }

  return { error: null };
}
