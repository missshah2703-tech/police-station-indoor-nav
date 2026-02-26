import { NextResponse } from "next/server";
import { requirePermission, validatePasswordStrength } from "@/lib/auth";
import {
  listAdminUsers,
  createAdminUser,
  deleteAdminUser,
  updateAdminRole,
  appendAuditLog,
} from "@/lib/db";
import type { Role } from "@/lib/auth";

const VALID_ROLES: Role[] = ["superadmin", "admin", "editor", "viewer"];

/** GET /api/admin/users - List all users (requires manage_users) */
export async function GET(request: Request) {
  const result = await requirePermission(request, "manage_users");
  if (result instanceof Response) return result;

  const users = listAdminUsers();
  return NextResponse.json({ users });
}

/** POST /api/admin/users - Create a new user (requires manage_users) */
export async function POST(request: Request) {
  const result = await requirePermission(request, "manage_users");
  if (result instanceof Response) return result;
  const { user } = result;

  try {
    const body = await request.json();
    const { username, password, role } = body;

    if (!username || !password || !role) {
      return NextResponse.json(
        { error: "username, password, and role are required" },
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

    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      return NextResponse.json({ error: strength.reason }, { status: 400 });
    }

    const newUser = await createAdminUser(username, password, role, user.sub);

    appendAuditLog({
      userId: user.sub,
      username: user.username,
      role: user.role,
      action: "create_user",
      entity: newUser.id,
      details: `Created user: ${username} (${role})`,
    });

    return NextResponse.json(
      {
        id: newUser.id,
        username: newUser.username,
        role: newUser.role,
        createdAt: newUser.createdAt,
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create user";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** DELETE /api/admin/users?id=xxx - Delete a user (requires manage_users) */
export async function DELETE(request: Request) {
  const result = await requirePermission(request, "manage_users");
  if (result instanceof Response) return result;
  const { user } = result;

  const url = new URL(request.url);
  const userId = url.searchParams.get("id");

  if (!userId) {
    return NextResponse.json({ error: "User ID required" }, { status: 400 });
  }

  // Prevent self-deletion
  if (userId === user.sub) {
    return NextResponse.json(
      { error: "Cannot delete your own account" },
      { status: 400 }
    );
  }

  try {
    const deleted = deleteAdminUser(userId);
    if (!deleted) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    appendAuditLog({
      userId: user.sub,
      username: user.username,
      role: user.role,
      action: "delete_user",
      entity: userId,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete user";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** PATCH /api/admin/users - Update user role (requires manage_users) */
export async function PATCH(request: Request) {
  const result = await requirePermission(request, "manage_users");
  if (result instanceof Response) return result;
  const { user } = result;

  try {
    const body = await request.json();
    const { userId, role } = body;

    if (!userId || !role) {
      return NextResponse.json(
        { error: "userId and role are required" },
        { status: 400 }
      );
    }

    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    const updated = updateAdminRole(userId, role);
    if (!updated) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    appendAuditLog({
      userId: user.sub,
      username: user.username,
      role: user.role,
      action: "update_user_role",
      entity: userId,
      details: `Changed role to: ${role}`,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update role";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
