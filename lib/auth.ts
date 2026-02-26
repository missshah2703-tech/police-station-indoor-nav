import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import crypto from "crypto";

// ─── JWT Secret: MANDATORY, no fallback ───
function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "FATAL: JWT_SECRET environment variable is missing or too short (min 32 chars). " +
      "Set it in .env before starting the app."
    );
  }
  return new TextEncoder().encode(secret);
}

const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || "15m";
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || "7d";

// ─── Types ───
export type Role = "superadmin" | "admin" | "editor" | "viewer";

export interface AdminUser {
  id: string;
  username: string;
  role: Role;
}

export interface JWTPayload {
  sub: string;
  username: string;
  role: Role;
  type: "access" | "refresh";
  iat: number;
  exp: number;
}

// ─── RBAC Permissions ───
export type Permission =
  | "manage_users"
  | "create_building"
  | "edit_building"
  | "delete_building"
  | "publish_building"
  | "edit_draft"
  | "view_building"
  | "view_audit_log"
  | "upload_file";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  superadmin: [
    "manage_users", "create_building", "edit_building", "delete_building",
    "publish_building", "edit_draft", "view_building", "view_audit_log", "upload_file",
  ],
  admin: [
    "create_building", "edit_building", "delete_building",
    "publish_building", "edit_draft", "view_building", "view_audit_log", "upload_file",
  ],
  editor: ["edit_draft", "view_building", "upload_file"],
  viewer: ["view_building"],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

// ─── Token Creation ───
export async function createAccessToken(user: AdminUser): Promise<string> {
  return new SignJWT({ username: user.username, role: user.role, type: "access" as const })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(ACCESS_EXPIRY)
    .sign(getJwtSecret());
}

export async function createRefreshToken(user: AdminUser): Promise<string> {
  return new SignJWT({ username: user.username, role: user.role, type: "refresh" as const })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(REFRESH_EXPIRY)
    .sign(getJwtSecret());
}

/** @deprecated Use createAccessToken instead */
export const createToken = createAccessToken;

/** Verify and decode a JWT token */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

/** Hash a password with bcrypt (cost factor 12) */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/** Compare password against hash */
export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Password policy enforcement */
export function validatePasswordStrength(password: string): { valid: boolean; reason?: string } {
  if (password.length < 12) return { valid: false, reason: "Password must be at least 12 characters" };
  if (!/[A-Z]/.test(password)) return { valid: false, reason: "Must contain an uppercase letter" };
  if (!/[a-z]/.test(password)) return { valid: false, reason: "Must contain a lowercase letter" };
  if (!/[0-9]/.test(password)) return { valid: false, reason: "Must contain a number" };
  if (!/[^A-Za-z0-9]/.test(password)) return { valid: false, reason: "Must contain a special character" };
  return { valid: true };
}

/** CSRF token generation */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Extract token from Authorization header or cookie */
export function extractToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  const cookie = request.headers.get("cookie");
  if (cookie) {
    const match = cookie.match(/admin_token=([^;]+)/);
    if (match) return match[1];
  }
  return null;
}

/** Middleware helper: verify request is authenticated */
export async function authenticateRequest(
  request: Request
): Promise<{ authenticated: true; user: JWTPayload } | { authenticated: false; error: string }> {
  const token = extractToken(request);
  if (!token) {
    return { authenticated: false, error: "No authentication token provided" };
  }
  const payload = await verifyToken(token);
  if (!payload) {
    return { authenticated: false, error: "Invalid or expired token" };
  }
  if (payload.type && payload.type !== "access") {
    return { authenticated: false, error: "Invalid token type" };
  }
  return { authenticated: true, user: payload };
}

/** Require specific permission — returns user or error Response */
export async function requirePermission(
  request: Request,
  permission: Permission
): Promise<{ user: JWTPayload } | Response> {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!hasPermission(auth.user.role as Role, permission)) {
    return new Response(
      JSON.stringify({ error: "Insufficient permissions" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }
  return { user: auth.user };
}
