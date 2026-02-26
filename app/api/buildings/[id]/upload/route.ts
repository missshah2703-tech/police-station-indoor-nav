import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { getBuilding, saveBuilding, saveUploadedFile, appendAuditLog } from "@/lib/db";

interface Params {
  params: { id: string };
}

/** POST /api/buildings/[id]/upload - Upload floor plan image (requires upload_file) */
export async function POST(request: Request, { params }: Params) {
  const result = await requirePermission(request, "upload_file");
  if (result instanceof Response) return result;
  const { user } = result;

  try {
    const building = getBuilding(params.id);
    if (!building) {
      return NextResponse.json({ error: "Building not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("floorPlan") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const publicPath = saveUploadedFile(buffer, file.name, `floor-plans/${params.id}`);

    // Update building with new floor plan
    if (building.floors.length === 0) {
      building.floors.push({
        id: "ground",
        name: "Ground Floor",
        level: 0,
        floorPlanImage: publicPath,
        width: 800,
        height: 600,
      });
    } else {
      building.floors[0].floorPlanImage = publicPath;
    }
    building.floorPlanImage = publicPath;

    const saved = saveBuilding(building);

    appendAuditLog({
      userId: user.sub,
      username: user.username,
      role: user.role,
      action: "upload_floor_plan",
      entity: params.id,
      details: `Uploaded floor plan: ${publicPath}`,
    });

    return NextResponse.json({
      success: true,
      floorPlanImage: publicPath,
      building: saved,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
