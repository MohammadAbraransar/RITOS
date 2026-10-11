import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { hashPassword } from "@/server/auth/password";
import { createDbSession } from "@/server/auth/session";
import { errorResponse } from "@/server/auth/guards";

const RegisterSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", "Validation failed", 422, parsed.error.format());
    }

    const { name, email, password, phone } = parsed.data;

    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      return errorResponse("VALIDATION_ERROR", "Email already in use", 409);
    }

    const count = await prisma.user.count({ where: { role: "CUSTOMER" } });
    const customerId = `CUS-${10001 + count}`;
    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        id: customerId,
        name,
        email,
        phone,
        passwordHash,
        role: "CUSTOMER",
        riskMetadata: { manual_watchlist: false },
      },
    });

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
    return errorResponse("INTERNAL", "Registration failed", 500);
  }
}
