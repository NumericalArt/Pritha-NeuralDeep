export const CONTROL_CENTER_THEMES = ["dark", "light", "classic"] as const;
export type ControlCenterTheme = (typeof CONTROL_CENTER_THEMES)[number];
export const DEFAULT_THEME: ControlCenterTheme = "dark";
// Browser-local and separate from the canonical Pritha and preview preferences.
export const THEME_STORAGE_KEY = "pritha-neuraldeep-theme";

export function normalizeTheme(value: unknown): ControlCenterTheme {
  return CONTROL_CENTER_THEMES.includes(value as ControlCenterTheme) ? value as ControlCenterTheme : DEFAULT_THEME;
}

// Apply before hydration so a saved light/classic choice does not flash dark.
export const themeInitScript = `(() => {
  let theme = ${JSON.stringify(DEFAULT_THEME)};
  try {
    const stored = window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (${JSON.stringify(CONTROL_CENTER_THEMES)}.includes(stored)) theme = stored;
  } catch {}
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = theme;
})();`;
