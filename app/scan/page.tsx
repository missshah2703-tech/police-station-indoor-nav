"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSettings } from "@/context/SettingsContext";
import { t } from "@/lib/i18n";

const QRScanner = dynamic(() => import("@/components/QRScanner"), { ssr: false });

export default function ScanPage() {
  const { language } = useSettings();
  const router = useRouter();
  const [buildingId, setBuildingId] = useState("");
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);

  function handleScan(data: string) {
    setScanResult(data);
    // Extract building ID from URL like /map/office-205 or /navigate/office-205
    const match = data.match(/\/(?:map|navigate)\/([a-zA-Z0-9_-]+)/);
    if (match) {
      setTimeout(() => {
        router.push(`/map/${match[1]}?start=entrance`);
      }, 1000);
    }
  }

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
          {scanResult ? (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">✅</div>
              <h3 className="text-white font-semibold text-lg mb-2">QR Code Detected!</h3>
              <p className="text-gray-400 text-sm mb-1 break-all">{scanResult}</p>
              {scanResult.match(/\/(?:map|navigate)\/([a-zA-Z0-9_-]+)/) ? (
                <p className="text-[#c5a44e] text-sm mt-3">Navigating to map...</p>
              ) : (
                <p className="text-yellow-400 text-sm mt-3">
                  This QR code doesn&apos;t contain a valid building URL
                </p>
              )}
              <button
                onClick={() => { setScanResult(null); setShowScanner(true); }}
                className="mt-6 px-6 py-2 bg-[#c5a44e] text-[#0a1628] rounded-lg font-semibold text-sm hover:bg-[#d4b35e] transition-colors"
              >
                Scan Another
              </button>
            </div>
          ) : showScanner ? (
            <QRScanner onScan={handleScan} />
          ) : (
            <div
              className="relative w-64 h-64 mx-auto mb-8 rounded-3xl overflow-hidden border-2 border-[#c5a44e]/50 cursor-pointer"
              onClick={() => setShowScanner(true)}
            >
              <div className="w-full h-full bg-[#0f1d35] flex flex-col items-center justify-center">
                <span className="text-7xl mb-4">📷</span>
                <p className="text-gray-400 text-sm text-center px-4">
                  {t("scan.instruction", language)}
                </p>
              </div>
              {/* Scanner frame corners */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-[#c5a44e] rounded-tl-2xl" />
                <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-[#c5a44e] rounded-tr-2xl" />
                <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-[#c5a44e] rounded-bl-2xl" />
                <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-[#c5a44e] rounded-br-2xl" />
              </div>
            </div>
          )}

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
