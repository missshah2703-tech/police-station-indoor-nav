import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { getBuilding, saveBuilding, deleteBuilding, appendAuditLog } from "@/lib/db";

interface Params {
  params: { id: string };
}

/** GET /api/buildings/[id] - Get building details (public) */
export async function GET(_request: Request, { params }: Params) {
  try {
    const building = getBuilding(params.id);
    if (!building) {
      return NextResponse.json({ error: "Building not found" }, { status: 404 });
    }
    return NextResponse.json(building);
  } catch {
    return NextResponse.json({ error: "Failed to get building" }, { status: 500 });
  }
}

/** PUT /api/buildings/[id] - Update building (requires edit_building) */
export async function PUT(request: Request, { params }: Params) {
  const result = await requirePermission(request, "edit_building");
  if (result instanceof Response) return result;
  const { user } = result;

  try {
    const existing = getBuilding(params.id);
    if (!existing) {
      return NextResponse.json({ error: "Building not found" }, { status: 404 });
    }

    const body = await request.json();

    if (body.name) existing.name = String(body.name).slice(0, 200);
    if (body.nameAr !== undefined) existing.nameAr = String(body.nameAr).slice(0, 200);
    if (body.nameHi !== undefined) existing.nameHi = String(body.nameHi).slice(0, 200);
    if (body.address !== undefined) existing.address = String(body.address).slice(0, 500);
    if (body.scaleFactor !== undefined) existing.scaleFactor = Number(body.scaleFactor) || 10;
    if (body.nodes) existing.nodes = body.nodes;
    if (body.edges) existing.edges = body.edges;
    if (body.pois) existing.pois = body.pois;
    if (body.floors) existing.floors = body.floors;

    const saved = saveBuilding(existing);

    appendAuditLog({
      userId: user.sub,
      username: user.username,
      role: user.role,
      action: "update_building",
      entity: params.id,
      details: `Updated building: ${existing.name}`,
    });

    return NextResponse.json(saved);
  } catch {
    return NextResponse.json({ error: "Failed to update building" }, { status: 500 });
  }
}

/** DELETE /api/buildings/[id] - Delete building (requires delete_building) */
export async function DELETE(request: Request, { params }: Params) {
  const result = await requirePermission(request, "delete_building");
  if (result instanceof Response) return result;
  const { user } = result;

  try {
    const building = getBuilding(params.id);
    const deleted = deleteBuilding(params.id);
    if (!deleted) {
      return NextResponse.json({ error: "Building not found" }, { status: 404 });
    }

    appendAuditLog({
      userId: user.sub,
      username: user.username,
      role: user.role,
      action: "delete_building",
      entity: params.id,
      details: `Deleted building: ${building?.name || params.id}`,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete building" }, { status: 500 });
  }
}
