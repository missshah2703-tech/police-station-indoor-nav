"use client";

import { useState } from "react";
import Link from "next/link";
import { useSettings } from "@/context/SettingsContext";
import { t, Language, languageNames } from "@/lib/i18n";

export default function SettingsPage() {
  const {
    language,
    setLanguage,
    accessibilityMode,
    setAccessibilityMode,
    largeText,
    setLargeText,
  } = useSettings();

  return (
    <main className="min-h-screen p-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/"
          className="text-blue-600 hover:text-blue-800 font-medium"
        >
          ← {t("nav.home", language)}
        </Link>
        <h1 className="text-xl font-bold text-gray-900">
          {t("settings.title", language)}
        </h1>
      </div>

      <div className="space-y-6">
        {/* Language */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <label className="block font-semibold text-gray-800 mb-3">
            🌐 {t("settings.language", language)}
          </label>
          <div className="flex gap-2">
            {(["en", "ar", "hi"] as Language[]).map((lang) => (
              <button
                key={lang}
                onClick={() => setLanguage(lang)}
                className={`flex-1 py-3 rounded-xl font-medium transition-colors ${
                  language === lang
                    ? "bg-blue-600 text-white shadow-md"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {languageNames[lang]}
              </button>
            ))}
          </div>
        </div>

        {/* Accessibility mode */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-gray-800">
                ♿ {t("settings.accessibility", language)}
              </div>
              <div className="text-sm text-gray-500 mt-1">
                {language === "en" && "Avoids stairs, finds wheelchair-friendly routes"}
                {language === "ar" && "يتجنب السلالم ويجد مسارات مناسبة للكراسي المتحركة"}
                {language === "hi" && "सीढ़ियों से बचता है, व्हीलचेयर-अनुकूल मार्ग खोजता है"}
              </div>
            </div>
            <button
              role="switch"
              aria-checked={accessibilityMode}
              onClick={() => setAccessibilityMode(!accessibilityMode)}
              className={`relative w-14 h-8 rounded-full transition-colors ${
                accessibilityMode ? "bg-blue-600" : "bg-gray-300"
              }`}
            >
              <div
                className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                  accessibilityMode ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Large text */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-gray-800">
                🔤 {t("settings.largeText", language)}
              </div>
              <div className="text-sm text-gray-500 mt-1">
                {language === "en" && "Increases text size throughout the app"}
                {language === "ar" && "يزيد حجم النص في جميع أنحاء التطبيق"}
                {language === "hi" && "पूरे ऐप में टेक्स्ट का आकार बढ़ाता है"}
              </div>
            </div>
            <button
              role="switch"
              aria-checked={largeText}
              onClick={() => setLargeText(!largeText)}
              className={`relative w-14 h-8 rounded-full transition-colors ${
                largeText ? "bg-blue-600" : "bg-gray-300"
              }`}
            >
              <div
                className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                  largeText ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
