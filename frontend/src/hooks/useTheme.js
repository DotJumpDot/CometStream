import { REFETCH_LOGO_EVENT } from "@/LogoContext";
import { useState, useEffect, useSyncExternalStore } from "react";
import {
  applyMethodPaletteVars,
  readMethodPresetKey,
} from "@/hooks/useMethodPalette";

const THEME_STORAGE_KEY = "theme";
const THEME_CHANGE_EVENT = "cometstream-theme-changed";

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "default") return "dark"; // migrate legacy value
    return stored || "system";
  } catch {
    return "system";
  }
}

function subscribeTheme(listener) {
  const onStorage = (e) => {
    if (e.key === THEME_STORAGE_KEY) listener();
  };
  window.addEventListener(THEME_CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

const availableThemes = {
  system: "System",
  light: "Light",
  dark: "Dark",
  "monokai-night": "Monokai Night",
  "monokai-dark-soda": "Monokai Dark Soda",
  sakura: "Sakura",
};

/**
 * @typedef {'system' | 'light' | 'dark' | 'monokai-night' | 'monokai-dark-soda' | 'sakura'} ThemeOption
 */

/**
 * @typedef {Object} UseThemeResult
 * @property {ThemeOption} theme - The current theme preference stored in localStorage.
 * @property {(newTheme: ThemeOption) => void} setTheme - Sets the theme preference.
 * @property {Record<string, string>} availableThemes - Map of theme keys to display names.
 * @property {boolean} isLight - Whether the resolved theme is light (explicitly or via system preference).
 */

/**
 * Whether a theme key renders light surfaces. Sakura is visually light, so
 * everywhere the app branches on light/dark (body class, logos, code-block
 * themes, tooltips) must include it — otherwise the sidebar goes Sakura
 * while the chat stays dark.
 * @param {string} key - Resolved or stored theme key.
 * @returns {boolean}
 */
export function isLightThemeKey(key) {
  return key === "light" || key === "sakura";
}

/**
 * Determines the current theme of the application.
 * "system" follows the OS preference, "light" and "dark" force that mode.
 * @returns {UseThemeResult}
 */
export function useTheme() {
  // Shared across every mounted component (same useSyncExternalStore pattern
  // as useMethodPalette): picking a theme in one row re-renders all
  // dependents - e.g. the palette preview - with no navigation.
  const theme = useSyncExternalStore(subscribeTheme, readStoredTheme);

  const [systemTheme, setSystemTheme] = useState(() =>
    window.matchMedia?.("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark"
  );

  // Listen for OS level theme changes
  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: light)");
    const handler = (e) => setSystemTheme(e.matches ? "light" : "dark");
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const resolvedTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme);
    document.body.classList.toggle("light", isLightThemeKey(resolvedTheme));
    localStorage.setItem("theme", theme);
    // Method-palette variables live outside the theme system, but they must
    // exist before chat paints: re-assert them on every theme application so
    // a fresh boot (no settings visit yet) still colors method pills/quotes.
    applyMethodPaletteVars(readMethodPresetKey());
    window.dispatchEvent(new Event(REFETCH_LOGO_EVENT));
  }, [resolvedTheme, theme]);

  // In development, attach keybind combinations to toggle theme
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    function toggleOnKeybind(e) {
      if (e.metaKey && e.key === ".") {
        e.preventDefault();
        setTheme(theme === "light" ? "dark" : "light");
      }
    }
    document.addEventListener("keydown", toggleOnKeybind);
    return () => document.removeEventListener("keydown", toggleOnKeybind);
  }, [theme]);

  /**
   * Sets the theme of the application and runs any
   * other necessary side effects
   * @param {ThemeOption} newTheme The new theme to set
   */
  function setTheme(newTheme) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {}
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  return {
    theme,
    setTheme,
    availableThemes,
    isLight: isLightThemeKey(resolvedTheme),
  };
}
