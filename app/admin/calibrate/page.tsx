"use client";

import { useState, useRef, useCallback } from "react";
import { localizeVPS, calculateCalibration, saveCalibration, loadCalibration, DEFAULT_MAPPING } from "@/lib/vps";
import type { VPSMappingConfig } from "@/lib/vps";

interface CalibrationPoint {
  immersal: { px: number; py: number; pz: number };
  floorPlan: { x: number; y: number };
}

const MAP_ID = "142184"; // Immersal map ID

export default function CalibratePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [points, setPoints] = useState<CalibrationPoint[]>([]);
  const [floorX, setFloorX] = useState("");
  const [floorY, setFloorY] = useState("");
  const [scanning, setScanning] = useState(false);
  const [lastRaw, setLastRaw] = useState<{ px: number; py: number; pz: number } | null>(null);
  const [axisMapping, setAxisMapping] = useState<"xz" | "xy" | "yz">("xz");
  const [savedConfig, setSavedConfig] = useState<VPSMappingConfig | null>(
    () => loadCalibration(MAP_ID)
  );
  const [status, setStatus] = useState("");

  const openCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
    } catch {
      setStatus("Camera access denied. Use HTTPS and allow camera.");
    }
  }, []);

  const captureVPS = useCallback(async () => {
    if (!videoRef.current) return;
    setScanning(true);
    setStatus("Scanning with Immersal VPS...");

    try {
      const result = await localizeVPS(videoRef.current);
      if (result.success && result.raw) {
        setLastRaw(result.raw);
        setStatus(`VPS found: px=${result.raw.px.toFixed(3)}, py=${result.raw.py.toFixed(3)}, pz=${result.raw.pz.toFixed(3)}`);
      } else {
        setLastRaw(null);
        setStatus("VPS failed — point camera at a well-mapped area and try again.");
      }
    } catch {
      setStatus("VPS error — check network connection.");
    }

    setScanning(false);
  }, []);

  const addPoint = useCallback(() => {
    if (!lastRaw) return;
    const fx = parseFloat(floorX);
    const fy = parseFloat(floorY);
    if (isNaN(fx) || isNaN(fy)) {
      setStatus("Enter valid floor plan X and Y coordinates.");
      return;
    }

    setPoints((prev) => [...prev, { immersal: lastRaw, floorPlan: { x: fx, y: fy } }]);
    setLastRaw(null);
    setFloorX("");
    setFloorY("");
    setStatus(`Point added. Total: ${points.length + 1} points.`);
  }, [lastRaw, floorX, floorY, points.length]);

  const runCalibration = useCallback(() => {
    if (points.length < 4) {
      setStatus("Need at least 4 calibration points for reliable results.");
      return;
    }

    const result = calculateCalibration(points, axisMapping);
    if (!result) {
      setStatus("Calibration failed \u2014 points may be too close together.");
      return;
    }

    saveCalibration(MAP_ID, result.config);
    setSavedConfig(result.config);
    setStatus(
      `Calibration saved! scaleX=${result.config.scaleX.toFixed(2)}, scaleY=${result.config.scaleY.toFixed(2)}, ` +
      `offsetX=${result.config.offsetX.toFixed(1)}, offsetY=${result.config.offsetY.toFixed(1)}\n` +
      `Mean error: ${result.meanError.toFixed(1)}px | Per-point: [${result.pointErrors.map(e => e.toFixed(1)).join(", ")}]px`
    );
  }, [points, axisMapping]);

  const resetCalibration = useCallback(() => {
    saveCalibration(MAP_ID, DEFAULT_MAPPING);
    setSavedConfig(DEFAULT_MAPPING);
    setPoints([]);
    setLastRaw(null);
    setStatus("Reset to default calibration.");
  }, []);

  return (
    <div className="min-h-screen bg-[#0a1628] text-white p-4">
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold mb-2">VPS Calibration Tool</h1>
        <p className="text-gray-400 text-sm mb-6">
          Stand at known locations in the building, capture VPS readings, and enter the
          corresponding floor plan pixel coordinates. Minimum 2 points required.
        </p>

        {/* Camera */}
        <div className="mb-4">
          {!cameraActive ? (
            <button
              onClick={openCamera}
              className="bg-[#4285F4] text-white px-6 py-3 rounded-xl font-bold w-full"
            >
              📷 Open Camera
            </button>
          ) : (
            <div className="relative rounded-xl overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full rounded-xl"
              />
              <button
                onClick={captureVPS}
                disabled={scanning}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-purple-600 text-white px-6 py-2 rounded-full font-bold text-sm disabled:opacity-50"
              >
                {scanning ? "Scanning..." : "📡 Capture VPS Point"}
              </button>
            </div>
          )}
        </div>

        {/* Status */}
        {status && (
          <div className="bg-white/10 rounded-xl px-4 py-3 mb-4 text-sm">
            {status}
          </div>
        )}

        {/* Enter floor plan coordinates for last VPS capture */}
        {lastRaw && (
          <div className="bg-blue-900/30 border border-blue-500/30 rounded-xl p-4 mb-4">
            <p className="text-sm font-bold mb-2">
              Immersal: ({lastRaw.px.toFixed(3)}, {lastRaw.py.toFixed(3)}, {lastRaw.pz.toFixed(3)})
            </p>
            <p className="text-xs text-gray-400 mb-3">
              Enter the floor plan pixel coordinates for this location:
            </p>
            <div className="flex gap-2 mb-3">
              <input
                type="number"
                placeholder="Floor Plan X"
                value={floorX}
                onChange={(e) => setFloorX(e.target.value)}
                className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="number"
                placeholder="Floor Plan Y"
                value={floorY}
                onChange={(e) => setFloorY(e.target.value)}
                className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={addPoint}
              className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold text-sm w-full"
            >
              ✓ Add Calibration Point
            </button>
          </div>
        )}

        {/* Axis mapping selector */}
        <div className="mb-4">
          <label className="text-xs text-gray-400 block mb-1">Axis Mapping</label>
          <select
            value={axisMapping}
            onChange={(e) => setAxisMapping(e.target.value as "xz" | "xy" | "yz")}
            className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm w-full"
          >
            <option value="xz">XZ (default — top-down view)</option>
            <option value="xy">XY</option>
            <option value="yz">YZ</option>
          </select>
        </div>

        {/* Collected points */}
        {points.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-bold mb-2">Calibration Points ({points.length})</h3>
            <div className="space-y-2">
              {points.map((pt, i) => (
                <div key={i} className="bg-white/5 rounded-lg px-3 py-2 text-xs flex justify-between">
                  <span>
                    Immersal: ({pt.immersal.px.toFixed(2)}, {pt.immersal.py.toFixed(2)}, {pt.immersal.pz.toFixed(2)})
                  </span>
                  <span className="text-green-400">
                    Floor: ({pt.floorPlan.x}, {pt.floorPlan.y})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Calculate & Save */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={runCalibration}
            disabled={points.length < 2}
            className="flex-1 bg-green-600 text-white px-4 py-3 rounded-xl font-bold disabled:opacity-40"
          >
            Calculate & Save ({points.length}/4+ points)
          </button>
          <button
            onClick={resetCalibration}
            className="bg-red-600/80 text-white px-4 py-3 rounded-xl font-bold"
          >
            Reset
          </button>
        </div>

        {/* Current calibration display */}
        {savedConfig && (
          <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-4">
            <h3 className="text-sm font-bold text-green-400 mb-2">Current Calibration</h3>
            <div className="text-xs space-y-1 font-mono">
              <p>scaleX: {savedConfig.scaleX.toFixed(4)}</p>
              <p>scaleY: {savedConfig.scaleY.toFixed(4)}</p>
              <p>offsetX: {savedConfig.offsetX.toFixed(2)}</p>
              <p>offsetY: {savedConfig.offsetY.toFixed(2)}</p>
              <p>axisMapping: {savedConfig.axisMapping}</p>
            </div>
          </div>
        )}

        <a href="/admin/dashboard" className="block text-center text-blue-400 text-sm mt-6">
          ← Back to Dashboard
        </a>
      </div>
    </div>
  );
}
