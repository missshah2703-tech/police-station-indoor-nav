"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { Floor, RouteStep } from "@/lib/types";
import { useSettings } from "@/context/SettingsContext";
import { t } from "@/lib/i18n";
import { speak, stopSpeaking } from "@/lib/tts";
import { useIndoorPosition } from "@/lib/useIndoorPosition";
import { localizeVPS, loadCalibration } from "@/lib/vps";
import type { VPSRotationMatrix } from "@/lib/vps";
import ThreeARScene from "@/components/ThreeARScene";

const GoogleMapView = dynamic(() => import("@/components/GoogleMapView"), { ssr: false });

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
  const arContainerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

  // Heading diff for HTML HUD
  const [headingDiff, setHeadingDiff] = useState<number | null>(null);

  // VPS rotation matrix for Three.js camera orientation
  const [vpsRotation, setVpsRotation] = useState<VPSRotationMatrix | null>(null);

  // Continuous VPS localization state
  const vpsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
  const lastSpokenStepRef = useRef(-1);
  const lastHeadingAlertRef = useRef(0);
  const arrivedRef = useRef(false);
  const {
    position: livePosition,
    heading: liveHeading,
    routeHeading,
    currentSegment,
    stepCount,
    distanceWalked,
    sensorsAvailable,
    confidence,
    source: positionSource,
    isOffRoute,
    recalibrateToNode,
    setManualPosition,
    applyBeaconFix,
    currentStepLength,
  } = useIndoorPosition({
      routePoints,
      segmentDistances,
      onSegmentAdvance: (seg) => {
        if (seg < routeSteps.length) setCurrentStep(seg);
      },
      active: trackingActive,
      onRouteDeviation: (deviation) => {
        speak(t("nav.offRoute", language), language);
        recalibrateToNode(Math.min(currentStep + 1, routePoints.length - 1));
      },
    });

  // ── Distance to next turn point ──
  const distanceToNextTurn = useMemo(() => {
    // Sum remaining distance in current segment + look ahead
    let remaining = 0;
    for (let i = currentStep; i < routeSteps.length; i++) {
      remaining += routeSteps[i].distance;
      if (i > currentStep && routeSteps[i].direction !== "straight") break;
    }
    return Math.max(0, Math.round(remaining - (distanceWalked - segmentDistances.slice(0, currentStep).reduce((a, b) => a + b, 0))));
  }, [currentStep, routeSteps, distanceWalked, segmentDistances]);

  // ── LIVE VOICE ENGINE ──
  // Speaks instructions as user walks, auto-advances
  useEffect(() => {
    if (!trackingActive) return;
    if (currentStep === lastSpokenStepRef.current) return;

    lastSpokenStepRef.current = currentStep;

    const step = routeSteps[currentStep];
    if (!step) return;

    const text = step.text[language] || Object.values(step.text)[0] || "";
    speak(text, language);

    // Check if arrived at destination
    if (step.direction === "arrive" && !arrivedRef.current) {
      arrivedRef.current = true;
    }
  }, [currentStep, trackingActive, routeSteps, language]);

  // ── HEADING COMPARISON — Wrong direction detection ──
  useEffect(() => {
    if (!trackingActive || liveHeading === null || routeHeading === null) return;

    const now = Date.now();
    // Only alert every 5 seconds to avoid spamming
    if (now - lastHeadingAlertRef.current < 5000) return;

    // Calculate heading difference (normalize to -180..180)
    let diff = liveHeading - routeHeading;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;

    const absDiff = Math.abs(diff);

    if (absDiff > 120) {
      // Facing completely wrong direction
      lastHeadingAlertRef.current = now;
      speak(t("nav.turnAround", language), language);
    } else if (absDiff > 60) {
      // Facing somewhat wrong
      lastHeadingAlertRef.current = now;
      if (diff > 0) {
        speak(t("nav.slightLeft", language), language);
      } else {
        speak(t("nav.slightRight", language), language);
      }
    }
  }, [trackingActive, liveHeading, routeHeading, language]);

  // ── CONTINUOUS VPS LOCALIZATION — auto every 3 seconds ──
  useEffect(() => {
    if (!trackingActive || cameraState !== "active") {
      // Clear interval when not tracking or camera off
      if (vpsIntervalRef.current) {
        clearInterval(vpsIntervalRef.current);
        vpsIntervalRef.current = null;
      }
      return;
    }

    const mapId = floor.immersalMapId || "142184"; // Use floor's map ID or fallback
    const calibration = loadCalibration(mapId);
    const mapping = calibration
      ? { scaleX: calibration.scaleX, scaleY: calibration.scaleY, offsetX: calibration.offsetX, offsetY: calibration.offsetY, axisMapping: calibration.axisMapping }
      : { offsetX: floor.width / 2, offsetY: floor.height / 2 };

    let mounted = true;

    const doVPS = async () => {
      if (!videoRef.current || !mounted) return;
      try {
        const result = await localizeVPS(videoRef.current, mapping);
        if (!mounted) return; // Component unmounted during await
        if (result.success && result.accuracy <= 2.5) {
          applyBeaconFix({ x: result.x, y: result.y }, result.accuracy);
          if (result.rotation) {
            setVpsRotation(result.rotation);
          }
        }
      } catch { /* ignore transient VPS errors */ }
    };

    // Run VPS immediately, then every 3 seconds
    doVPS();
    vpsIntervalRef.current = setInterval(doVPS, 3000);

    return () => {
      mounted = false;
      if (vpsIntervalRef.current) {
        clearInterval(vpsIntervalRef.current);
        vpsIntervalRef.current = null;
      }
    };
  }, [trackingActive, cameraState, applyBeaconFix, floor.width, floor.height]);

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
      // Auto-start live navigation with voice when camera opens
      if (!navActive.current) {
        setIsNavigating(true);
        navActive.current = true;
        lastSpokenStepRef.current = -1;
        arrivedRef.current = false;
        if (routeSteps[0]) {
          const text = routeSteps[0].text[language] || Object.values(routeSteps[0].text)[0] || "";
          speak(text, language);
          lastSpokenStepRef.current = 0;
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Camera access denied";
      if (!window.isSecureContext) {
        setCameraError("Camera needs HTTPS. Open in Chrome: chrome://flags → search 'insecure origins' → add this URL.");
      } else {
        setCameraError(msg);
      }
      setCameraState("denied");
    }
  }, [routeSteps, language]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Draw AR overlay — Three.js 3D renderer handles this now
  // Just compute heading difference for HTML HUD warnings
  useEffect(() => {
    if (liveHeading === null || routeHeading === null) {
      setHeadingDiff(null);
      return;
    }
    let diff = liveHeading - routeHeading;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    setHeadingDiff(diff);
  }, [liveHeading, routeHeading]);

  // Computed values for the 3D scene
  const metersPerPx = 1 / (floor.scaleFactor ?? 10);

  // ── Live voice navigation (starts tracking + voice together) ──
  const startLiveNav = useCallback(() => {
    setIsNavigating(true);
    setTrackingActive(true);
    navActive.current = true;
    lastSpokenStepRef.current = -1;
    arrivedRef.current = false;
    // Speak the first instruction immediately
    if (routeSteps[0]) {
      const text = routeSteps[0].text[language] || Object.values(routeSteps[0].text)[0] || "";
      speak(text, language);
      lastSpokenStepRef.current = 0;
    }
  }, [routeSteps, language]);

  const stopLiveNav = useCallback(() => {
    navActive.current = false;
    stopSpeaking();
    setIsNavigating(false);
    setTrackingActive(false);
    setCurrentStep(0);
    lastSpokenStepRef.current = -1;
    arrivedRef.current = false;
  }, []);

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
          <>
            {/* Three.js 3D renderer — renders into arContainerRef */}
            <ThreeARScene
              containerRef={arContainerRef}
              routePoints={routePoints}
              currentStep={currentStep}
              metersPerPx={metersPerPx}
              heading={liveHeading}
              routeHeading={routeHeading}
              vpsRotation={vpsRotation}
              destinationName={destinationName}
              visible={cameraState === "active"}
              distanceWalked={distanceWalked}
              remainingDistance={remainingDistance}
              stepCount={stepCount}
              totalDistance={totalDistance}
              currentDirection={currentDirection}
              distanceToNextTurn={distanceToNextTurn}
            />

            {/* ─── HTML HUD Overlays (over 3D scene) ─── */}

            {/* Destination label (top) */}
            <div className="absolute top-[3%] left-0 right-0 z-20 flex justify-center pointer-events-none">
              <div className="bg-[#4285F4]/92 backdrop-blur-sm px-6 py-2 rounded-full border border-white/30 shadow-lg shadow-blue-500/20">
                <span className="text-white font-bold text-sm">
                  → {destinationName}
                </span>
              </div>
            </div>

            {/* Wrong direction warning */}
            {headingDiff !== null && Math.abs(headingDiff) > 120 && (
              <div className="absolute top-[11%] left-[8%] right-[8%] z-20 pointer-events-none">
                <div className="bg-red-600/92 backdrop-blur-md rounded-2xl px-4 py-3 text-center shadow-lg">
                  <span className="text-white font-bold text-[15px]">
                    ⚠ Turn Around — Wrong Direction!
                  </span>
                </div>
              </div>
            )}
            {headingDiff !== null && Math.abs(headingDiff) > 60 && Math.abs(headingDiff) <= 120 && (
              <div className="absolute top-[11%] left-[15%] right-[15%] z-20 pointer-events-none">
                <div className="bg-yellow-500/90 backdrop-blur-md rounded-xl px-4 py-2.5 text-center shadow-lg">
                  <span className="text-black font-bold text-[13px]">
                    {headingDiff > 0 ? "↰ Turn Left to get on route" : "↱ Turn Right to get on route"}
                  </span>
                </div>
              </div>
            )}

            {/* Next turn indicator */}
            {currentStep < routeSteps.length - 1 && routeSteps[currentStep + 1] && routeSteps[currentStep + 1].direction !== "straight" && (
              <div className="absolute top-[70%] left-0 right-0 z-20 flex justify-center pointer-events-none">
                <div className="bg-black/70 backdrop-blur-md rounded-xl px-5 py-2 shadow-lg border border-white/10">
                  <span className="text-white font-bold text-[13px]">
                    {routeSteps[currentStep + 1].direction === "left" ? "↰" : routeSteps[currentStep + 1].direction === "right" ? "↱" : routeSteps[currentStep + 1].direction === "arrive" ? "🏁" : "⬆"}{" "}
                    In ~{distanceToNextTurn}m
                  </span>
                </div>
              </div>
            )}

            {/* Distance progress bar */}
            <div className="absolute top-[80%] left-[4%] right-[4%] z-20 pointer-events-none">
              <div className="bg-black/78 backdrop-blur-md rounded-2xl px-4 py-3 shadow-xl">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-[#4285F4] font-bold text-base">{Math.round(distanceWalked)}m</span>
                    <span className="text-white/50 text-[9px] ml-1">walked</span>
                  </div>
                  <span className="text-white/50 text-[9px]">👣 {stepCount}</span>
                  <div>
                    <span className="text-white font-bold text-base">{remainingDistance}m</span>
                    <span className="text-white/50 text-[9px] ml-1">left</span>
                  </div>
                </div>
                <div className="w-full h-1 bg-white/15 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${totalDistance > 0 ? Math.min((distanceWalked / totalDistance) * 100, 100) : 0}%`,
                      background: "linear-gradient(to right, #4285F4, #34A853)",
                    }}
                  />
                </div>
              </div>
            </div>
          </>
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
        {/* Dubai Police Logo */}
        <img src="/dubai-police-logo.png" alt="" className="w-8 h-8 rounded-md object-contain bg-white/90" />
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
            <GoogleMapView
              floor={floor}
              route={route}
              selectedPoi={route[route.length - 1]}
              onSelectPoi={() => {}}
              livePosition={trackingActive ? livePosition : null}
              liveHeading={liveHeading}
              confidence={confidence}
              autoFollow={trackingActive}
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

      {/* ═══ VPS Status + Recalibrate ═══ */}
      {trackingActive && (
        <div className="relative z-30 mx-3 mb-2 flex justify-center gap-2">
          {cameraState === "active" && vpsRotation && (
            <div className="bg-green-600/80 text-white px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-300 animate-pulse" />
              VPS Active
            </div>
          )}
          {cameraState === "active" && !vpsRotation && (
            <div className="bg-purple-500/80 text-white px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              VPS Scanning...
            </div>
          )}
          {confidence < 0.5 && (
            <button
              onClick={() => recalibrateToNode(currentStep)}
              className="bg-yellow-500/90 text-black px-5 py-2 rounded-full text-xs font-bold flex items-center gap-2 shadow-lg shadow-yellow-500/30"
            >
              📍 Recalibrate
            </button>
          )}
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
            <div className="flex-1 min-w-0">
              <p className="text-sm leading-snug font-medium">
                {routeSteps[currentStep].text[language] ||
                  Object.values(routeSteps[currentStep].text)[0]}
              </p>
              {trackingActive && currentStep < routeSteps.length - 1 && distanceToNextTurn > 0 && (
                <p className="text-[10px] text-blue-300 mt-0.5">
                  Next turn in ~{distanceToNextTurn}m
                </p>
              )}
            </div>
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
              onClick={startLiveNav}
              className="bg-[#4285F4] text-white px-5 py-3 rounded-xl font-bold text-sm hover:bg-[#3b78e7] transition-colors shadow-lg shadow-blue-500/30"
            >
              🔊 {t("map.startNav", language)}
            </button>
          ) : (
            <button
              onClick={stopLiveNav}
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
  destinationName,
}: {
  direction: string;
  step?: RouteStep;
  language: string;
  destinationName: string;
}) {
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
            className="rounded-full bg-[#4285F4] animate-pulse"
            style={{
              width: `${14 - i * 2}px`,
              height: `${14 - i * 2}px`,
              opacity,
              boxShadow: `0 0 ${10 - i}px rgba(66, 133, 244, 0.5)`,
            }}
          />
        ))}
      </div>

      {/* Big arrow circle */}
      <div
        className="relative animate-pulse"
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
