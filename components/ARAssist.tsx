"use client";

import { useEffect, useRef, useState } from "react";
import { useSettings } from "@/context/SettingsContext";
import { t } from "@/lib/i18n";

interface Props {
  /** Direction the user should go next */
  nextDirection: "straight" | "left" | "right" | "arrive";
  /** Human-readable instruction for this step */
  stepText: string;
  onClose: () => void;
}

/**
 * Fake AR view: shows camera feed with a directional arrow overlay.
 * No SLAM/VPS — purely visual overlay for direction cue.
 */
export default function ARAssist({ nextDirection, stepText, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { language } = useSettings();
  const [cameraError, setCameraError] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
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

  const arrowStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      fontSize: "120px",
      filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.5))",
      transition: "transform 0.3s ease",
    };
    switch (nextDirection) {
      case "left":
        return { ...base, transform: "rotate(-90deg)" };
      case "right":
        return { ...base, transform: "rotate(90deg)" };
      case "arrive":
        return { ...base };
      default:
        return { ...base, transform: "rotate(0deg)" };
    }
  };

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
        <div className="absolute inset-0 bg-gradient-to-b from-gray-800 to-gray-900 flex items-center justify-center text-white text-lg">
          📷 Camera not available — showing direction only
        </div>
      )}

      {/* Semi-transparent overlay */}
      <div className="absolute inset-0 bg-black/20" />

      {/* Directional arrow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div style={arrowStyle()}>
          {nextDirection === "arrive" ? "🏁" : "⬆️"}
        </div>
      </div>

      {/* Step instruction bar */}
      <div className="absolute bottom-24 left-4 right-4 bg-black/70 backdrop-blur-sm text-white p-5 rounded-2xl text-center text-lg font-medium">
        {stepText}
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 bg-white/90 text-black w-12 h-12 rounded-full flex items-center justify-center text-2xl font-bold shadow-lg z-10 hover:bg-white transition-colors"
        aria-label={t("nav.close", language)}
      >
        ×
      </button>

      {/* AR badge */}
      <div className="absolute top-6 left-6 bg-purple-600/90 text-white px-4 py-2 rounded-full text-sm font-semibold">
        {t("map.arAssist", language)}
      </div>
    </div>
  );
}
