import fs from "fs";
import path from "path";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { hashPassword, comparePassword, type Role } from "./auth";

// ─── Paths ───
const DATA_DIR = path.join(process.cwd(), "data");
const BUILDINGS_DIR = path.join(DATA_DIR, "buildings");
const ADMINS_FILE = path.join(DATA_DIR, "admins.json");
const AUDIT_LOG_FILE = path.join(DATA_DIR, "audit_log.jsonl");
const RATE_LIMIT_FILE = path.join(DATA_DIR, "rate_limits.json");
const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ═══════════════════════════════════════════════
// ADMIN MANAGEMENT (No hardcoded credentials)
// ═══════════════════════════════════════════════

export interface StoredAdmin {
  id: string;
  username: string;
  passwordHash: string;
  role: Role;
  createdAt: string;
  createdBy?: string;
  lastLogin?: string;
  failedAttempts: number;
  lockedUntil?: string;
}

function getAdmins(): StoredAdmin[] {
  ensureDir(DATA_DIR);
  if (!fs.existsSync(ADMINS_FILE)) return [];
  return JSON.parse(fs.readFileSync(ADMINS_FILE, "utf-8"));
}

function saveAdmins(admins: StoredAdmin[]) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(ADMINS_FILE, JSON.stringify(admins, null, 2));
}

/** Check if initial setup is needed (no users exist) */
export function needsSetup(): boolean {
  return getAdmins().length === 0;
}

/** Create the first SuperAdmin (only works if no users exist) */
export async function createInitialSuperAdmin(
  username: string,
  password: string
): Promise<StoredAdmin> {
  const admins = getAdmins();
  if (admins.length > 0) {
    throw new Error("Setup already completed. Cannot create initial admin.");
  }
  const hash = await hashPassword(password);
  const admin: StoredAdmin = {
    id: uuidv4(),
    username,
    passwordHash: hash,
    role: "superadmin",
    createdAt: new Date().toISOString(),
    failedAttempts: 0,
  };
  saveAdmins([admin]);
  return admin;
}

/** Create a new admin user (requires superadmin) */
export async function createAdminUser(
  username: string,
  password: string,
  role: Role,
  createdBy: string
): Promise<StoredAdmin> {
  const admins = getAdmins();
  if (admins.find((a) => a.username === username)) {
    throw new Error("Username already exists");
  }
  const hash = await hashPassword(password);
  const admin: StoredAdmin = {
    id: uuidv4(),
    username,
    passwordHash: hash,
    role,
    createdAt: new Date().toISOString(),
    createdBy,
    failedAttempts: 0,
  };
  admins.push(admin);
  saveAdmins(admins);
  return admin;
}

/** List all admin users (without password hashes) */
export function listAdminUsers(): Omit<StoredAdmin, "passwordHash">[] {
  return getAdmins().map(({ passwordHash: _, ...rest }) => rest);
}

/** Delete an admin user */
export function deleteAdminUser(userId: string): boolean {
  const admins = getAdmins();
  const filtered = admins.filter((a) => a.id !== userId);
  if (filtered.length === admins.length) return false;
  // Prevent deleting last superadmin
  if (!filtered.some((a) => a.role === "superadmin")) {
    throw new Error("Cannot delete the last superadmin");
  }
  saveAdmins(filtered);
  return true;
}

/** Update admin role */
export function updateAdminRole(userId: string, newRole: Role): boolean {
  const admins = getAdmins();
  const admin = admins.find((a) => a.id === userId);
  if (!admin) return false;
  admin.role = newRole;
  saveAdmins(admins);
  return true;
}

