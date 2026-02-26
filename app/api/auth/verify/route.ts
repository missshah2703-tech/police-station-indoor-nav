import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";

export async function GET(request: Request) {
  const result = await authenticateRequest(request);
  if (!result.authenticated) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    user: {
      id: result.user.sub,
      username: result.user.username,
      role: result.user.role,
    },
  });
}
