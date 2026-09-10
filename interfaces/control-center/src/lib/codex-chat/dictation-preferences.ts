export type DictationLanguage = "browser" | "en-US" | "de-DE" | "ru-RU" | "fr-FR" | "it-IT" | "es-ES";

export const DICTATION_LANGUAGE_STORAGE_KEY = "pritha.codexDictationLanguage";
export const DICTATION_LANGUAGE_CHANGED_EVENT = "pritha:codex-dictation-language-changed";

export const DICTATION_LANGUAGE_OPTIONS: ReadonlyArray<{
  value: DictationLanguage;
  label: string;
  description: string;
}> = [
  {
    value: "browser",
    label: "Auto",
    description: "Use this browser's default recognition behavior. Multilingual detection varies by browser.",
  },
  { value: "ru-RU", label: "Русский", description: "Recognize Russian explicitly." },
  { value: "en-US", label: "English", description: "Recognize English explicitly." },
  { value: "de-DE", label: "Deutsch", description: "Recognize German explicitly." },
  { value: "fr-FR", label: "Français", description: "Recognize French explicitly." },
  { value: "it-IT", label: "Italiano", description: "Recognize Italian explicitly." },
  { value: "es-ES", label: "Español", description: "Recognize Spanish explicitly." },
];

export function isDictationLanguage(value: unknown): value is DictationLanguage {
  return DICTATION_LANGUAGE_OPTIONS.some((option) => option.value === value);
}

export function recognitionLanguageTag(value: DictationLanguage): string | null {
  return value === "browser" ? null : value;
}

export function readStoredDictationLanguage(): DictationLanguage {
  if (typeof window === "undefined") return "browser";
  try {
    const value = window.localStorage?.getItem(DICTATION_LANGUAGE_STORAGE_KEY);
    return isDictationLanguage(value) ? value : "browser";
  } catch {
    return "browser";
  }
}

export function writeStoredDictationLanguage(value: DictationLanguage) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(DICTATION_LANGUAGE_STORAGE_KEY, value);
  } catch {
    // A session-only preference remains active when browser storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(DICTATION_LANGUAGE_CHANGED_EVENT, { detail: value }));
}