// ─── Rate Limiting + Account Lockout ───
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export async function findAdminByCredentials(
  username: string,
  password: string
): Promise<StoredAdmin | null> {
  if (needsSetup()) return null; // No auto-init, must use /admin/setup

  const admins = getAdmins();
  const admin = admins.find((a) => a.username === username);
  if (!admin) return null;

  // Check lockout
  if (admin.lockedUntil) {
    const lockExpiry = new Date(admin.lockedUntil);
    if (lockExpiry > new Date()) {
      return null; // Still locked
    }
    // Lockout expired — reset
    admin.failedAttempts = 0;
    admin.lockedUntil = undefined;
  }

  const valid = await comparePassword(password, admin.passwordHash);
  if (!valid) {
    admin.failedAttempts = (admin.failedAttempts || 0) + 1;
    if (admin.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      admin.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString();
    }
    saveAdmins(admins);
    return null;
  }

  // Success — reset failed attempts, update lastLogin
  admin.failedAttempts = 0;
  admin.lockedUntil = undefined;
  admin.lastLogin = new Date().toISOString();
  saveAdmins(admins);
  return admin;
}

// ─── API Rate Limiting (in-memory, reset on restart) ───
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxPerWindow: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxPerWindow) return false;
  entry.count++;
  return true;
}

// ═══════════════════════════════════════════════
// IMMUTABLE AUDIT LOG
// ═══════════════════════════════════════════════

export interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  username: string;
  role: string;
  action: string;
  entity?: string;
  details?: string;
  beforeHash?: string;
  afterHash?: string;
  ip?: string;
  userAgent?: string;
}

function computeHash(data: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 16);
}

/** Append-only audit log — NEVER delete or update entries */
export function appendAuditLog(entry: Omit<AuditEntry, "id" | "timestamp">): void {
  ensureDir(DATA_DIR);
  const record: AuditEntry = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    ...entry,
  };
  // JSONL format: one JSON object per line, append-only
  fs.appendFileSync(AUDIT_LOG_FILE, JSON.stringify(record) + "\n");
}

/** Read audit log (most recent first) */
export function readAuditLog(limit: number = 100): AuditEntry[] {
  if (!fs.existsSync(AUDIT_LOG_FILE)) return [];
  const lines = fs.readFileSync(AUDIT_LOG_FILE, "utf-8").split("\n").filter(Boolean);
  return lines
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean)
    .reverse()
    .slice(0, limit);
}

