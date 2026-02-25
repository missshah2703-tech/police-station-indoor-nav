"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { Floor, RouteStep } from "@/lib/types";
import { useSettings } from "@/context/SettingsContext";
import { t } from "@/lib/i18n";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });
const CameraMapOverlay = dynamic(() => import("@/components/CameraMapOverlay"), { ssr: false });

interface Props {
  floor: Floor;
  route: string[] | null;
  routeSteps: RouteStep[];
  selectedPoi: string | null;
  onSelectPoi: (nodeId: string) => void;
}

type ViewMode = "map" | "camera";

/**
 * DualModeView — switches between two views based on phone tilt:
 *
 *  Phone UP (camera facing forward, beta > 55°) → Camera AR view
 *     Shows camera feed with floor plan overlay, route, and POI markers
 *
 *  Phone DOWN (tilted toward floor, beta < 55°) → 2D Map view
 *     Shows Google Maps-style dotted route on Leaflet map
 *
 * On desktop (no gyroscope), shows map view with a toggle button.
 */
export default function DualModeView({
  floor,
  route,
  routeSteps,
  selectedPoi,
  onSelectPoi,
}: Props) {
  const { language } = useSettings();
  const [mode, setMode] = useState<ViewMode>("map");
  const [hasGyro, setHasGyro] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const lastBetaRef = useRef(90);
  const switchCooldown = useRef(false);

  // Request device orientation permission (required on iOS 13+)
  const requestOrientationPermission = useCallback(async () => {
    const DOE = DeviceOrientationEvent as any;
    if (typeof DOE.requestPermission === "function") {
      try {
        const perm = await DOE.requestPermission();
        if (perm === "granted") {
          setPermissionGranted(true);
          setHasGyro(true);
        }
      } catch {
        // User denied — fall back to manual toggle
      }
    } else {
      // Android / non-iOS — no permission needed
      setPermissionGranted(true);
    }
  }, []);

  // Listen for device orientation
  useEffect(() => {
    if (!permissionGranted) return;

    let detected = false;

    function handleOrientation(e: DeviceOrientationEvent) {
      if (e.beta === null) return;
      if (!detected) {
        detected = true;
        setHasGyro(true);
      }

      lastBetaRef.current = e.beta;

      // Debounce mode switching to avoid flickering
      if (switchCooldown.current) return;

      const THRESHOLD_UP = 60;   // Switch to camera when beta > 60
      const THRESHOLD_DOWN = 45; // Switch to map when beta < 45
      // Hysteresis: different thresholds for up vs down to prevent jitter

      if (e.beta > THRESHOLD_UP && mode === "map") {
        setMode("camera");
        switchCooldown.current = true;
        setTimeout(() => { switchCooldown.current = false; }, 800);
      } else if (e.beta < THRESHOLD_DOWN && mode === "camera") {
        setMode("map");
        switchCooldown.current = true;
        setTimeout(() => { switchCooldown.current = false; }, 800);
      }
    }

    window.addEventListener("deviceorientation", handleOrientation);
    return () => window.removeEventListener("deviceorientation", handleOrientation);
  }, [permissionGranted, mode]);

  // Enable gyro button (shown once)
  const [showGyroPrompt, setShowGyroPrompt] = useState(true);

  return (
    <div className="relative w-full h-full">
      {/* MAP view (phone pointing down / default) */}
      {mode === "map" && (
        <div className="w-full h-full">
          <MapView
            floor={floor}
            route={route}
            selectedPoi={selectedPoi}
            onSelectPoi={onSelectPoi}
          />
        </div>
      )}

      {/* CAMERA view (phone pointing up/forward) */}
      {mode === "camera" && (
        <CameraMapOverlay
          floor={floor}
          route={route}
          routeSteps={routeSteps}
          currentStepIndex={currentStep}
          onClose={() => setMode("map")}
        />
      )}

      {/* Mode indicator pill (bottom center) */}
      {mode === "map" && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2">
          {/* Gyro permission prompt */}
          {showGyroPrompt && !hasGyro && (
            <button
              onClick={() => {
                requestOrientationPermission();
                setShowGyroPrompt(false);
              }}
              className="bg-purple-600 text-white px-5 py-2.5 rounded-full text-sm font-semibold shadow-lg animate-bounce"
            >
              📱 Enable tilt-to-switch (Camera ↔ Map)
            </button>
          )}

          {/* Manual toggle for desktop or fallback */}
          <div className="flex items-center bg-white/95 backdrop-blur-md rounded-full shadow-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setMode("map")}
              className="px-4 py-2.5 text-sm font-medium bg-blue-600 text-white"
            >
              🗺️ {t("nav.map", language)}
            </button>
            <button
              onClick={() => {
                if (!permissionGranted) requestOrientationPermission();
                setMode("camera");
              }}
              className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              📷 Camera
            </button>
          </div>

          {/* Gyro status */}
          {hasGyro && (
            <p className="text-xs text-gray-400 bg-white/80 px-3 py-1 rounded-full">
              📱 Tilt phone up → Camera • Tilt down → Map
            </p>
          )}
        </div>
      )}
    </div>
  );
}
