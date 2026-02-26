import { NextResponse } from "next/server";
import { findAdminByCredentials, checkRateLimit, appendAuditLog } from "@/lib/db";
import { createAccessToken, createRefreshToken } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    // Rate limit: 10 login attempts per IP per 15 min window
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!checkRateLimit(`login:${ip}`, 10, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: "Too many login attempts. Try again later." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    if (username.length > 50 || password.length > 128) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 400 }
      );
    }

    const admin = await findAdminByCredentials(username, password);
    if (!admin) {
      appendAuditLog({
        userId: "unknown",
        username: String(username).slice(0, 50),
        role: "unknown",
        action: "login_failed",
        ip,
        userAgent: request.headers.get("user-agent") || undefined,
      });
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    const accessToken = await createAccessToken({
      id: admin.id,
      username: admin.username,
      role: admin.role,
    });

    const refreshToken = await createRefreshToken({
      id: admin.id,
      username: admin.username,
      role: admin.role,
    });

    appendAuditLog({
      userId: admin.id,
      username: admin.username,
      role: admin.role,
      action: "login_success",
      ip,
      userAgent: request.headers.get("user-agent") || undefined,
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: admin.id,
        username: admin.username,
        role: admin.role,
      },
    });

    // Access token: short-lived (15 min)
    response.cookies.set("admin_token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60,
      path: "/",
    });

    // Refresh token: long-lived (7 days)
    response.cookies.set("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60,
      path: "/api/auth/refresh",
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
