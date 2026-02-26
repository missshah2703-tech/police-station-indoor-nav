import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("FATAL: JWT_SECRET environment variable is missing or too short");
  }
  return new TextEncoder().encode(secret);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Security headers for all responses
  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'"
  );

  // ─── Setup redirect: check via API if admins exist ───
  // (Can't use fs in Edge Runtime — use /api/admin/setup GET to check)
  if (
    pathname.startsWith("/admin") &&
    pathname !== "/admin/setup" &&
    !pathname.startsWith("/api/")
  ) {
    try {
      const checkUrl = new URL("/api/admin/setup", request.url);
      const checkRes = await fetch(checkUrl);
      if (checkRes.ok) {
        const data = await checkRes.json();
        if (data.needsSetup) {
          return NextResponse.redirect(new URL("/admin/setup", request.url));
        }
      }
    } catch {
      // If check fails, proceed normally
    }
  }

  // ─── Setup page: block if admins already exist ───
  if (pathname === "/admin/setup") {
    try {
      const checkUrl = new URL("/api/admin/setup", request.url);
      const checkRes = await fetch(checkUrl);
      if (checkRes.ok) {
        const data = await checkRes.json();
        if (!data.needsSetup) {
          return NextResponse.redirect(new URL("/admin/login", request.url));
        }
      }
    } catch { /* proceed */ }
  }

  // Protect admin dashboard routes (not login/setup)
  if (pathname.startsWith("/admin/dashboard")) {
    const token = request.cookies.get("admin_token")?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    try {
      await jwtVerify(token, getJwtSecret());
    } catch {
      const redirectResponse = NextResponse.redirect(
        new URL("/admin/login", request.url)
      );
      redirectResponse.cookies.set("admin_token", "", { maxAge: 0, path: "/" });
      return redirectResponse;
    }
  }

  // Block admin login if already authenticated
  if (pathname === "/admin/login") {
    const token = request.cookies.get("admin_token")?.value;
    if (token) {
      try {
        await jwtVerify(token, getJwtSecret());
        return NextResponse.redirect(
          new URL("/admin/dashboard", request.url)
        );
      } catch {
        // Token invalid, let them see login
      }
    }
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
