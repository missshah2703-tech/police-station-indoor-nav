"use client";

/**
 * Immersal VPS client — captures camera frames, sends to our API proxy,
 * and converts Immersal world-space position to floor plan coordinates.
 *
 * The mapping from Immersal 3D space (px, py, pz) to floor plan 2D (x, y)
 * uses a simple affine transform that must be calibrated once per building.
 */

/** 3x3 rotation matrix from Immersal (row-major) */
export interface VPSRotationMatrix {
  r00: number; r01: number; r02: number;
  r10: number; r11: number; r12: number;
  r20: number; r21: number; r22: number;
}

export interface VPSResult {
  success: boolean;
  /** Position on the floor plan (in floor coordinates) */
  x: number;
  y: number;
  /** Estimated accuracy in meters */
  accuracy: number;
  /** Raw Immersal position */
  raw?: { px: number; py: number; pz: number };
  /** Rotation matrix from Immersal VPS — use for camera orientation */
  rotation?: VPSRotationMatrix;
}

interface ImmersalResponse {
  error: string;
  success: boolean;
  map: number;
  px: number;
  py: number;
  pz: number;
  r00: number;
  r01: number;
  r02: number;
  r10: number;
  r11: number;
  r12: number;
  r20: number;
  r21: number;
  r22: number;
}

/**
 * Mapping config: converts Immersal 3D coords to floor plan 2D coords.
 * These values need calibration by scanning from known positions.
 *
 * Floor plan coords = scale * immersal_coords + offset
 *
 * Default values assume a rough 1:10 mapping (Immersal meters → floor plan units)
 * which matches the scaleFactor=10 used in the floor data.
 */
export interface VPSMappingConfig {
  /** Scale factor: floor plan units per Immersal meter (default: 10, matching scaleFactor) */
  scaleX: number;
  scaleY: number;
  /** Offset to align Immersal origin with floor plan origin */
  offsetX: number;
  offsetY: number;
  /** Which Immersal axis maps to floor plan X and Y
   * Default: immersal px → floor X, immersal pz → floor Y (typical top-down) */
  axisMapping: "xz" | "xy" | "yz";
}

export const DEFAULT_MAPPING: VPSMappingConfig = {
  scaleX: 10,
  scaleY: 10,
  offsetX: 400, // center of an 800-wide floor plan
  offsetY: 300, // center of a 600-high floor plan
  axisMapping: "xz",
};

const CALIBRATION_KEY = "vps_calibration";

/** Save calibration mapping to localStorage (per building/map) */
export function saveCalibration(mapId: string, config: VPSMappingConfig): void {
  try {
    const all = JSON.parse(localStorage.getItem(CALIBRATION_KEY) || "{}");
    all[mapId] = config;
    localStorage.setItem(CALIBRATION_KEY, JSON.stringify(all));
  } catch { /* localStorage unavailable */ }
}

/** Load calibration mapping from localStorage; returns null if not calibrated */
export function loadCalibration(mapId: string): VPSMappingConfig | null {
  try {
    const all = JSON.parse(localStorage.getItem(CALIBRATION_KEY) || "{}");
    return all[mapId] || null;
  } catch {
    return null;
  }
}

/**
 * Calculate calibration from 2+ known point pairs.
 * Each pair: { immersal: {px, py, pz}, floorPlan: {x, y} }
 * Returns the best-fit VPSMappingConfig.
 */
export function calculateCalibration(
  points: Array<{ immersal: { px: number; py: number; pz: number }; floorPlan: { x: number; y: number } }>,
  axisMapping: "xz" | "xy" | "yz" = "xz"
): VPSMappingConfig | null {
  if (points.length < 2) return null;

  // Extract the Immersal axis pair based on mapping
  const getAxes = (p: { px: number; py: number; pz: number }) => {
    switch (axisMapping) {
      case "xz": return { a: p.px, b: p.pz };
      case "xy": return { a: p.px, b: p.py };
      case "yz": return { a: p.py, b: p.pz };
    }
  };

  // Least-squares fit: floorX = scaleX * immA + offsetX
  //                    floorY = scaleY * immB + offsetY
  let sumA = 0, sumB = 0, sumFx = 0, sumFy = 0;
  let sumAA = 0, sumBB = 0, sumAFx = 0, sumBFy = 0;
  const n = points.length;

  for (const pt of points) {
    const { a, b } = getAxes(pt.immersal);
    sumA += a; sumB += b;
    sumFx += pt.floorPlan.x; sumFy += pt.floorPlan.y;
    sumAA += a * a; sumBB += b * b;
    sumAFx += a * pt.floorPlan.x; sumBFy += b * pt.floorPlan.y;
  }

  const denomX = n * sumAA - sumA * sumA;
  const denomY = n * sumBB - sumB * sumB;

  if (Math.abs(denomX) < 1e-10 || Math.abs(denomY) < 1e-10) return null;

  const scaleX = (n * sumAFx - sumA * sumFx) / denomX;
  const offsetX = (sumFx - scaleX * sumA) / n;
  const scaleY = (n * sumBFy - sumB * sumFy) / denomY;
  const offsetY = (sumFy - scaleY * sumB) / n;

  return { scaleX, scaleY, offsetX, offsetY, axisMapping };
}

