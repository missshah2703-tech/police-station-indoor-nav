"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { Language, isRTL } from "@/lib/i18n";

interface Settings {
  language: Language;
  accessibilityMode: boolean;
  largeText: boolean;
}

interface SettingsContextType extends Settings {
  setLanguage: (lang: Language) => void;
  setAccessibilityMode: (enabled: boolean) => void;
  setLargeText: (enabled: boolean) => void;
}

const defaultSettings: Settings = {
  language: "en",
  accessibilityMode: false,
  largeText: false,
};

const SettingsContext = createContext<SettingsContextType>({
  ...defaultSettings,
  setLanguage: () => {},
  setAccessibilityMode: () => {},
  setLargeText: () => {},
});

const STORAGE_KEY = "ps-map-settings";

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loaded, setLoaded] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setSettings(JSON.parse(stored));
    } catch {
      // localStorage unavailable or corrupt — use defaults
    }
    setLoaded(true);
  }, []);

  // Persist settings & apply global effects
  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));

    // RTL
    document.documentElement.dir = isRTL(settings.language) ? "rtl" : "ltr";
    document.documentElement.lang = settings.language;

    // Large text
    document.body.classList.toggle("large-text", settings.largeText);

    // Register service worker for PWA
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, [settings, loaded]);

  const value: SettingsContextType = {
    ...settings,
    setLanguage: (language) => setSettings((s) => ({ ...s, language })),
    setAccessibilityMode: (accessibilityMode) =>
      setSettings((s) => ({ ...s, accessibilityMode })),
    setLargeText: (largeText) => setSettings((s) => ({ ...s, largeText })),
  };

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
