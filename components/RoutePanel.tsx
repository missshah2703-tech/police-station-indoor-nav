"use client";

import { useState, useRef } from "react";
import { RouteStep } from "@/lib/types";
import { useSettings } from "@/context/SettingsContext";
import { t } from "@/lib/i18n";
import { speak, stopSpeaking } from "@/lib/tts";

interface Props {
  steps: RouteStep[];
  totalDistance: number;
  onClose: () => void;
  onStartAR: () => void;
}

const dirIcon: Record<RouteStep["direction"], string> = {
  start: "📍",
  straight: "⬆️",
  left: "⬅️",
  right: "➡️",
  arrive: "🏁",
};

export default function RoutePanel({
  steps,
  totalDistance,
  onClose,
  onStartAR,
}: Props) {
  const { language } = useSettings();
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const activeRef = useRef(false);

  const startNavigation = async () => {
    setIsNavigating(true);
    activeRef.current = true;

    for (let i = 0; i < steps.length; i++) {
      if (!activeRef.current) break;
      setCurrentStep(i);

      const text =
        steps[i].text[language] || Object.values(steps[i].text)[0] || "";
      await speak(text, language);

      if (!activeRef.current) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    setIsNavigating(false);
    activeRef.current = false;
  };

  const stopNavigation = () => {
    activeRef.current = false;
    stopSpeaking();
    setIsNavigating(false);
    setCurrentStep(0);
  };

  return (
    <div className="bg-white rounded-t-2xl shadow-2xl border-t border-gray-200 p-4 max-h-[50vh] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-bold text-lg text-gray-900">
            {t("map.steps", language)}
          </h3>
          <p className="text-sm text-gray-500">
            {t("map.distance", language)}: {totalDistance}
            {t("map.meters", language)}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-700 text-2xl w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100"
          aria-label={t("nav.close", language)}
        >
          ×
        </button>
      </div>

      {/* Step list */}
      <div className="space-y-2 mb-4">
        {steps.map((step, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
              isNavigating && i === currentStep
                ? "bg-blue-50 border border-blue-200"
                : "bg-gray-50"
            }`}
          >
            <span className="text-xl flex-shrink-0">
              {dirIcon[step.direction]}
            </span>
            <span className="flex-1 text-gray-800">
              {step.text[language] || Object.values(step.text)[0]}
            </span>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {!isNavigating ? (
          <button
            onClick={startNavigation}
            className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors"
          >
            🔊 {t("map.startNav", language)}
          </button>
        ) : (
          <button
            onClick={stopNavigation}
            className="flex-1 bg-red-600 text-white py-3 rounded-xl font-semibold hover:bg-red-700 active:bg-red-800 transition-colors"
          >
            ⏹ {t("map.stopNav", language)}
          </button>
        )}
        <button
          onClick={onStartAR}
          className="bg-purple-600 text-white py-3 px-4 rounded-xl font-semibold hover:bg-purple-700 active:bg-purple-800 transition-colors"
        >
          📷
        </button>
      </div>
    </div>
  );
}
