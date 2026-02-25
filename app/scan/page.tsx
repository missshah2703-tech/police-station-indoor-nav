"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSettings } from "@/context/SettingsContext";
import { t } from "@/lib/i18n";

export default function ScanPage() {
  const { language } = useSettings();
  const router = useRouter();
  const [buildingId, setBuildingId] = useState("");
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Simple camera preview for QR scan appearance
  useEffect(() => {
    if (!scanning) return;
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
        // Camera not available
      }
    }

    startCamera();
    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [scanning]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = buildingId.trim();
    if (id) {
      router.push(`/map/${encodeURIComponent(id)}?start=entrance`);
    }
  };

  return (
    <main className="min-h-screen flex flex-col bg-[#0a1628]">
      {/* Header */}
      <div className="px-5 pt-12 pb-4 flex items-center gap-3">
        <Link
          href="/"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-lg"
        >
          ←
        </Link>
        <h1 className="text-lg font-bold text-white">
          {t("scan.title", language)}
        </h1>
      </div>

      {/* Camera / QR Area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm">
          {/* QR Scanner visual */}
          <div
            className="relative w-64 h-64 mx-auto mb-8 rounded-3xl overflow-hidden border-2 border-[#c5a44e]/50 cursor-pointer"
            onClick={() => {
              setScanning(true);
              // In production, QR decode library would parse the code
              // For now, simulate by navigating to office after scan
              setTimeout(() => {
                router.push("/map/office-205?start=entrance");
              }, 2000);
            }}
          >
            {scanning ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-[#0f1d35] flex flex-col items-center justify-center">
                <span className="text-7xl mb-4">📷</span>
                <p className="text-gray-400 text-sm text-center px-4">
                  {t("scan.instruction", language)}
                </p>
              </div>
            )}
            {/* Scanner frame corners */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-[#c5a44e] rounded-tl-2xl" />
              <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-[#c5a44e] rounded-tr-2xl" />
              <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-[#c5a44e] rounded-bl-2xl" />
              <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-[#c5a44e] rounded-br-2xl" />
            </div>
            {scanning && (
              <div className="absolute inset-x-0 top-1/2 h-0.5 bg-[#c5a44e] animate-pulse" />
            )}
          </div>

          <p className="text-center text-gray-400 text-sm mb-6">
            {t("scan.or", language)}
          </p>

          {/* Manual entry fallback */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="text"
              value={buildingId}
              onChange={(e) => setBuildingId(e.target.value)}
              placeholder={t("scan.placeholder", language)}
              className="w-full px-4 py-3 bg-[#0f1d35] border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-[#c5a44e] focus:border-[#c5a44e] outline-none"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={!buildingId.trim()}
              className="w-full bg-[#c5a44e] text-[#0a1628] py-3 rounded-xl font-semibold text-base hover:bg-[#d4b35d] disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
            >
              {t("scan.submit", language)}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
