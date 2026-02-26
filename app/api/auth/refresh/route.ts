import { NextResponse } from "next/server";
import { verifyToken, createAccessToken, createRefreshToken, type JWTPayload } from "@/lib/auth";

/** POST /api/auth/refresh - Rotate access token using refresh token */
export async function POST(request: Request) {
  try {
    const cookie = request.headers.get("cookie");
    const match = cookie?.match(/refresh_token=([^;]+)/);
    const refreshToken = match?.[1];

    if (!refreshToken) {
      return NextResponse.json(
        { error: "No refresh token" },
        { status: 401 }
      );
    }

    const payload = await verifyToken(refreshToken);
    if (!payload || payload.type !== "refresh") {
      return NextResponse.json(
        { error: "Invalid refresh token" },
        { status: 401 }
      );
    }

    const user = {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
    };

    const newAccessToken = await createAccessToken(user);
    const newRefreshToken = await createRefreshToken(user);

    const response = NextResponse.json({ success: true });

    response.cookies.set("admin_token", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60,
      path: "/",
    });

    response.cookies.set("refresh_token", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60,
      path: "/api/auth/refresh",
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "Token refresh failed" },
      { status: 500 }
    );
  }
}
