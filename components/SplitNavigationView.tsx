"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { Floor, RouteStep } from "@/lib/types";
import { useSettings } from "@/context/SettingsContext";
import { t } from "@/lib/i18n";
import { speak, stopSpeaking } from "@/lib/tts";
import { useIndoorPosition } from "@/lib/useIndoorPosition";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

interface Props {
  floor: Floor;
  route: string[];
  routeSteps: RouteStep[];
  totalDistance: number;
  destinationName: string;
  onClose: () => void;
}

/**
 * SplitNavigationView — Full-screen AR camera with:
 *   - Blue AR dots on the floor forming a walking path
 *   - Large directional arrow floating in the scene
 *   - Floating "Go to [destination]" label
 *   - Small mini-map widget (bottom-left corner)
 *   - Bottom nav bar with destination + controls
 */
export default function SplitNavigationView({
  floor,
  route,
  routeSteps,
  totalDistance,
  destinationName,
  onClose,
}: Props) {
  const { language } = useSettings();
  const [currentStep, setCurrentStep] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false);
  const navActive = useRef(false);
  const [showMiniMap, setShowMiniMap] = useState(true);

  // Camera state
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<"prompt" | "active" | "denied">("prompt");
  const [cameraError, setCameraError] = useState("");

  // AR canvas
  const arCanvasRef = useRef<HTMLCanvasElement>(null);
  const arContainerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

  // Pulse animation
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      setPulse(frame);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const nodeMap = useMemo(
    () => new Map(floor.nodes.map((n) => [n.id, n])),
    [floor]
  );

  // Route points (x,y) and segment distances for live tracking
  const routePoints = useMemo(() => {
    return route.map((id) => {
      const node = nodeMap.get(id);
      return node ? { x: node.x, y: node.y } : { x: 0, y: 0 };
    });
  }, [route, nodeMap]);

  const segmentDistances = useMemo(() => {
    return routeSteps.map((s) => s.distance);
  }, [routeSteps]);

  // Live indoor position tracking
  const [trackingActive, setTrackingActive] = useState(false);
  const {
    position: livePosition,
    heading: liveHeading,
    routeHeading,
    stepCount,
    distanceWalked,
    sensorsAvailable,
    confidence,
    source: positionSource,
    isOffRoute,
    recalibrateToNode,
    setManualPosition,
    currentStepLength,
  } = useIndoorPosition({
      routePoints,
      segmentDistances,
      onSegmentAdvance: (seg) => {
        if (seg < routeSteps.length) setCurrentStep(seg);
      },
      active: trackingActive,
      onRouteDeviation: (deviation) => {
        // Could trigger voice alert: "You may be off route"
        console.warn(`Route deviation: ${deviation.toFixed(1)}m`);
      },
    });

  // Remaining distance
  const remainingDistance = Math.max(0, Math.round(totalDistance - distanceWalked));

  // Compute direction angle for current step
  const currentDirection = useMemo(() => {
    if (!routeSteps[currentStep]) return "straight";
    return routeSteps[currentStep].direction;
  }, [routeSteps, currentStep]);

  // Open camera on user request
  const openCamera = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError("Camera not supported. Try Chrome/Safari browser.");
      setCameraState("denied");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraError("");
      setCameraState("active");
      setTrackingActive(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Camera access denied";
      if (!window.isSecureContext) {
        setCameraError("Camera needs HTTPS. Open in Chrome: chrome://flags → search 'insecure origins' → add this URL.");
      } else {
        setCameraError(msg);
      }
      setCameraState("denied");
    }
  }, []);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Draw AR overlay — Google Maps style live navigation on camera
  useEffect(() => {
    if (cameraState !== "active") return;

    const canvas = arCanvasRef.current;
    const container = arContainerRef.current;
    if (!canvas || !container) return;

    function draw() {
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);

      const W = rect.width;
      const H = rect.height;
      ctx.clearRect(0, 0, W, H);

      // Progress ratio (how far along the route)
      const progress = totalDistance > 0 ? Math.min(distanceWalked / totalDistance, 1) : 0;

      // ─── Blue AR dots on floor (perspective path) ───
      // Dots "scroll forward" as you walk — offset based on distance walked
      const dotCount = 14;
      const dotBaseRadius = 7;
      const pathCenterX = W / 2;
      const dotScrollOffset = (distanceWalked * 30) % 40; // scroll animation based on real walking

      for (let i = 0; i < dotCount; i++) {
        const rawProgress = i / (dotCount - 1);
        const adjustedY = H * 0.95 - rawProgress * H * 0.55 - dotScrollOffset * rawProgress;
        const y = Math.max(H * 0.15, Math.min(H * 0.95, adjustedY));

        const perspectiveShift = currentDirection === "left"
          ? -rawProgress * W * 0.3
          : currentDirection === "right"
            ? rawProgress * W * 0.3
            : 0;
        const x = pathCenterX + perspectiveShift;

        const scale = 1 - rawProgress * 0.65;
        const radius = dotBaseRadius * scale;
        const waveOffset = (pulse * 0.1 + i * 0.4) % (Math.PI * 2);
        const alpha = 0.5 + Math.sin(waveOffset) * 0.25;

        // Floor glow (ellipse shadow below dot)
        ctx.save();
        ctx.globalAlpha = alpha * 0.25;
        ctx.fillStyle = "#4285F4";
        ctx.beginPath();
        ctx.ellipse(x, y + radius * 0.5, radius * 2.5, radius * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        // Bright dot
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#4285F4";
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        // White center highlight
        ctx.globalAlpha = alpha + 0.15;
        ctx.fillStyle = "#a8cdff";
        ctx.beginPath();
        ctx.arc(x, y - radius * 0.2, radius * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // ─── Large directional arrow ───
      const arrowCenterX = W / 2 + (currentDirection === "left" ? -W * 0.18 : currentDirection === "right" ? W * 0.18 : 0);
      const arrowCenterY = H * 0.28;
      const arrowSize = Math.min(W, H) * 0.17;
      const pulseScale = 1 + Math.sin(pulse * 0.1) * 0.04;

      ctx.save();
      ctx.translate(arrowCenterX, arrowCenterY);
      ctx.scale(pulseScale, pulseScale);

      let rotation = 0;
      if (currentDirection === "left") rotation = -Math.PI / 2;
      if (currentDirection === "right") rotation = Math.PI / 2;
      ctx.rotate(rotation);

      if (currentDirection === "arrive") {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "#34A853";
        ctx.beginPath();
        ctx.arc(0, 0, arrowSize * 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = "#34A853";
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, arrowSize * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 6;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        const cs = arrowSize * 0.3;
        ctx.moveTo(-cs, 0);
        ctx.lineTo(-cs * 0.3, cs * 0.7);
        ctx.lineTo(cs, -cs * 0.5);
        ctx.stroke();
      } else if (currentDirection === "start") {
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = "#4285F4";
        ctx.beginPath();
        ctx.arc(0, 0, arrowSize * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#4285F4";
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, arrowSize * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.font = `${arrowSize * 0.5}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🚶", 0, 2);
      } else {
        // Shadow
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.ellipse(0, arrowSize * 0.55, arrowSize * 0.6, arrowSize * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
        // Glow
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = "#4285F4";
        ctx.beginPath();
        ctx.arc(0, 0, arrowSize * 1.2, 0, Math.PI * 2);
        ctx.fill();
        // Circle
        ctx.globalAlpha = 0.95;
        const arrowGrad = ctx.createRadialGradient(0, -arrowSize * 0.2, 0, 0, 0, arrowSize * 0.8);
        arrowGrad.addColorStop(0, "#5c9cff");
        arrowGrad.addColorStop(1, "#2a6dd9");
        ctx.fillStyle = arrowGrad;
        ctx.strokeStyle = "rgba(255,255,255,0.6)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, arrowSize * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Arrow shape
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "rgba(0,0,0,0.3)";
        ctx.shadowBlur = 4;
        ctx.beginPath();
        const aw = arrowSize * 0.4;
        const ah = arrowSize * 0.55;
        ctx.moveTo(0, -ah);
        ctx.lineTo(-aw, ah * 0.1);
        ctx.lineTo(-aw * 0.35, ah * 0.1);
        ctx.lineTo(-aw * 0.35, ah);
        ctx.lineTo(aw * 0.35, ah);
        ctx.lineTo(aw * 0.35, ah * 0.1);
        ctx.lineTo(aw, ah * 0.1);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      ctx.restore();

      // ─── Floating "Go to [Destination]" label ───
      ctx.save();
      const labelY = H * 0.12;
      const labelText = `Go ${destinationName}`;
      ctx.font = "bold 17px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      const labelW = ctx.measureText(labelText).width;
      const pillW = labelW + 32;
      const pillH = 38;
      const pillX = W / 2 - pillW / 2;
      ctx.fillStyle = "rgba(66, 133, 244, 0.88)";
      ctx.beginPath();
      ctx.roundRect(pillX, labelY - pillH / 2, pillW, pillH, 19);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(labelText, W / 2, labelY);
      ctx.restore();

      // ─── LIVE DISTANCE BAR (Google Maps style — bottom of camera) ───
      ctx.save();
      const barY = H * 0.82;
      const barW = W * 0.85;
      const barH = 56;
      const barX = (W - barW) / 2;

      // Background
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, barH, 16);
      ctx.fill();

      // Progress bar track
      const trackX = barX + 14;
      const trackY = barY + barH - 14;
      const trackW = barW - 28;
      const trackH = 5;
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.beginPath();
      ctx.roundRect(trackX, trackY, trackW, trackH, 3);
      ctx.fill();

      // Progress bar fill (blue)
      const fillW = trackW * progress;
      if (fillW > 0) {
        const progGrad = ctx.createLinearGradient(trackX, 0, trackX + fillW, 0);
        progGrad.addColorStop(0, "#4285F4");
        progGrad.addColorStop(1, "#34A853");
        ctx.fillStyle = progGrad;
        ctx.beginPath();
        ctx.roundRect(trackX, trackY, Math.max(fillW, 6), trackH, 3);
        ctx.fill();

        // Glowing dot at tip
        ctx.fillStyle = "#34A853";
        ctx.beginPath();
        ctx.arc(trackX + fillW, trackY + trackH / 2, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Left side — walked distance
      ctx.fillStyle = "#4285F4";
      ctx.font = "bold 18px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(`${Math.round(distanceWalked)}m`, barX + 14, barY + 8);

      // "walked" label
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "10px -apple-system, sans-serif";
      ctx.fillText("walked", barX + 14 + ctx.measureText(`${Math.round(distanceWalked)}m`).width + 4, barY + 14);

      // Right side — remaining
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`${remainingDistance}m`, barX + barW - 14, barY + 8);

      // "left" label
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "10px -apple-system, sans-serif";
      const remTextW = ctx.measureText(`${remainingDistance}m`).width;
      ctx.textAlign = "right";
      ctx.fillText("left", barX + barW - 14 - remTextW - 4, barY + 14);

      // Center — step count
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "12px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`👣 ${stepCount} steps`, W / 2, barY + 12);

      ctx.restore();

      animFrameRef.current = requestAnimationFrame(draw);
    }

    animFrameRef.current = requestAnimationFrame(draw);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [cameraState, currentDirection, routeSteps, currentStep, pulse, destinationName, distanceWalked, remainingDistance, stepCount, totalDistance]);

  // Voice navigation
  const startVoiceNav = async () => {
    setIsNavigating(true);
    setTrackingActive(true);
    navActive.current = true;
    for (let i = 0; i < routeSteps.length; i++) {
      if (!navActive.current) break;
      setCurrentStep(i);
      const text =
        routeSteps[i].text[language] ||
        Object.values(routeSteps[i].text)[0] ||
        "";
      await speak(text, language);
      if (!navActive.current) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    setIsNavigating(false);
    navActive.current = false;
  };

  const stopVoiceNav = () => {
    navActive.current = false;
    stopSpeaking();
    setIsNavigating(false);
    setCurrentStep(0);
  };

  const dirIcon: Record<string, string> = {
    start: "📍",
    straight: "⬆️",
    left: "↩️",
    right: "↪️",
    arrive: "🏁",
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-black relative">
      {/* ═══ FULL-SCREEN CAMERA / AR VIEW ═══ */}
      <div
        ref={arContainerRef}
        className="absolute inset-0 z-0"
      >
        {/* Camera permission prompt */}
        {cameraState === "prompt" && (
          <div className="absolute inset-0 bg-gradient-to-b from-[#0f1d35] to-[#0a1628] flex flex-col items-center justify-center z-10 px-6">
            <div className="w-24 h-24 rounded-full bg-[#4285F4]/20 flex items-center justify-center mb-6 animate-pulse">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
            <h3 className="text-white font-bold text-xl mb-2 text-center">
              AR Navigation
            </h3>
            <p className="text-gray-400 text-sm text-center mb-8 max-w-[260px]">
              Point your camera at the hallway and follow the blue path dots to your destination
            </p>
            {/* Privacy disclosure */}
            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 mb-6 max-w-[280px]">
              <p className="text-gray-400 text-[10px] text-center leading-relaxed">
                🔒 <strong className="text-gray-300">Privacy:</strong> Camera feed is processed on-device only. No images, video frames, or sensor data are stored, logged, or transmitted. All data is discarded when you close navigation.
              </p>
            </div>
            <button
              onClick={openCamera}
              className="bg-[#4285F4] text-white px-10 py-4 rounded-2xl font-bold text-base hover:bg-[#3b78e7] transition-colors shadow-lg shadow-blue-500/30"
            >
              📷 Start AR Navigation
            </button>
            <button
              onClick={() => { setCameraState("denied"); setTrackingActive(true); }}
              className="mt-4 text-gray-500 text-xs underline"
            >
              Skip — use map only
            </button>
          </div>
        )}

        {/* Camera denied — dark bg with arrow */}
        {cameraState === "denied" && (
          <div className="absolute inset-0 bg-gradient-to-b from-[#0f1d35] to-[#0a1628] flex flex-col items-center justify-center z-10">
            <ARArrowStatic
              direction={currentDirection}
              step={routeSteps[currentStep]}
              language={language}
              pulse={pulse}
              destinationName={destinationName}
            />
            {cameraError && (
              <p className="mt-4 text-red-400 text-xs text-center px-6 max-w-[280px]">
                ⚠️ {cameraError}
              </p>
            )}
            <button
              onClick={openCamera}
              className="mt-4 text-[#4285F4] text-sm font-medium bg-white/10 px-5 py-2.5 rounded-full"
            >
              📷 Try Camera
            </button>
          </div>
        )}

        {/* Camera video (full screen behind canvas) */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={
            cameraState === "active"
              ? "absolute inset-0 w-full h-full object-cover"
              : "hidden"
          }
        />

        {/* AR overlay canvas */}
        {cameraState === "active" && (
          <canvas
            ref={arCanvasRef}
            className="absolute inset-0 w-full h-full z-10"
          />
        )}

        {/* Live tracking badge — Google Maps style + confidence */}
        {trackingActive && cameraState === "active" && (
          <div className="absolute top-14 right-2 z-30 flex flex-col items-end gap-1.5">
            <div className="bg-black/70 backdrop-blur-md rounded-2xl px-3.5 py-2 flex items-center gap-2 border border-green-400/30">
              <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.6)]" />
              <span className="text-green-300 text-xs font-bold tracking-wider">
                LIVE
              </span>
            </div>
            {/* Confidence indicator */}
            <div className={`bg-black/70 backdrop-blur-md rounded-xl px-3 py-1.5 flex items-center gap-2 border ${
              confidence > 0.6 ? "border-green-500/30" : confidence > 0.3 ? "border-yellow-500/30" : "border-red-500/30"
            }`}>
              <div className="w-12 h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    confidence > 0.6 ? "bg-green-400" : confidence > 0.3 ? "bg-yellow-400" : "bg-red-400"
                  }`}
                  style={{ width: `${Math.round(confidence * 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-300">
                {Math.round(confidence * 100)}%
              </span>
            </div>
          </div>
        )}

        {/* Off-route warning banner */}
        {isOffRoute && trackingActive && (
          <div className="absolute top-14 left-2 right-16 z-30">
            <div className="bg-red-600/90 backdrop-blur-md rounded-2xl px-4 py-2.5 flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <div className="flex-1">
                <p className="text-white text-xs font-bold">Off Route</p>
                <p className="text-red-200 text-[10px]">Tap recalibrate to fix position</p>
              </div>
              <button
                onClick={() => recalibrateToNode(currentStep)}
                className="bg-white/20 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg"
              >
                Fix
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══ TOP BAR (floating over camera) ═══ */}
      <div className="relative z-30 bg-black/50 backdrop-blur-md text-white px-4 py-2.5 flex items-center gap-3 safe-area-top shrink-0">
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-lg"
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-gray-300 uppercase tracking-wide">
            {t("nav.navigatingTo", language)}
          </p>
          <h2 className="font-bold text-sm truncate">{destinationName}</h2>
        </div>
        {trackingActive ? (
          <div className="text-right flex items-center gap-3">
            <div>
              <p className="text-[10px] text-blue-300 uppercase tracking-wide">walked</p>
              <p className="font-bold text-sm text-blue-400">{Math.round(distanceWalked)}m</p>
            </div>
            <div className="w-px h-7 bg-white/20" />
            <div>
              <p className="text-[10px] text-gray-300 uppercase tracking-wide">left</p>
              <p className="font-bold text-sm text-[#c5a44e]">{remainingDistance}m</p>
            </div>
          </div>
        ) : (
          <div className="text-right">
            <p className="text-[10px] text-gray-300 uppercase tracking-wide">
              {t("map.distance", language)}
            </p>
            <p className="font-bold text-sm text-[#c5a44e]">
              {totalDistance}{t("map.meters", language)}
            </p>
          </div>
        )}
      </div>

      {/* Spacer to push bottom elements down */}
      <div className="flex-1" />

      {/* ═══ MINI MAP (floating bottom-left) ═══ */}
      {showMiniMap && (
        <div className="relative z-30 mx-3 mb-2">
          <div className="w-36 h-28 rounded-2xl overflow-hidden border-2 border-white/30 shadow-2xl shadow-black/50 relative">
            <MapView
              floor={floor}
              route={route}
              selectedPoi={route[route.length - 1]}
              onSelectPoi={() => {}}
              livePosition={trackingActive ? livePosition : null}
              liveHeading={liveHeading}
              confidence={confidence}
            />
            {/* Tap to expand hint */}
            <button
              onClick={() => setShowMiniMap(false)}
              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center z-[1001]"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Show mini-map toggle if hidden */}
      {!showMiniMap && (
        <button
          onClick={() => setShowMiniMap(true)}
          className="relative z-30 mx-3 mb-2 w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm border border-white/20 text-white text-lg flex items-center justify-center"
        >
          🗺️
        </button>
      )}

      {/* ═══ Recalibrate button (floating above bottom bar) ═══ */}
      {trackingActive && confidence < 0.5 && (
        <div className="relative z-30 mx-3 mb-2 flex justify-center">
          <button
            onClick={() => recalibrateToNode(currentStep)}
            className="bg-yellow-500/90 text-black px-5 py-2 rounded-full text-xs font-bold flex items-center gap-2 shadow-lg shadow-yellow-500/30"
          >
            📍 Recalibrate Position
          </button>
        </div>
      )}

      {/* ═══ BOTTOM NAV BAR ═══ */}
      <div className="relative z-30 bg-black/60 backdrop-blur-xl text-white px-4 py-3 safe-area-bottom shrink-0">
        {/* Step instruction */}
        {routeSteps[currentStep] && (
          <div className="flex items-center gap-3 mb-3 bg-white/10 rounded-2xl px-4 py-3">
            <span className="text-2xl flex-shrink-0">
              {dirIcon[routeSteps[currentStep].direction] || "📍"}
            </span>
            <p className="text-sm flex-1 leading-snug font-medium">
              {routeSteps[currentStep].text[language] ||
                Object.values(routeSteps[currentStep].text)[0]}
            </p>
            <span className="text-xs text-[#c5a44e] font-bold flex-shrink-0 bg-white/10 px-2.5 py-1 rounded-lg">
              {currentStep + 1}/{routeSteps.length}
            </span>
          </div>
        )}

        {/* Destination bar + controls */}
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-white/10 rounded-xl px-4 py-2.5 flex items-center gap-2">
            <span className="text-lg">📍</span>
            <span className="text-sm font-semibold truncate">{destinationName}</span>
          </div>
          {!isNavigating ? (
            <button
              onClick={startVoiceNav}
              className="bg-[#4285F4] text-white px-5 py-3 rounded-xl font-bold text-sm hover:bg-[#3b78e7] transition-colors shadow-lg shadow-blue-500/30"
            >
              🔊 {t("map.startNav", language)}
            </button>
          ) : (
            <button
              onClick={stopVoiceNav}
              className="bg-red-600 text-white px-5 py-3 rounded-xl font-bold text-sm hover:bg-red-700 transition-colors"
            >
              ⏹ Stop
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Static AR Arrow for when camera is denied */
function ARArrowStatic({
  direction,
  step,
  language,
  pulse,
  destinationName,
}: {
  direction: string;
  step?: RouteStep;
  language: string;
  pulse: number;
  destinationName: string;
}) {
  const scale = 1 + Math.sin(pulse * 0.12) * 0.06;

  let rotation = "0deg";
  if (direction === "left") rotation = "-90deg";
  if (direction === "right") rotation = "90deg";

  const dirIcon: Record<string, string> = {
    start: "📍",
    straight: "⬆️",
    left: "↩️",
    right: "↪️",
    arrive: "🏁",
  };

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Floating destination label */}
      <div className="bg-[#4285F4]/85 backdrop-blur-sm px-6 py-2.5 rounded-full border border-white/30">
        <span className="text-white font-bold text-base">Go {destinationName}</span>
      </div>

      {/* Blue dots trail (static version) */}
      <div className="flex flex-col items-center gap-2 my-2">
        {[0.3, 0.4, 0.5, 0.6, 0.7].map((opacity, i) => (
          <div
            key={i}
            className="rounded-full bg-[#4285F4]"
            style={{
              width: `${14 - i * 2}px`,
              height: `${14 - i * 2}px`,
              opacity: opacity + Math.sin(pulse * 0.12 + i * 0.5) * 0.2,
              boxShadow: `0 0 ${10 - i}px rgba(66, 133, 244, 0.5)`,
            }}
          />
        ))}
      </div>

      {/* Big arrow circle */}
      <div
        className="relative"
        style={{ transform: `scale(${scale})`, transition: "transform 0.1s" }}
      >
        <div className="absolute inset-0 rounded-full bg-[#4285F4]/20 scale-[1.5]" />
        <div
          className="w-32 h-32 rounded-full bg-gradient-to-b from-[#5c9cff] to-[#2a6dd9] flex items-center justify-center shadow-2xl shadow-blue-500/40 border-4 border-white/30"
          style={{ transform: `rotate(${rotation})` }}
        >
          {direction === "arrive" ? (
            <span className="text-5xl">✓</span>
          ) : direction === "start" ? (
            <span className="text-5xl">🚶</span>
          ) : (
            <svg width="64" height="64" viewBox="0 0 24 24" fill="white">
              <path d="M12 2L6 12h3.5v10h5V12H18L12 2z" />
            </svg>
          )}
        </div>
      </div>

      {/* Current step instruction */}
      {step && (
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-5 py-3 max-w-[280px] text-center">
          <span className="text-2xl block mb-1">
            {dirIcon[direction] || "📍"}
          </span>
          <p className="text-white text-sm font-medium leading-snug">
            {step.text[language] || Object.values(step.text)[0]}
          </p>
        </div>
      )}
    </div>
  );
}
