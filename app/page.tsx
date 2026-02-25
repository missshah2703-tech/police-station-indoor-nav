"use client";

import Link from "next/link";
import { useSettings } from "@/context/SettingsContext";
import { t, Language, languageNames } from "@/lib/i18n";

export default function HomePage() {
  const { language, setLanguage, accessibilityMode } = useSettings();

  return (
    <main className="min-h-screen flex flex-col bg-[#0a1628]">
      {/* Top section with branding */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-8">
        {/* UAE Police crest/logo area */}
        <div className="w-28 h-28 bg-[#c5a44e] rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl">
          <span className="text-6xl">🏛️</span>
        </div>
        <h1 className="text-2xl font-bold text-white text-center">
          {t("app.title", language)}
        </h1>
        <p className="text-gray-400 mt-2 text-center text-sm">
          {t("app.subtitle", language)}
        </p>

        {/* Language selector */}
        <div className="flex gap-2 mt-6">
          {(["en", "ar", "hi"] as Language[]).map((lang) => (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all ${
                language === lang
                  ? "bg-[#c5a44e] text-[#0a1628] shadow-lg"
                  : "bg-white/10 text-gray-300 hover:bg-white/20"
              }`}
            >
              {languageNames[lang]}
            </button>
          ))}
        </div>

        {accessibilityMode && (
          <div className="mt-4 bg-green-900/40 text-green-300 px-4 py-2 rounded-full text-xs font-medium">
            ♿ {t("map.accessibility", language)}
          </div>
        )}
      </div>

      {/* Bottom action section */}
      <div className="px-6 pb-10 space-y-3 max-w-sm mx-auto w-full">
        {/* Primary action: Scan QR */}
        <Link
          href="/scan"
          className="flex items-center gap-4 bg-[#c5a44e] text-[#0a1628] p-5 rounded-2xl shadow-lg hover:bg-[#d4b35d] transition-colors"
        >
          <div className="w-14 h-14 bg-[#0a1628]/10 rounded-xl flex items-center justify-center text-3xl">
            📷
          </div>
          <div>
            <div className="font-bold text-lg">
              {t("scan.title", language)}
            </div>
            <div className="text-sm text-[#0a1628]/70">
              {t("scan.or", language)}
            </div>
          </div>
        </Link>

        {/* Quick access: Office 205 */}
        <Link
          href="/map/office-205?start=entrance"
          className="flex items-center gap-4 bg-white/10 text-white p-4 rounded-2xl hover:bg-white/15 transition-colors"
        >
          <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center text-2xl">
            🏢
          </div>
          <div>
            <div className="font-semibold text-sm">Office 205</div>
            <div className="text-xs text-gray-400">Open office floor map</div>
          </div>
        </Link>

        {/* Settings */}
        <Link
          href="/settings"
          className="flex items-center gap-4 bg-white/10 text-white p-4 rounded-2xl hover:bg-white/15 transition-colors"
        >
          <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center text-2xl">
            ⚙️
          </div>
          <div>
            <div className="font-semibold text-sm">
              {t("settings.title", language)}
            </div>
            <div className="text-xs text-gray-400">
              {t("settings.language", language)},{" "}
              {t("settings.accessibility", language)}
            </div>
          </div>
        </Link>
      </div>
    </main>
  );
}