/**
 * Capture a frame from the video element and encode as base64 PNG.
 * Downscales to 640px width for fast upload.
 */
function captureFrame(
  video: HTMLVideoElement
): { b64: string; width: number; height: number } | null {
  if (!video.videoWidth || !video.videoHeight) return null;

  const targetWidth = 640;
  const scale = targetWidth / video.videoWidth;
  const targetHeight = Math.round(video.videoHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

  // Get base64 PNG (strip the data:image/png;base64, prefix)
  const dataUrl = canvas.toDataURL("image/png");
  const b64 = dataUrl.split(",")[1];

  return { b64, width: targetWidth, height: targetHeight };
}

/**
 * Estimate camera intrinsics from frame dimensions.
 * For a typical phone camera with ~60° horizontal FoV:
 *   fx = fy ≈ width / (2 * tan(FoV/2))
 *   ox = width / 2, oy = height / 2
 */
function estimateIntrinsics(width: number, height: number) {
  const hFov = 60; // degrees, typical phone camera
  const fx = width / (2 * Math.tan(((hFov / 2) * Math.PI) / 180));
  const fy = fx; // Square pixels assumed
  return { fx, fy, ox: width / 2, oy: height / 2 };
}

/**
 * Convert Immersal 3D position to floor plan 2D coordinates.
 */
function immersalToFloorPlan(
  px: number,
  py: number,
  pz: number,
  mapping: VPSMappingConfig
): { x: number; y: number } {
  let immX: number, immY: number;

  switch (mapping.axisMapping) {
    case "xz":
      immX = px;
      immY = pz;
      break;
    case "xy":
      immX = px;
      immY = py;
      break;
    case "yz":
      immX = py;
      immY = pz;
      break;
  }

  return {
    x: immX * mapping.scaleX + mapping.offsetX,
    y: immY * mapping.scaleY + mapping.offsetY,
  };
}

/**
 * Perform a single VPS localization against the Immersal cloud.
 * Captures a frame from the video element, sends it to our API proxy,
 * and returns the floor plan position.
 */
export async function localizeVPS(
  video: HTMLVideoElement,
  mapping?: Partial<VPSMappingConfig>
): Promise<VPSResult> {
  const frame = captureFrame(video);
  if (!frame) {
    return { success: false, x: 0, y: 0, accuracy: 999 };
  }

  const { fx, fy, ox, oy } = estimateIntrinsics(frame.width, frame.height);

  const config: VPSMappingConfig = { ...DEFAULT_MAPPING, ...mapping };

  try {
    const res = await fetch("/api/vps/localize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        b64: frame.b64,
        fx,
        fy,
        ox,
        oy,
      }),
    });

    if (!res.ok) {
      return { success: false, x: 0, y: 0, accuracy: 999 };
    }

    const data: ImmersalResponse = await res.json();

    if (data.error !== "none" || !data.success) {
      return { success: false, x: 0, y: 0, accuracy: 999 };
    }

    const floorPos = immersalToFloorPlan(data.px, data.py, data.pz, config);

    // Estimate accuracy from the rotation matrix determinant quality
    // Perfect localization → det ≈ 1
    const det = Math.abs(
      data.r00 * (data.r11 * data.r22 - data.r12 * data.r21) -
      data.r01 * (data.r10 * data.r22 - data.r12 * data.r20) +
      data.r02 * (data.r10 * data.r21 - data.r11 * data.r20)
    );
    const accuracy = det > 0.9 ? 1.0 : det > 0.7 ? 2.5 : 5.0;

    return {
      success: true,
      x: floorPos.x,
      y: floorPos.y,
      accuracy,
      raw: { px: data.px, py: data.py, pz: data.pz },
      rotation: {
        r00: data.r00, r01: data.r01, r02: data.r02,
        r10: data.r10, r11: data.r11, r12: data.r12,
        r20: data.r20, r21: data.r21, r22: data.r22,
      },
    };
  } catch {
    return { success: false, x: 0, y: 0, accuracy: 999 };
  }
}
