import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { readAuditLog } from "@/lib/db";

/** GET /api/admin/audit - View audit log (requires view_audit_log) */
export async function GET(request: Request) {
  const result = await requirePermission(request, "view_audit_log");
  if (result instanceof Response) return result;

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

  const entries = readAuditLog(limit);
  return NextResponse.json({ entries, total: entries.length });
}
