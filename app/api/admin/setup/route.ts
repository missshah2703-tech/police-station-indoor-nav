import { NextResponse } from "next/server";
import { createInitialSuperAdmin, needsSetup, appendAuditLog } from "@/lib/db";
import { validatePasswordStrength, createAccessToken, createRefreshToken } from "@/lib/auth";

/** POST /api/admin/setup - Create first SuperAdmin (only if no users exist) */
export async function POST(request: Request) {
  try {
    if (!needsSetup()) {
      return NextResponse.json(
        { error: "Setup already completed" },
        { status: 403 }
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

    if (typeof username !== "string" || username.length < 3 || username.length > 50) {
      return NextResponse.json(
        { error: "Username must be 3-50 characters" },
        { status: 400 }
      );
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
      return NextResponse.json(
        { error: "Username can only contain letters, numbers, dots, hyphens, and underscores" },
        { status: 400 }
      );
    }

    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      return NextResponse.json(
        { error: strength.reason },
        { status: 400 }
      );
    }

    const admin = await createInitialSuperAdmin(username, password);

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
      action: "initial_setup",
      details: "First SuperAdmin account created",
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
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

    response.cookies.set("admin_token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60,
      path: "/",
    });

    response.cookies.set("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60,
      path: "/api/auth/refresh",
    });

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Setup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** GET /api/admin/setup - Check if setup is needed */
export async function GET() {
  return NextResponse.json({ needsSetup: needsSetup() });
}
