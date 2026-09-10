export const STICKY_CONTEXT_STORAGE_KEY = "pritha.voice.stickyContext.enabled";
export const STICKY_CONTEXT_CHANGED_EVENT = "pritha.voice.stickyContext.changed";

export function readStickyContextSetting(defaultValue = true) {
  if (typeof window === "undefined") return defaultValue;
  const raw = window.localStorage.getItem(STICKY_CONTEXT_STORAGE_KEY);
  if (raw === null) return defaultValue;
  return raw !== "0" && raw !== "false";
}

export function writeStickyContextSetting(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STICKY_CONTEXT_STORAGE_KEY, enabled ? "1" : "0");
  window.dispatchEvent(new CustomEvent(STICKY_CONTEXT_CHANGED_EVENT, { detail: { enabled } }));
}
