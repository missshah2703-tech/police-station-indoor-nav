import { NextRequest, NextResponse } from "next/server";

const IMMERSAL_TOKEN = process.env.IMMERSAL_TOKEN || "";
const IMMERSAL_MAP_ID = parseInt(process.env.IMMERSAL_MAP_ID || "0", 10);
const IMMERSAL_API = "https://api.immersal.com/sol/1/b2b/localize";

// Rate limit: max 2 requests per second per IP
const recentRequests = new Map<string, number>();

export async function POST(req: NextRequest) {
  if (!IMMERSAL_TOKEN || !IMMERSAL_MAP_ID) {
    return NextResponse.json(
      { error: "VPS not configured" },
      { status: 503 }
    );
  }

  // Simple rate limit
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const now = Date.now();
  const last = recentRequests.get(ip) || 0;
  if (now - last < 500) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  recentRequests.set(ip, now);
  // Clean old entries periodically
  if (recentRequests.size > 1000) {
    recentRequests.forEach((v, k) => {
      if (now - v > 10000) recentRequests.delete(k);
    });
  }

  try {
    const body = await req.json();
    const { b64, ox, oy, fx, fy } = body;

    if (!b64 || typeof b64 !== "string") {
      return NextResponse.json(
        { error: "Missing image data (b64)" },
        { status: 400 }
      );
    }

    // Validate numeric camera intrinsics
    if (
      typeof ox !== "number" ||
      typeof oy !== "number" ||
      typeof fx !== "number" ||
      typeof fy !== "number"
    ) {
      return NextResponse.json(
        { error: "Missing camera intrinsics (ox, oy, fx, fy)" },
        { status: 400 }
      );
    }

    // Forward to Immersal API with server-side token
    const immersalBody = {
      token: IMMERSAL_TOKEN,
      fx,
      fy,
      ox,
      oy,
      b64,
      mapIds: [{ id: IMMERSAL_MAP_ID }],
    };

    const immersalRes = await fetch(IMMERSAL_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(immersalBody),
    });

    if (!immersalRes.ok) {
      return NextResponse.json(
        { error: "Immersal API error", status: immersalRes.status },
        { status: 502 }
      );
    }

    const data = await immersalRes.json();
    // data contains: { error: "none"|"...", success: bool, map: id, px, py, pz, r00..r22 }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
