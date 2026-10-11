import { NextResponse } from "next/server";
import { getCurrentSession } from "@/server/auth/session";

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
  const ritosKey = process.env.RITOS_API_KEY || "test-ritos-api-key";

  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    if (token === ritosKey) {
      return { isRitos: true, user: null, error: null };
    }
    return { isRitos: false, user: null, error: errorResponse("UNAUTHORIZED", "Invalid RITOS API key", 401) };
  }

  // Fallback to session auth
  const session = await getCurrentSession();
  if (session && session.userId && session.role) {
    if (allowedRoles.length > 0 && !allowedRoles.includes(session.role)) {
      return {
        isRitos: false,
        user: { id: session.userId, role: session.role, email: session.email },
        error: errorResponse("FORBIDDEN", "Insufficient permissions", 403),
      };
    }
    return {
      isRitos: false,
      user: { id: session.userId, role: session.role, email: session.email },
      error: null,
    };
  }

  return { isRitos: false, user: null, error: errorResponse("UNAUTHORIZED", "Authentication required", 401) };
}

export function requireRitosAuth(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const ritosKey = process.env.RITOS_API_KEY || "test-ritos-api-key";

  if (!authHeader.startsWith("Bearer ")) {
    return { error: errorResponse("UNAUTHORIZED", "Missing Bearer token", 401) };
  }

  const token = authHeader.substring(7).trim();
  if (token !== ritosKey) {
    return { error: errorResponse("UNAUTHORIZED", "Invalid RITOS API key", 401) };
  }

  return { error: null };
}
