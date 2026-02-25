import { Language } from "./i18n";

/** BCP-47 language codes to try for each supported language */
const langVoiceMap: Record<Language, string[]> = {
  en: ["en-US", "en-GB", "en"],
  ar: ["ar-SA", "ar-AE", "ar"],
  hi: ["hi-IN", "hi"],
};

/**
 * Speak text aloud using the Web Speech API.
 * Selects the best matching voice for the given language.
 * Resolves when speech finishes (or immediately if TTS is unavailable).
 */
export function speak(text: string, lang: Language): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve();
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const langCodes = langVoiceMap[lang];

    // Find best matching voice
    let voice: SpeechSynthesisVoice | null = null;
    for (const code of langCodes) {
      voice = voices.find((v) => v.lang.startsWith(code)) ?? null;
      if (voice) break;
    }

    if (voice) utterance.voice = voice;
    utterance.lang = langCodes[0];
    utterance.rate = 0.9;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();

    window.speechSynthesis.speak(utterance);
  });
}

/** Stop any currently playing speech */
export function stopSpeaking(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}
