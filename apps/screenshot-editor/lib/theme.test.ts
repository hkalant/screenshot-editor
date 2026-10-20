import { afterEach, describe, expect, it, vi } from "vitest";
import { writePreference } from "./persist/preferences";
import {
  applyTheme,
  nextThemePreference,
  parseThemePreference,
  resolveTheme,
  THEME_PREFERENCE_KEY,
  THEME_SCRIPT,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
} from "./theme";

function fakeRoot() {
  const classes = new Set<string>();
  return {
    classes,
    classList: {
      toggle(token: string, force?: boolean) {
        const on = force ?? !classes.has(token);
        if (on) classes.add(token);
        else classes.delete(token);
        return on;
      },
    },
    style: { colorScheme: "" },
  };
}

/** Runs the inline script against a fake page and returns what it set. */
function runThemeScript({
  stored,
  systemDark,
  storageThrows = false,
}: {
  stored: string | null;
  systemDark: boolean;
  storageThrows?: boolean;
}) {
  const root = fakeRoot();
  const localStorage = {
    getItem(key: string) {
      if (storageThrows) throw new Error("SecurityError");
      return key === THEME_STORAGE_KEY ? stored : null;
    },
  };
  const matchMedia = (query: string) => ({
    matches: query === "(prefers-color-scheme: dark)" && systemDark,
  });
  new Function("document", "localStorage", "matchMedia", THEME_SCRIPT)(
    { documentElement: root },
    localStorage,
    matchMedia,
  );
  return {
    dark: root.classes.has("dark"),
    colorScheme: root.style.colorScheme,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("theme preference", () => {
  it("parses stored values, falling back to system", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("system")).toBe("system");
    expect(parseThemePreference(null)).toBe("system");
    expect(parseThemePreference("Dark")).toBe("system");
    expect(parseThemePreference(1)).toBe("system");
  });

  it("cycles System, Light, Dark", () => {
    expect(nextThemePreference("system")).toBe("light");
    expect(nextThemePreference("light")).toBe("dark");
    expect(nextThemePreference("dark")).toBe("system");
  });

  it("resolves system from the colour scheme", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("applies the class and the colour scheme", () => {
    const root = fakeRoot();
    applyTheme(root, "dark");
    expect(root.classes.has("dark")).toBe(true);
    expect(root.style.colorScheme).toBe("dark");
    applyTheme(root, "light");
    expect(root.classes.has("dark")).toBe(false);
    expect(root.style.colorScheme).toBe("light");
  });

  it("is stored under the key the inline script reads", () => {
    const items = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        setItem: (key: string, value: string) => items.set(key, value),
      },
    });
    writePreference(THEME_PREFERENCE_KEY, "dark");
    expect(items.get(THEME_STORAGE_KEY)).toBe("dark");
  });
});

describe("inline theme script", () => {
  const cases: [string | null, boolean, ResolvedTheme][] = [
    ["dark", false, "dark"],
    ["light", true, "light"],
    ["system", true, "dark"],
    ["system", false, "light"],
    [null, true, "dark"],
    ["nonsense", false, "light"],
  ];

  it.each(cases)(
    "stored %s with a dark system %s gives %s, like the hook",
    (stored, systemDark, expected) => {
      expect(resolveTheme(parseThemePreference(stored), systemDark)).toBe(
        expected,
      );
      expect(runThemeScript({ stored, systemDark })).toEqual({
        dark: expected === "dark",
        colorScheme: expected,
      });
    },
  );

  it("follows the system when storage is blocked", () => {
    expect(
      runThemeScript({
        stored: "light",
        systemDark: true,
        storageThrows: true,
      }),
    ).toEqual({ dark: true, colorScheme: "dark" });
  });
});
