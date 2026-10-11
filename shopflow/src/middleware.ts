import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ipRequestCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 500; // Generous for tests and local development

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rate limit API routes
  if (pathname.startsWith("/api/")) {
    const ip = request.ip || request.headers.get("x-forwarded-for") || "127.0.0.1";
    const now = Date.now();
    const entry = ipRequestCounts.get(ip);

    if (!entry || entry.resetTime <= now) {
      ipRequestCounts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    } else {
      entry.count++;
      if (entry.count > MAX_REQUESTS_PER_WINDOW) {
        return NextResponse.json(
          { error: { code: "RATE_LIMITED", message: "Too many requests. Please slow down." } },
          { status: 429, headers: { "Retry-After": "60" } }
        );
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
