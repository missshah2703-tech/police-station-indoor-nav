import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { listBuildings, createBuilding, appendAuditLog } from "@/lib/db";

/** GET /api/buildings - List all buildings (public) */
export async function GET() {
  try {
    const buildings = listBuildings();
    return NextResponse.json(buildings);
  } catch {
    return NextResponse.json(
      { error: "Failed to list buildings" },
      { status: 500 }
    );
  }
}

/** POST /api/buildings - Create a new building (requires create_building) */
export async function POST(request: Request) {
  const result = await requirePermission(request, "create_building");
  if (result instanceof Response) return result;
  const { user } = result;

  try {
    const body = await request.json();
    const { name, address } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Building name is required" },
        { status: 400 }
      );
    }
    if (name.length > 200) {
      return NextResponse.json(
        { error: "Building name too long" },
        { status: 400 }
      );
    }

    const building = createBuilding(name.trim(), address?.trim());

    appendAuditLog({
      userId: user.sub,
      username: user.username,
      role: user.role,
      action: "create_building",
      entity: building.id,
      details: building.name,
    });

    return NextResponse.json(building, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create building" },
      { status: 500 }
    );
  }
}
