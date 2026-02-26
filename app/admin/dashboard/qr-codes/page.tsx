"use client";
import { useEffect, useState } from "react";
import Image from "next/image";

interface Building {
  id: string;
  name: string;
  nodes: { id: string }[];
  pois: { id: string }[];
}

interface QRData {
  buildingId: string;
  buildingName: string;
  qrCode: string;
  navigationUrl: string;
  loading: boolean;
}

export default function QRCodesPage() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [qrCodes, setQRCodes] = useState<Record<string, QRData>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/buildings")
      .then((r) => r.json())
      .then((data) => {
        setBuildings(data);
        // Auto-generate QR for all buildings
        data.forEach((b: Building) => generateQR(b.id, b.name));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function generateQR(buildingId: string, name: string) {
    setQRCodes((prev) => ({
      ...prev,
      [buildingId]: {
        buildingId,
        buildingName: name,
        qrCode: "",
        navigationUrl: "",
        loading: true,
      },
    }));
    try {
      const res = await fetch(`/api/buildings/${buildingId}/qr`);
      const data = await res.json();
      setQRCodes((prev) => ({
        ...prev,
        [buildingId]: {
          buildingId,
          buildingName: name,
          qrCode: data.qrCode,
          navigationUrl: data.navigationUrl,
          loading: false,
        },
      }));
    } catch {
      setQRCodes((prev) => ({
        ...prev,
        [buildingId]: {
          ...prev[buildingId],
          loading: false,
        },
      }));
    }
  }

  function handlePrint(qr: QRData) {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QR Code - ${qr.buildingName}</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 40px; }
          img { max-width: 300px; margin: 20px auto; display: block; }
          h1 { font-size: 24px; margin-bottom: 5px; }
          p { color: #666; font-size: 14px; margin: 5px 0; }
          .url { font-size: 12px; color: #999; word-break: break-all; }
          .footer { margin-top: 30px; font-size: 11px; color: #aaa; }
          @media print {
            body { padding: 20px; }
          }
        </style>
      </head>
      <body>
        <h1>${qr.buildingName}</h1>
        <p>Scan to Navigate</p>
        <img src="${qr.qrCode}" alt="QR Code" />
        <p class="url">${qr.navigationUrl}</p>
        <p class="footer">Dubai Police Indoor Navigation System</p>
        <script>window.print();</script>
      </body>
      </html>
    `);
    win.document.close();
  }

  function handleDownload(qr: QRData) {
    const link = document.createElement("a");
    link.href = qr.qrCode;
    link.download = `qr-${qr.buildingId}.png`;
    link.click();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-[#c5a44e] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-gray-900 text-xl font-semibold">QR Codes</h2>
        <p className="text-gray-500 text-sm">
          Auto-generated for each building
        </p>
      </div>

      {buildings.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center shadow-sm">
          <p className="text-gray-500 text-lg">
            No buildings configured. Add a building first.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {buildings.map((b) => {
            const qr = qrCodes[b.id];
            return (
              <div
                key={b.id}
                className="bg-white border border-gray-200 rounded-xl p-6 text-center shadow-sm"
              >
                <h3 className="text-gray-900 font-semibold mb-1">{b.name}</h3>
                <p className="text-gray-500 text-xs mb-4">
                  {b.nodes?.length || 0} nodes · {b.pois?.length || 0} departments
                </p>

                {qr?.loading ? (
                  <div className="flex items-center justify-center h-48">
                    <div className="animate-spin w-6 h-6 border-2 border-[#c5a44e] border-t-transparent rounded-full" />
                  </div>
                ) : qr?.qrCode ? (
                  <>
                    <div className="bg-white rounded-lg p-4 inline-block mb-4">
                      <Image
                        src={qr.qrCode}
                        alt={`QR for ${b.name}`}
                        width={200}
                        height={200}
                      />
                    </div>
                    <p className="text-gray-600 text-xs mb-4 break-all">
                      {qr.navigationUrl}
                    </p>
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => handleDownload(qr)}
                        className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg text-blue-400 text-sm"
                      >
                        Download PNG
                      </button>
                      <button
                        onClick={() => handlePrint(qr)}
                        className="px-3 py-1.5 bg-[#c5a44e]/10 hover:bg-[#c5a44e]/20 border border-[#c5a44e]/30 rounded-lg text-[#c5a44e] text-sm"
                      >
                        Print
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-gray-500 text-sm">Failed to generate QR</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