// ─── Building/Location CRUD ───
export interface BuildingData {
  id: string;
  name: string;
  nameAr?: string;
  nameHi?: string;
  address?: string;
  floorPlanImage?: string;
  floors: FloorData[];
  nodes: NodeData[];
  edges: EdgeData[];
  pois: POIData[];
  scaleFactor: number;
  status: "draft" | "published";
  publishedAt?: string;
  publishedBy?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface FloorData {
  id: string;
  name: string;
  level: number;
  floorPlanImage: string;
  width: number;
  height: number;
}

export interface NodeData {
  id: string;
  x: number;
  y: number;
  floor?: string;
  label?: string;
}

export interface EdgeData {
  from: string;
  to: string;
  weight: number;
}

export interface POIData {
  id: string;
  nodeId: string;
  name: string;
  nameAr?: string;
  nameHi?: string;
  type: string;
  icon?: string;
  description?: string;
}

export function listBuildings(): BuildingData[] {
  ensureDir(BUILDINGS_DIR);
  const files = fs.readdirSync(BUILDINGS_DIR).filter((f) => f.endsWith(".json"));
  return files.map((f) => {
    const data = JSON.parse(
      fs.readFileSync(path.join(BUILDINGS_DIR, f), "utf-8")
    );
    // Normalize old format
    return normalizeBuildingData(data, f.replace(".json", ""));
  });
}

export function getBuilding(id: string): BuildingData | null {
  // Sanitize ID to prevent path traversal
  const safeId = path.basename(id).replace(/[^a-zA-Z0-9_-]/g, "");
  const filePath = path.join(BUILDINGS_DIR, `${safeId}.json`);
  if (!fs.existsSync(filePath)) return null;
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return normalizeBuildingData(data, safeId);
}

export function saveBuilding(building: BuildingData): BuildingData {
  ensureDir(BUILDINGS_DIR);
  const safeId = path.basename(building.id).replace(/[^a-zA-Z0-9_-]/g, "");
  building.id = safeId;
  building.updatedAt = new Date().toISOString();
  const filePath = path.join(BUILDINGS_DIR, `${safeId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(building, null, 2));
  return building;
}

export function createBuilding(
  name: string,
  address?: string
): BuildingData {
  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const building: BuildingData = {
    id,
    name,
    address,
    floors: [],
    nodes: [],
    edges: [],
    pois: [],
    scaleFactor: 10,
    status: "draft",
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return saveBuilding(building);
}

export function deleteBuilding(id: string): boolean {
  const safeId = path.basename(id).replace(/[^a-zA-Z0-9_-]/g, "");
  const filePath = path.join(BUILDINGS_DIR, `${safeId}.json`);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}

/** Save uploaded file and return its public URL path */
export function saveUploadedFile(
  buffer: Buffer,
  filename: string,
  subfolder: string = "floor-plans"
): string {
  const dir = path.join(UPLOADS_DIR, subfolder);
  ensureDir(dir);
  // Sanitize filename
  const ext = path.extname(filename).toLowerCase();
  const allowedExts = [".png", ".jpg", ".jpeg", ".webp", ".svg"];
  if (!allowedExts.includes(ext)) {
    throw new Error("Invalid file type. Allowed: " + allowedExts.join(", "));
  }
  const safeName = `${uuidv4()}${ext}`;
  const filePath = path.join(dir, safeName);
  fs.writeFileSync(filePath, buffer);
  return `/uploads/${subfolder}/${safeName}`;
}

// ─── Helpers ───

/** Extract a plain string from either a string or an i18n object like {en, ar, hi} */
function toStr(val: unknown, fallback: string = ""): string {
  if (typeof val === "string") return val;
  if (val && typeof val === "object" && !Array.isArray(val)) {
    const obj = val as Record<string, string>;
    return obj.en || obj.ar || Object.values(obj)[0] || fallback;
  }
  return fallback;
}

/** Extract localized string (ar) from i18n object */
function toStrAr(val: unknown): string | undefined {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    return (val as Record<string, string>).ar;
  }
  return undefined;
}

/** Extract localized string (hi) from i18n object */
function toStrHi(val: unknown): string | undefined {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    return (val as Record<string, string>).hi;
  }
  return undefined;
}

/** Normalize POIs from old format (description i18n) to flat format */
function normalizePOIs(pois: unknown[]): POIData[] {
  if (!pois) return [];
  return pois.map((p: unknown) => {
    const poi = p as Record<string, unknown>;
    return {
      id: (poi.id as string) || `poi-${poi.nodeId}`,
      nodeId: poi.nodeId as string,
      name: toStr(poi.name || poi.description, poi.nodeId as string),
      nameAr: toStrAr(poi.name || poi.description),
      nameHi: toStrHi(poi.name || poi.description),
      type: (poi.type as string) || (poi.category as string) || "department",
      icon: poi.icon as string,
      description: toStr(poi.description),
    };
  });
}

/** Normalize nodes from old format (label as i18n object) to flat format */
function normalizeNodes(nodes: unknown[]): NodeData[] {
  if (!nodes) return [];
  return nodes.map((n: unknown) => {
    const node = n as Record<string, unknown>;
    return {
      id: node.id as string,
      x: node.x as number,
      y: node.y as number,
      label: toStr(node.label, node.id as string),
    };
  });
}

/** Normalize edges (add missing fields) */
function normalizeEdges(edges: unknown[]): EdgeData[] {
  if (!edges) return [];
  return edges.map((e: unknown) => {
    const edge = e as Record<string, unknown>;
    return {
      from: edge.from as string,
      to: edge.to as string,
      weight: (edge.weight as number) || 1,
    };
  });
}

function normalizeBuildingData(data: Record<string, unknown>, id: string): BuildingData {
  // Handle old format (has floors[].nodes etc) vs new format
  if (data.floors && Array.isArray(data.floors)) {
    const floor = (data.floors as Record<string, unknown>[])[0] as Record<string, unknown> | undefined;
    if (floor && floor.nodes && !data.nodes) {
      // Old format: extract nodes, edges, pois from first floor
      return {
        id,
        name: toStr(data.name, id),
        nameAr: toStrAr(data.name),
        nameHi: toStrHi(data.name),
        address: toStr(data.address),
        floorPlanImage: (floor.planImage as string) || (floor.floorPlanImage as string),
        floors: [{
          id: (floor.id as string) || "ground",
          name: toStr(floor.name, "Ground Floor"),
          level: (floor.level as number) || 0,
          floorPlanImage: (floor.planImage as string) || (floor.floorPlanImage as string) || "",
          width: (floor.width as number) || 800,
          height: (floor.height as number) || 600,
        }],
        nodes: normalizeNodes(floor.nodes as unknown[]),
        edges: normalizeEdges(floor.edges as unknown[]),
        pois: normalizePOIs(floor.pois as unknown[]),
        scaleFactor: ((floor as Record<string, unknown>).scaleFactor as number) || (data.scaleFactor as number) || 10,
        status: (data.status as "draft" | "published") || "published",
        version: (data.version as number) || 1,
        createdAt: (data.createdAt as string) || new Date().toISOString(),
        updatedAt: (data.updatedAt as string) || new Date().toISOString(),
      };
    }
  }

  return {
    id,
    name: toStr(data.name, id),
    nameAr: toStrAr(data.name),
    nameHi: toStrHi(data.name),
    address: toStr(data.address),
    floorPlanImage: data.floorPlanImage as string,
    floors: (data.floors as FloorData[]) || [],
    nodes: normalizeNodes(data.nodes as unknown[] || []),
    edges: normalizeEdges(data.edges as unknown[] || []),
    pois: normalizePOIs(data.pois as unknown[] || []),
    scaleFactor: (data.scaleFactor as number) || 10,
    status: (data.status as "draft" | "published") || "published",
    version: (data.version as number) || 1,
    createdAt: (data.createdAt as string) || new Date().toISOString(),
    updatedAt: (data.updatedAt as string) || new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════
// MAP VALIDATION
// ═══════════════════════════════════════════════

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateBuildingMap(building: BuildingData): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Must have at least one node
  if (!building.nodes || building.nodes.length === 0) {
    errors.push("No nodes defined — map has no waypoints");
  }

  // 2. Must have at least one edge
  if (!building.edges || building.edges.length === 0) {
    errors.push("No edges defined — map has no paths");
  }

  // 3. Must have at least one POI
  if (!building.pois || building.pois.length === 0) {
    errors.push("No POIs defined — map has no destinations");
  }

  if (errors.length > 0) return { valid: false, errors, warnings };

  const nodeIds = new Set(building.nodes.map((n) => n.id));

  // 4. All edges must reference valid nodes
  for (const edge of building.edges) {
    if (!nodeIds.has(edge.from)) errors.push(`Edge references non-existent node: ${edge.from}`);
    if (!nodeIds.has(edge.to)) errors.push(`Edge references non-existent node: ${edge.to}`);
    if (edge.weight <= 0) errors.push(`Edge ${edge.from}-${edge.to} has invalid weight: ${edge.weight}`);
  }

  // 5. All POIs must reference valid nodes
  for (const poi of building.pois) {
    if (!nodeIds.has(poi.nodeId)) errors.push(`POI "${poi.name}" references non-existent node: ${poi.nodeId}`);
  }

  // 6. Graph connectivity check (BFS from first node)
  const adjacency = new Map<string, Set<string>>();
  for (const node of building.nodes) adjacency.set(node.id, new Set());
  for (const edge of building.edges) {
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  }

  const visited = new Set<string>();
  const queue = [building.nodes[0].id];
  visited.add(building.nodes[0].id);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of Array.from(adjacency.get(current) || [])) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  const orphanNodes = building.nodes.filter((n) => !visited.has(n.id));
  if (orphanNodes.length > 0) {
    errors.push(`Disconnected nodes (unreachable): ${orphanNodes.map((n) => n.id).join(", ")}`);
  }

  // 7. Check POIs are reachable
  for (const poi of building.pois) {
    if (!visited.has(poi.nodeId)) {
      errors.push(`POI "${poi.name}" is unreachable from the graph`);
    }
  }

  // 8. Must have a floor plan image
  if (!building.floorPlanImage && (!building.floors.length || !building.floors[0].floorPlanImage)) {
    warnings.push("No floor plan image uploaded");
  }

  // 9. Check for entry/anchor node (node with label containing "entry", "entrance", "qr", or "start")
  const hasEntry = building.nodes.some((n) =>
    /entry|entrance|qr|start|anchor/i.test(n.label || "")
  );
  if (!hasEntry) {
    warnings.push("No entry/anchor node found — consider adding one labeled 'entry' or 'QR-scan'");
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ═══════════════════════════════════════════════
// PUBLISH / DRAFT WORKFLOW
// ═══════════════════════════════════════════════

const VERSIONS_DIR = path.join(DATA_DIR, "versions");

/** Publish a building (must pass validation first) */
export function publishBuilding(
  buildingId: string,
  userId: string,
  username: string
): { success: boolean; error?: string; validation?: ValidationResult } {
  const building = getBuilding(buildingId);
  if (!building) return { success: false, error: "Building not found" };

  const validation = validateBuildingMap(building);
  if (!validation.valid) {
    return { success: false, error: "Validation failed", validation };
  }

  // Save current version as backup
  ensureDir(path.join(VERSIONS_DIR, buildingId));
  const versionFile = path.join(VERSIONS_DIR, buildingId, `v${building.version}.json`);
  fs.writeFileSync(versionFile, JSON.stringify(building, null, 2));

  // Update status
  building.status = "published";
  building.publishedAt = new Date().toISOString();
  building.publishedBy = username;
  building.version = (building.version || 1) + 1;
  saveBuilding(building);

  appendAuditLog({
    userId,
    username,
    role: "admin",
    action: "publish_building",
    entity: buildingId,
    details: `Published v${building.version - 1} of ${building.name}`,
  });

  return { success: true };
}

/** Unpublish (set back to draft) */
export function unpublishBuilding(buildingId: string): boolean {
  const building = getBuilding(buildingId);
  if (!building) return false;
  building.status = "draft";
  saveBuilding(building);
  return true;
}

/** Get version history for a building */
export function getBuildingVersions(buildingId: string): { version: number; date: string }[] {
  const safeId = path.basename(buildingId).replace(/[^a-zA-Z0-9_-]/g, "");
  const dir = path.join(VERSIONS_DIR, safeId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const stat = fs.statSync(path.join(dir, f));
      return {
        version: parseInt(f.replace("v", "").replace(".json", "")),
        date: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.version - a.version);
}

/** Rollback to a specific version */
export function rollbackBuilding(buildingId: string, version: number): BuildingData | null {
  const safeId = path.basename(buildingId).replace(/[^a-zA-Z0-9_-]/g, "");
  const versionFile = path.join(VERSIONS_DIR, safeId, `v${version}.json`);
  if (!fs.existsSync(versionFile)) return null;
  const data = JSON.parse(fs.readFileSync(versionFile, "utf-8"));
  data.status = "draft"; // Rollback always goes to draft
  data.version = (data.version || version) + 1;
  data.updatedAt = new Date().toISOString();
  return saveBuilding(data);
}
