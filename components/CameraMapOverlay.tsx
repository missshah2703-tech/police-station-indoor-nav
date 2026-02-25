"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useSettings } from "@/context/SettingsContext";
import { t } from "@/lib/i18n";
import { Floor, MapNode, RouteStep } from "@/lib/types";

interface Props {
  floor: Floor;
  route: string[] | null;
  routeSteps: RouteStep[];
  currentStepIndex: number;
  onClose: () => void;
}

/**
 * Camera AR view: Shows the camera feed with a semi-transparent
 * indoor floor plan overlay + route path + POI markers.
 * Activated when phone is held upright (camera facing forward).
 */
export default function CameraMapOverlay({
  floor,
  route,
  routeSteps,
  currentStepIndex,
  onClose,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { language } = useSettings();
  const [cameraError, setCameraError] = useState(false);
  const [deviceBeta, setDeviceBeta] = useState(90); // default upright

  const nodeMap = useMemo(
    () => new Map(floor.nodes.map((n) => [n.id, n])),
    [floor]
  );

  // Start camera
  useEffect(() => {
    let stream: MediaStream | null = null;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        setCameraError(true);
      }
    }

    startCamera();
    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // Track device orientation for subtle parallax
  useEffect(() => {
    function handleOrientation(e: DeviceOrientationEvent) {
      if (e.beta !== null) setDeviceBeta(e.beta);
    }
    window.addEventListener("deviceorientation", handleOrientation);
    return () => window.removeEventListener("deviceorientation", handleOrientation);
  }, []);

  // Draw floor plan overlay on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Scale floor coords to canvas (with padding)
    const padX = W * 0.08;
    const padY = H * 0.15;
    const scaleX = (W - padX * 2) / floor.width;
    const scaleY = (H - padY * 2) / floor.height;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = (W - floor.width * scale) / 2;
    const offsetY = (H - floor.height * scale) / 2;

    function toCanvas(x: number, y: number): [number, number] {
      return [offsetX + x * scale, offsetY + y * scale];
    }

    // Draw semi-transparent floor plan outline
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#4fc3f7";
    ctx.lineWidth = 2;
    const [ox, oy] = toCanvas(0, 0);
    const [ex, ey] = toCanvas(floor.width, floor.height);
    ctx.fillRect(ox, oy, ex - ox, ey - oy);
    ctx.strokeRect(ox, oy, ex - ox, ey - oy);
    ctx.restore();

    // Draw corridor lines (all edges)
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = "#90caf9";
    ctx.lineWidth = scale * 18;
    ctx.lineCap = "round";
    for (const edge of floor.edges) {
      const fromNode = nodeMap.get(edge.from);
      const toNode = nodeMap.get(edge.to);
      if (!fromNode || !toNode) continue;

      const [fx, fy] = toCanvas(fromNode.x, fromNode.y);
      const [tx, ty] = toCanvas(toNode.x, toNode.y);
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
    ctx.restore();

    // Draw route path (bright blue dashed)
    if (route && route.length > 1) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = "#2979ff";
      ctx.lineWidth = 4;
      ctx.setLineDash([12, 6]);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      for (let i = 0; i < route.length; i++) {
        const node = nodeMap.get(route[i]);
        if (!node) continue;
        const [px, py] = toCanvas(node.x, node.y);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Animated dot on current position
      const currentNodeId = route[Math.min(currentStepIndex, route.length - 1)];
      const currentNode = nodeMap.get(currentNodeId);
      if (currentNode) {
        const [cx, cy] = toCanvas(currentNode.x, currentNode.y);
        ctx.setLineDash([]);
        // Outer glow
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "#2979ff";
        ctx.beginPath();
        ctx.arc(cx, cy, 16, 0, Math.PI * 2);
        ctx.fill();
        // Inner dot
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#2962ff";
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.fill();
        // White center
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    // Draw POI markers
    ctx.save();
    for (const poi of floor.pois) {
      const node = nodeMap.get(poi.nodeId);
      if (!node) continue;
      const [px, py] = toCanvas(node.x, node.y);

      // Circle background
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#1565c0";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Emoji icon
      ctx.globalAlpha = 1;
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(poi.icon, px, py + 1);

      // Label below
      ctx.font = "bold 9px Arial, sans-serif";
      ctx.fillStyle = "#1565c0";
      ctx.globalAlpha = 0.9;
      const label = node.label[language] || node.label.en;
      ctx.fillText(label, px, py + 28);
    }
    ctx.restore();

    // Direction arrow at center (large, semi-transparent)
    if (routeSteps.length > 0 && currentStepIndex < routeSteps.length) {
      const step = routeSteps[currentStepIndex];
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.font = "80px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const centerX = W / 2;
      const centerY = H * 0.3;

      ctx.translate(centerX, centerY);
      if (step.direction === "left") ctx.rotate(-Math.PI / 2);
      else if (step.direction === "right") ctx.rotate(Math.PI / 2);

      ctx.fillText(
        step.direction === "arrive" ? "🏁" : "⬆️",
        0, 0
      );
      ctx.restore();
    }

  }, [floor, route, routeSteps, currentStepIndex, nodeMap, language]);

  // Current step text
  const stepText = routeSteps[currentStepIndex]
    ? routeSteps[currentStepIndex].text[language] ||
      Object.values(routeSteps[currentStepIndex].text)[0] || ""
    : "";

  return (
    <div className="fixed inset-0 z-[9999] bg-black">
      {/* Camera feed */}
      {!cameraError ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-gray-900 to-black flex items-center justify-center">
          <p className="text-white/70 text-center px-8">
            📷 Camera not available<br />
            <span className="text-sm">Floor plan overlay shown below</span>
          </p>
        </div>
      )}

      {/* Floor plan overlay canvas */}
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{
          // Subtle parallax based on device tilt
          transform: `perspective(600px) rotateX(${Math.max(0, Math.min(15, (deviceBeta - 60) * 0.3))}deg)`,
          transition: "transform 0.15s ease-out",
        }}
      />

      {/* Step instruction bar */}
      {stepText && (
        <div className="absolute bottom-28 left-4 right-4 bg-black/70 backdrop-blur-md text-white p-4 rounded-2xl text-center">
          <p className="text-lg font-semibold">{stepText}</p>
          <p className="text-xs text-white/50 mt-1">
            {currentStepIndex + 1} / {routeSteps.length}
          </p>
        </div>
      )}

      {/* Navigation step buttons */}
      <div className="absolute bottom-8 left-4 right-4 flex gap-3">
        <button
          onClick={() => {/* handled by parent */}}
          disabled={currentStepIndex <= 0}
          className="flex-1 bg-white/20 backdrop-blur-sm text-white py-3 rounded-xl font-medium disabled:opacity-30"
        >
          ← Prev
        </button>
        <button
          onClick={() => {/* handled by parent */}}
          disabled={currentStepIndex >= routeSteps.length - 1}
          className="flex-1 bg-white/20 backdrop-blur-sm text-white py-3 rounded-xl font-medium disabled:opacity-30"
        >
          Next →
        </button>
      </div>

      {/* Mode indicator */}
      <div className="absolute top-6 left-6 bg-blue-600/90 backdrop-blur-sm text-white px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-2">
        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        AR Camera View
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 bg-white/90 text-black w-12 h-12 rounded-full flex items-center justify-center text-2xl font-bold shadow-lg z-10"
        aria-label="Close"
      >
        ×
      </button>
    </div>
  );
}
