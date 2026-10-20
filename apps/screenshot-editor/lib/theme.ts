// The interface theme: what the user picked, and what that means right now.
// The design canvas never follows it.

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

/** The toggle's cycle order. */
export const THEME_PREFERENCES: readonly ThemePreference[] = [
  "system",
  "light",
  "dark",
];

export const THEME_LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/** The preference key, for readPreference and writePreference. */
export const THEME_PREFERENCE_KEY = "theme";
/** The full localStorage key, for the inline script that can't import the helpers. */
export const THEME_STORAGE_KEY = "screenshot-editor:theme";

export const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

/** Anything stored that isn't a known preference means "system". */
export function parseThemePreference(value: unknown): ThemePreference {
  return (
    THEME_PREFERENCES.find((preference) => preference === value) ?? "system"
  );
}

/** System → Light → Dark → System. */
export function nextThemePreference(current: ThemePreference): ThemePreference {
  const index = THEME_PREFERENCES.indexOf(current);
  return THEME_PREFERENCES[(index + 1) % THEME_PREFERENCES.length];
}

export function resolveTheme(
  preference: ThemePreference,
  systemDark: boolean,
): ResolvedTheme {
  if (preference === "system") return systemDark ? "dark" : "light";
  return preference;
}

/** The part of <html> the theme touches. */
type ThemeRoot = {
  classList: { toggle(token: string, force?: boolean): boolean };
  style: { colorScheme: string };
};

/** The class switches the colour tokens; color-scheme switches native controls and scrollbars. */
export function applyTheme(root: ThemeRoot, theme: ResolvedTheme) {
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

/**
 * Runs in <head> before the first paint, so a dark page never flashes light.
 * Plain ES5 that does what parseThemePreference, resolveTheme and applyTheme
 * do. Storage can be blocked, so every access is inside try/catch.
 */
export const THEME_SCRIPT = `(function () {
  try {
    var stored = null;
    try { stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}); } catch (e) {}
    var dark = stored === "dark" ||
      (stored !== "light" && matchMedia(${JSON.stringify(DARK_SCHEME_QUERY)}).matches);
    var root = document.documentElement;
    root.classList.toggle("dark", dark);
    root.style.colorScheme = dark ? "dark" : "light";
  } catch (e) {}
})();`;
