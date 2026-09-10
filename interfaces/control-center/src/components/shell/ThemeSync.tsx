"use client";

import { useEffect, useSyncExternalStore } from "react";
import { DEFAULT_THEME, normalizeTheme, THEME_STORAGE_KEY, type ControlCenterTheme } from "@/lib/theme";

const THEME_EVENT = "pritha-neuraldeep-theme-change";

function applyTheme(theme: ControlCenterTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = theme;
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function selectTheme(theme: ControlCenterTheme) {
  applyTheme(theme);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The selected appearance still works for this tab when storage is blocked.
  }
}

function subscribe(listener: () => void) {
  window.addEventListener(THEME_EVENT, listener);
  return () => window.removeEventListener(THEME_EVENT, listener);
}

export function useControlCenterTheme() {
  return useSyncExternalStore(subscribe,
    () => normalizeTheme(document.documentElement.dataset.theme),
    () => DEFAULT_THEME);
}

export function ThemeSync() {
  useEffect(() => {
    const syncStorage = (event: StorageEvent) => {
      try {
        if (event.storageArea !== window.localStorage) return;
      } catch { return; }
      if (event.key === THEME_STORAGE_KEY || event.key === null) applyTheme(normalizeTheme(event.newValue));
    };
    window.addEventListener("storage", syncStorage);
    return () => window.removeEventListener("storage", syncStorage);
  }, []);
  return null;
}
