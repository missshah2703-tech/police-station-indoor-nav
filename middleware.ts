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

/** JWT verify options — pin algorithm to HS256, add clock tolerance */
const JWT_VERIFY_OPTIONS = {
  algorithms: ["HS256" as const],
  clockTolerance: 15, // 15 seconds tolerance for clock skew
};

/** Verify admin JWT token, returns payload or null */
async function verifyAdminToken(request: NextRequest) {
  const token = request.cookies.get("admin_token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), JWT_VERIFY_OPTIONS);
    return payload;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ─── Security headers for all responses ───
  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload"
  );
  response.headers.set(
    "Permissions-Policy",
    "camera=(self), microphone=(), geolocation=(self), accelerometer=(self), gyroscope=(self)"
  );
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline' https://maps.googleapis.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https://maps.googleapis.com https://maps.gstatic.com https://*.google.com https://*.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "media-src 'self' blob:",
      "connect-src 'self' https://maps.googleapis.com https://*.googleapis.com https://api.immersal.com",
      "worker-src 'self' blob:",
      "frame-src 'self'",
    ].join("; ")
  );

  // ─── Protect admin dashboard pages ───
  if (pathname.startsWith("/admin/dashboard")) {
    const payload = await verifyAdminToken(request);
    if (!payload) {
      const redirectResponse = NextResponse.redirect(
        new URL("/admin/login", request.url)
      );
      redirectResponse.cookies.set("admin_token", "", { maxAge: 0, path: "/" });
      return redirectResponse;
    }
  }

  // ─── Block admin login page if already authenticated ───
  if (pathname === "/admin/login") {
    const payload = await verifyAdminToken(request);
    if (payload) {
      return NextResponse.redirect(
        new URL("/admin/dashboard", request.url)
      );
    }
  }

  // ─── Protect admin API routes (except setup check + login) ───
  if (
    pathname.startsWith("/api/admin/") &&
    pathname !== "/api/admin/setup"
  ) {
    const payload = await verifyAdminToken(request);
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
