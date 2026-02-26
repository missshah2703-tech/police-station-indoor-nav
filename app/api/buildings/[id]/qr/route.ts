import { NextResponse } from "next/server";
import { getBuilding } from "@/lib/db";
import QRCode from "qrcode";

interface Params {
  params: { id: string };
}

/** GET /api/buildings/[id]/qr - Generate QR code for building */
export async function GET(request: Request, { params }: Params) {
  try {
    const building = getBuilding(params.id);
    if (!building) {
      return NextResponse.json({ error: "Building not found" }, { status: 404 });
    }

    // Get base URL from request or use default
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const navUrl = `${baseUrl}/navigate/${params.id}`;

    const format = url.searchParams.get("format") || "png";

    if (format === "svg") {
      const svg = await QRCode.toString(navUrl, {
        type: "svg",
        width: 400,
        margin: 2,
        color: { dark: "#0a1628", light: "#ffffff" },
      });
      return new Response(svg, {
        headers: { "Content-Type": "image/svg+xml" },
      });
    }

    // Default: PNG data URL
    const dataUrl = await QRCode.toDataURL(navUrl, {
      width: 400,
      margin: 2,
      color: { dark: "#0a1628", light: "#ffffff" },
    });

    return NextResponse.json({
      qrCode: dataUrl,
      navigationUrl: navUrl,
      buildingName: building.name,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to generate QR code" },
      { status: 500 }
    );
  }
}
