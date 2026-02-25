"use client";

import Image from "next/image";

export default function QRPage() {
  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-center p-8 print:p-4">
      {/* Print-friendly QR display page */}
      <div className="max-w-md w-full border-4 border-[#c5a44e] rounded-3xl overflow-hidden bg-[#0a1628] shadow-2xl print:shadow-none">
        {/* Header */}
        <div className="text-center pt-8 pb-4 px-6">
          <div className="w-16 h-16 bg-[#c5a44e] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🏛️</span>
          </div>
          <h1 className="text-2xl font-bold text-white">
            Office 205
          </h1>
          <p className="text-[#c5a44e] text-sm mt-1 font-medium">
            مكتب 205
          </p>
          <div className="w-20 h-1 bg-[#c5a44e] mx-auto mt-4 rounded-full" />
        </div>

        {/* QR Code */}
        <div className="px-8 py-4">
          <div className="bg-white rounded-2xl p-6 flex items-center justify-center">
            <Image
              src="/qr-code.png"
              alt="QR Code - Scan for indoor navigation"
              width={400}
              height={400}
              className="w-full h-auto"
              priority
            />
          </div>
        </div>

        {/* Instructions */}
        <div className="text-center px-6 pb-8">
          <p className="text-white text-base font-semibold mb-1">
            Scan to navigate inside the office
          </p>
          <p className="text-gray-400 text-xs mb-3">
            امسح للتنقل الداخلي • इंडोर नेविगेशन के लिए स्कैन करें
          </p>
          <div className="flex items-center justify-center gap-3 text-xs text-gray-500">
            <span>English</span>
            <span className="text-[#c5a44e]">•</span>
            <span>العربية</span>
            <span className="text-[#c5a44e]">•</span>
            <span>हिन्दी</span>
          </div>
          <p className="text-[#c5a44e] text-xs mt-4 font-medium">
            ♿ Accessible for people of determination
          </p>
        </div>
      </div>

      {/* Print button (hidden when printing) */}
      <button
        onClick={() => window.print()}
        className="mt-8 bg-[#0a1628] text-white px-8 py-3 rounded-xl font-semibold hover:bg-[#0f1d35] transition-colors print:hidden"
      >
        🖨️ Print QR Code
      </button>
    </main>
  );
}
