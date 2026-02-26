"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import jsQR from "jsqr";

interface QRScannerProps {
  onScan: (data: string) => void;
  onError?: (error: string) => void;
  className?: string;
}

export default function QRScanner({ onScan, onError, className = "" }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const [active, setActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const streamRef = useRef<MediaStream | null>(null);
  const scannedRef = useRef(false);

  const stopCamera = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = 0;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError("");
    scannedRef.current = false;
    stopCamera();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setActive(true);
        scanFrame();
      }
    } catch (err) {
      // If environment camera fails, try user camera
      if (facingMode === "environment") {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          });
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
            setActive(true);
            scanFrame();
          }
        } catch {
          const msg = "Camera access denied or not available";
          setCameraError(msg);
          onError?.(msg);
        }
      } else {
        const msg = "Camera access denied or not available";
        setCameraError(msg);
        onError?.(msg);
      }
    }
  }, [facingMode, stopCamera, onError]);

  const scanFrame = useCallback(() => {
    if (scannedRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animationRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });

    if (code && code.data) {
      scannedRef.current = true;
      // Draw green box around detected QR
      ctx.strokeStyle = "#00ff00";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(code.location.topLeftCorner.x, code.location.topLeftCorner.y);
      ctx.lineTo(code.location.topRightCorner.x, code.location.topRightCorner.y);
      ctx.lineTo(code.location.bottomRightCorner.x, code.location.bottomRightCorner.y);
      ctx.lineTo(code.location.bottomLeftCorner.x, code.location.bottomLeftCorner.y);
      ctx.closePath();
      ctx.stroke();

      // Vibrate on mobile
      if (navigator.vibrate) navigator.vibrate(200);

      setTimeout(() => {
        onScan(code.data);
      }, 300);
      return;
    }

    animationRef.current = requestAnimationFrame(scanFrame);
  }, [onScan]);

  // Start scanning on mount
  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  // Restart when facing mode changes
  const toggleCamera = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  return (
    <div className={`relative ${className}`}>
      {/* Hidden canvas for frame processing */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera feed */}
      <div className="relative w-full aspect-square max-w-sm mx-auto rounded-2xl overflow-hidden bg-black border-2 border-[#c5a44e]/50">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />

        {/* Scanner overlay */}
        {active && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Semi-transparent overlay */}
            <div className="absolute inset-0 bg-black/30" />

            {/* Clear scanning area in center */}
            <div className="absolute inset-[15%] bg-transparent" style={{
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.4)",
            }} />

            {/* Corner markers */}
            <div className="absolute top-[15%] left-[15%] w-10 h-10 border-t-4 border-l-4 border-[#c5a44e] rounded-tl-lg" />
            <div className="absolute top-[15%] right-[15%] w-10 h-10 border-t-4 border-r-4 border-[#c5a44e] rounded-tr-lg" />
            <div className="absolute bottom-[15%] left-[15%] w-10 h-10 border-b-4 border-l-4 border-[#c5a44e] rounded-bl-lg" />
            <div className="absolute bottom-[15%] right-[15%] w-10 h-10 border-b-4 border-r-4 border-[#c5a44e] rounded-br-lg" />

            {/* Scanning line animation */}
            <div
              className="absolute left-[15%] right-[15%] h-0.5 bg-[#c5a44e]"
              style={{
                animation: "scanline 2s ease-in-out infinite",
                top: "15%",
              }}
            />
          </div>
        )}

        {/* Error state */}
        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.5">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            <p className="text-red-500 text-sm text-center px-4 mb-4">{cameraError}</p>
            <button
              onClick={startCamera}
              className="px-4 py-2 bg-[#c5a44e] text-[#0a1628] rounded-lg font-semibold text-sm"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading state */}
        {!active && !cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50">
            <div className="animate-spin w-8 h-8 border-4 border-[#c5a44e] border-t-transparent rounded-full mb-3" />
            <p className="text-gray-500 text-sm">Starting camera...</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex justify-center gap-4 mt-4">
        <button
          onClick={toggleCamera}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg text-gray-700 text-sm transition-colors"
          title="Switch camera"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          Flip Camera
        </button>
        <button
          onClick={() => { scannedRef.current = false; startCamera(); }}
          className="flex items-center gap-2 px-4 py-2 bg-[#c5a44e]/10 hover:bg-[#c5a44e]/20 border border-[#c5a44e]/30 rounded-lg text-[#c5a44e] text-sm transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 4v6h6M23 20v-6h-6" />
            <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
          </svg>
          Rescan
        </button>
      </div>

      {/* CSS animation for scan line */}
      <style jsx>{`
        @keyframes scanline {
          0%, 100% { top: 15%; }
          50% { top: calc(85% - 2px); }
        }
      `}</style>
    </div>
  );
}
