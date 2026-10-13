import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { verifyPassword } from "@/server/auth/password";
import { createDbSession } from "@/server/auth/session";
import { errorResponse } from "@/server/auth/guards";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Invalid email or password format", 422, parsed.error.format());
    }

    const { email, password } = parsed.data;
    let user;
    try {
      user = await prisma.user.findUnique({ where: { email } });
    } catch (dbError) {
      console.error("[Login] Database unreachable:", (dbError as Error).message);
      return errorResponse("SERVICE_UNAVAILABLE", "Sign-in is temporarily unavailable, please retry", 503);
    }

    // Only stored accounts with a verified password can sign in.
    if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      return errorResponse("UNAUTHORIZED", "Invalid email or password", 401);
    }

    await createDbSession(user.id);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("[Login] Unexpected error:", error);
    return errorResponse("INTERNAL", "Login failed", 500);
  }
}
