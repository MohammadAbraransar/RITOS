import { getIronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { prisma } from "@/server/db";
import { config } from "@/server/config";

export interface SessionData {
  userId?: string;
  role?: "CUSTOMER" | "SUPPORT_ANALYST" | "ADMIN";
  email?: string;
  name?: string;
  sessionToken?: string;
}

// Built on use so the secret is read at request time; there is no fallback secret.
function sessionOptions(): SessionOptions {
  return {
    password: config.sessionSecret,
    cookieName: "shopflow_session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: config.sessionTtlHours * 60 * 60,
    },
  };
}

export async function getCurrentSession() {
  return getIronSession<SessionData>(cookies(), sessionOptions());
}

/** Persist a DB session, then issue the cookie. If the DB write fails, no cookie is issued (the caller gets the error). */
export async function createDbSession(userId: string) {
  const sessionToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 60 * 60 * 1000);
  const dbSession = await prisma.session.create({
    data: { userId, sessionToken, expiresAt },
    include: { user: true },
  });

  const session = await getCurrentSession();
  session.userId = dbSession.user.id;
  session.role = dbSession.user.role;
  session.email = dbSession.user.email;
  session.name = dbSession.user.name;
  session.sessionToken = sessionToken;
  await session.save();
  return { sessionToken, user: dbSession.user };
}

export async function destroySession() {
  const session = await getCurrentSession();
  if (session.sessionToken) {
    try {
      await prisma.session.deleteMany({ where: { sessionToken: session.sessionToken } });
    } catch {
      // The cookie is destroyed below regardless; a leftover DB row expires on its own.
    }
  }
  session.destroy();
}

/**
 * The signed-in user, only if the cookie points at a live DB session. A missing, expired or revoked session
 * (or an unreachable DB) means "not signed in": the cookie alone is never trusted as identity.
 */
export async function getAuthenticatedUser() {
  const session = await getCurrentSession();
  if (!session.userId || !session.sessionToken) return null;
  try {
    const dbSession = await prisma.session.findUnique({
      where: { sessionToken: session.sessionToken },
      include: { user: true },
    });
    if (dbSession && dbSession.expiresAt >= new Date() && dbSession.userId === session.userId) {
      return dbSession.user;
    }
  } catch (err) {
    console.warn("[Session] Session lookup failed; treating request as signed out:", (err as Error).message);
  }
  return null;
}
