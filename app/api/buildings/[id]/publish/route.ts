import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import {
  getBuilding,
  validateBuildingMap,
  publishBuilding,
  unpublishBuilding,
  getBuildingVersions,
  rollbackBuilding,
  appendAuditLog,
} from "@/lib/db";

interface Params {
  params: { id: string };
}

/** GET /api/buildings/[id]/publish - Get publish status + validation */
export async function GET(request: Request, { params }: Params) {
  const result = await requirePermission(request, "view_building");
  if (result instanceof Response) return result;

  const building = getBuilding(params.id);
  if (!building) {
    return NextResponse.json({ error: "Building not found" }, { status: 404 });
  }

  const validation = validateBuildingMap(building);
  const versions = getBuildingVersions(params.id);

  return NextResponse.json({
    status: building.status,
    version: building.version,
    publishedAt: building.publishedAt,
    publishedBy: building.publishedBy,
    validation,
    versions,
  });
}

/** POST /api/buildings/[id]/publish - Publish or unpublish */
export async function POST(request: Request, { params }: Params) {
  const result = await requirePermission(request, "publish_building");
  if (result instanceof Response) return result;
  const { user } = result;

  try {
    const body = await request.json();
    const { action } = body; // "publish" | "unpublish" | "rollback"

    if (action === "publish") {
      const publishResult = publishBuilding(params.id, user.sub, user.username);
      if (!publishResult.success) {
        return NextResponse.json(
          { error: publishResult.error, validation: publishResult.validation },
          { status: 400 }
        );
      }
      return NextResponse.json({ success: true, message: "Building published" });
    }

    if (action === "unpublish") {
      const ok = unpublishBuilding(params.id);
      if (!ok) return NextResponse.json({ error: "Building not found" }, { status: 404 });

      appendAuditLog({
        userId: user.sub,
        username: user.username,
        role: user.role,
        action: "unpublish_building",
        entity: params.id,
      });

      return NextResponse.json({ success: true, message: "Building unpublished (now draft)" });
    }

    if (action === "rollback") {
      const { version } = body;
      if (!version || typeof version !== "number") {
        return NextResponse.json({ error: "Version number required" }, { status: 400 });
      }
      const rolled = rollbackBuilding(params.id, version);
      if (!rolled) {
        return NextResponse.json({ error: "Version not found" }, { status: 404 });
      }

      appendAuditLog({
        userId: user.sub,
        username: user.username,
        role: user.role,
        action: "rollback_building",
        entity: params.id,
        details: `Rolled back to v${version}`,
      });

      return NextResponse.json({ success: true, building: rolled });
    }

    return NextResponse.json(
      { error: "Invalid action. Use: publish, unpublish, or rollback" },
      { status: 400 }
    );
  } catch {
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }
}
