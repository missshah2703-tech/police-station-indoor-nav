"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

const QRScanner = dynamic(() => import("@/components/QRScanner"), { ssr: false });

export default function ScannerPage() {
  const router = useRouter();
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");

  function handleScan(data: string) {
    setScanResult(data);
    setError("");

    // Try to extract building ID from URL like /map/office-205 or /navigate/office-205
    const match = data.match(/\/(?:map|navigate)\/([a-zA-Z0-9_-]+)/);
    if (match) {
      // Auto-navigate after a short delay
      setTimeout(() => {
        router.push(`/map/${match[1]}`);
      }, 1500);
    }
  }

  function handleManualGo() {
    if (!manual.trim()) return;
    router.push(`/map/${manual.trim()}`);
  }

  function resetScanner() {
    setScanResult(null);
    setError("");
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900 mb-1">QR Code Scanner</h2>
        <p className="text-gray-500 text-sm mb-6">
          Scan a building QR code with your camera to navigate
        </p>

        {!scanResult ? (
          <QRScanner
            onScan={handleScan}
            onError={(e) => setError(e)}
          />
        ) : (
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/10 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
            </div>
            <h3 className="text-gray-900 font-semibold text-lg mb-2">QR Code Detected!</h3>
            <p className="text-gray-500 text-sm mb-1 break-all">{scanResult}</p>
            {scanResult.match(/\/(?:map|navigate)\/([a-zA-Z0-9_-]+)/) ? (
              <p className="text-[#c5a44e] text-sm mt-3">Navigating to map...</p>
            ) : (
              <p className="text-yellow-400 text-sm mt-3">
                This QR code doesn&apos;t contain a valid building URL
              </p>
            )}
            <button
              onClick={resetScanner}
              className="mt-6 px-6 py-2 bg-[#c5a44e] text-[#0a1628] rounded-lg font-semibold text-sm hover:bg-[#d4b35e] transition-colors"
            >
              Scan Another
            </button>
          </div>
        )}

        {error && (
          <p className="text-red-400 text-sm text-center mt-4">{error}</p>
        )}
      </div>

      {/* Manual Entry */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mt-4 shadow-sm">
        <h3 className="text-gray-900 font-semibold mb-3">Or enter Building ID manually</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="e.g. office-205"
            onKeyDown={(e) => e.key === "Enter" && handleManualGo()}
            className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#c5a44e]"
          />
          <button
            onClick={handleManualGo}
            className="px-5 py-2 bg-[#c5a44e] text-[#0a1628] rounded-lg font-semibold text-sm hover:bg-[#d4b35e] transition-colors"
          >
            Go
          </button>
        </div>
      </div>
    </div>
  );
}
