import { useSyncExternalStore } from "react";

/**
 * Player-facing settings (audio volumes + UI language). Persisted to
 * localStorage and exposed through a tiny subscribable store so both React
 * components (via {@link useSettings}) and the imperative audio layer
 * (see audio.ts) stay in sync when the user changes a slider.
 */

export type Language = "ru" | "en";

export type Settings = {
  // Multipliers in the 0..1 range applied on top of each sound's authored
  // base volume, so 1 reproduces the original mix exactly.
  musicVolume: number;
  effectsVolume: number;
  language: Language;
  languageSource: "auto" | "manual";
};

export const AVAILABLE_LANGUAGES: { id: Language; label: string }[] = [
  { id: "ru", label: "Русский" },
  { id: "en", label: "English" },
];

const STORAGE_KEY = "panzershrek.settings";

function getBrowserLanguage(): Language {
  if (typeof navigator === "undefined") return "en";

  const primaryLanguage =
    navigator.languages && navigator.languages.length > 0
      ? navigator.languages[0]
      : navigator.language;

  return primaryLanguage.toLowerCase().startsWith("ru") ? "ru" : "en";
}

const DEFAULT_SETTINGS: Settings = {
  musicVolume: 1,
  effectsVolume: 1,
  language: getBrowserLanguage(),
  languageSource: "auto",
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };

    const parsed = JSON.parse(raw) as Partial<Settings>;
    const languageSource =
      parsed.languageSource === "manual" ? "manual" : "auto";

    return {
      musicVolume:
        typeof parsed.musicVolume === "number"
          ? clamp01(parsed.musicVolume)
          : DEFAULT_SETTINGS.musicVolume,
      effectsVolume:
        typeof parsed.effectsVolume === "number"
          ? clamp01(parsed.effectsVolume)
          : DEFAULT_SETTINGS.effectsVolume,
      language: parsed.language === "en" || parsed.language === "ru"
        ? languageSource === "manual"
          ? parsed.language
          : getBrowserLanguage()
        : DEFAULT_SETTINGS.language,
      languageSource,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let currentSettings: Settings = loadSettings();
const listeners = new Set<() => void>();

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
  } catch {
    // Ignore quota / private-mode write failures; settings stay in memory.
  }
}

function update(patch: Partial<Settings>) {
  currentSettings = { ...currentSettings, ...patch };
  persist();
  for (const listener of listeners) listener();
}

export function getSettings(): Settings {
  return currentSettings;
}

export function getMusicVolume(): number {
  return currentSettings.musicVolume;
}

export function getEffectsVolume(): number {
  return currentSettings.effectsVolume;
}

export function setMusicVolume(value: number) {
  update({ musicVolume: clamp01(value) });
}

export function setEffectsVolume(value: number) {
  update({ effectsVolume: clamp01(value) });
}

export function setLanguage(language: Language) {
  update({ language, languageSource: "manual" });
}

export function subscribeSettings(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** React hook returning the live settings object. */
export function useSettings(): Settings {
  return useSyncExternalStore(
    subscribeSettings,
    getSettings,
    getSettings
  );
}
