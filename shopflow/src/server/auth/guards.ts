import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "./session";
import { UserRole } from "@prisma/client";

export function errorResponse(code: string, message: string, status = 400, details = {}) {
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

export async function requireAuth(allowedRoles?: UserRole[]) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return {
      user: null,
      error: errorResponse("UNAUTHORIZED", "Authentication required", 401),
    };
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return {
      user: null,
      error: errorResponse("FORBIDDEN", "You do not have access to this resource", 403),
    };
  }

  return { user, error: null };
}
