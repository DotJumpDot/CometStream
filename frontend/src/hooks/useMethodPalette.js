import { useSyncExternalStore, useEffect } from "react";

export const DEFAULT_PRESET_KEY = "sakura";
const STORAGE_KEY = "method-palette";
const CHANGE_EVENT = "method-palette-changed";

/**
 * Independent method-color presets for endpoint rendering. Stored under its
 * own localStorage key on purpose: picking a method palette never touches the
 * UI theme, and switching themes never touches the method colors. Any preset
 * can be re-picked at any time, and `restore` returns to the Sakura default.
 *
 * Beyond the settings preview, each preset also drives the agent chat: HTTP
 * method badges (`.md-method-*`), session-row category chips + durations,
 * and quoted spans all read the `--mp-*` CSS variables this module applies.
 * The `classic` preset intentionally sets NO variables so the legacy CSS
 * path (the long-standing chat look) rules untouched.
 */
export const METHOD_PRESETS = {
  sakura: {
    methods: {
      GET: { bg: "#7FB069", fg: "#FFFFFF" },
      POST: { bg: "#FFB7C5", fg: "#4A3B40" },
      PUT: { bg: "#D4637D", fg: "#FFFFFF" },
      PATCH: { bg: "#E6E6FA", fg: "#4A3B40" },
      DELETE: { bg: "#D6455A", fg: "#FFFFFF" },
    },
    path: "#D4637D",
    timing: "#D4637D",
    quote: "#D4637D",
    link: "#D4637D",
    code: { cmd: "#1F9D55", path: "#D4637D", val: "#A16207" },
    categories: {
      Search: "#C98AA5",
      Run: "#7FB069",
      Install: "#D4637D",
      Write: "#B45A7E",
      Fetch: "#8B8BD4",
      Kill: "#D6455A",
      Sleep: "#C9A24B",
      Git: "#7FA8C9",
      Test: "#C77FB3",
      Files: "#6FA287",
      Cat: "#E08CA0",
      List: "#9CB86B",
      Pwd: "#9A7B84",
      Bash: "#8E8ED4",
    },
  },
  classic: {
    methods: {
      GET: { bg: "#61AFFE", fg: "#FFFFFF" },
      POST: { bg: "#49CC90", fg: "#FFFFFF" },
      PUT: { bg: "#FCA130", fg: "#FFFFFF" },
      PATCH: { bg: "#50E3C2", fg: "#0B3D3A" },
      DELETE: { bg: "#F93E3E", fg: "#FFFFFF" },
    },
    path: "#EAB308",
    timing: "#F472B6",
    quote: "#F472B6",
    link: "#A78BFA",
    code: { cmd: "#6EE7B7", path: "#FB923C", val: "#FEF08A" },
    categories: {
      Search: "#38BDF8",
      Run: "#10B981",
      Install: "#FBBF24",
      Write: "#A78BFA",
      Fetch: "#22D3EE",
      Kill: "#F87171",
      Sleep: "#FDE047",
      Git: "#60A5FA",
      Test: "#E879F9",
      Files: "#2DD4BF",
      Cat: "#FB923C",
      List: "#A3E635",
      Pwd: "#A8A29E",
      Bash: "#818CF8",
    },
  },
  mono: {
    methods: {
      GET: { bg: "#6B5B61", fg: "#FFFFFF" },
      POST: { bg: "#4A3B40", fg: "#FFFFFF" },
      PUT: { bg: "#9A7B84", fg: "#FFFFFF" },
      PATCH: { bg: "#C4A3AD", fg: "#4A3B40" },
      DELETE: { bg: "#2E2428", fg: "#FFFFFF" },
    },
    path: "#4A3B40",
    timing: "#8E8E96",
    quote: "#8E8E96",
    link: "#71717A",
    code: { cmd: "#6B7280", path: "#4A3B40", val: "#78716C" },
    categories: {
      Search: "#B9B9C0",
      Run: "#9A9AA2",
      Install: "#7E7E86",
      Write: "#65656D",
      Fetch: "#B9B9C0",
      Kill: "#9A9AA2",
      Sleep: "#7E7E86",
      Git: "#65656D",
      Test: "#B9B9C0",
      Files: "#9A9AA2",
      Cat: "#7E7E86",
      List: "#65656D",
      Pwd: "#B9B9C0",
      Bash: "#9A9AA2",
    },
  },
};

/**
 * @typedef {'sakura' | 'classic' | 'mono'} MethodPresetKey
 */

function readStoredKey() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && METHOD_PRESETS[stored]) return stored;
  } catch {}
  return DEFAULT_PRESET_KEY;
}

function subscribe(listener) {
  const onStorage = (e) => {
    if (e.key === STORAGE_KEY) listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot() {
  return readStoredKey();
}

/**
 * Reads the stored preset key without subscribing (for boot paths).
 * @returns {MethodPresetKey}
 */
export function readMethodPresetKey() {
  return readStoredKey();
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return null;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Applies a preset to the document as `--mp-*` CSS variables so both React
 * surfaces (SessionCard chips/durations via inline var refs) and static
 * markdown HTML (`.md-method-*` pills, `.md-quote` via stylesheet var refs)
 * follow the palette with no re-render. The `classic` preset REMOVES the
 * variables instead of setting them, leaving the legacy stylesheet values
 * (and its light-theme overrides) exactly as they were.
 * @param {MethodPresetKey} key
 */
export function applyMethodPaletteVars(key) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const css = root.style;
  const names = [];
  for (const m of Object.keys(METHOD_PRESETS.sakura.methods)) {
    names.push(
      `--mp-${m.toLowerCase()}-bg`,
      `--mp-${m.toLowerCase()}-fg`,
      `--mp-${m.toLowerCase()}-tint`
    );
  }
  names.push(
    "--mp-path",
    "--mp-timing",
    "--mp-quote",
    "--mp-link",
    "--mp-code-cmd",
    "--mp-code-path",
    "--mp-code-val"
  );
  for (const c of Object.keys(METHOD_PRESETS.sakura.categories)) {
    names.push(`--mp-cat-${c.toLowerCase()}`);
  }
  if (key === "classic") {
    for (const name of names) css.removeProperty(name);
    return;
  }
  const preset = METHOD_PRESETS[key] || METHOD_PRESETS[DEFAULT_PRESET_KEY];
  for (const [method, colors] of Object.entries(preset.methods)) {
    const slug = method.toLowerCase();
    css.setProperty(`--mp-${slug}-bg`, colors.bg);
    css.setProperty(`--mp-${slug}-fg`, colors.fg);
    const tint = hexToRgba(colors.bg, 0.12);
    if (tint) css.setProperty(`--mp-${slug}-tint`, tint);
    else css.removeProperty(`--mp-${slug}-tint`);
  }
  css.setProperty("--mp-path", preset.path);
  css.setProperty("--mp-timing", preset.timing);
  css.setProperty("--mp-quote", preset.quote);
  css.setProperty("--mp-link", preset.link);
  css.setProperty("--mp-code-cmd", preset.code.cmd);
  css.setProperty("--mp-code-path", preset.code.path);
  css.setProperty("--mp-code-val", preset.code.val);
  for (const [category, color] of Object.entries(preset.categories)) {
    css.setProperty(`--mp-cat-${category.toLowerCase()}`, color);
  }
}

/**
 * Reads/writes the active method-color preset. Shared across every mounted
 * component via useSyncExternalStore: picking a preset in the settings row
 * re-renders all EndpointLine previews (same tab) and other tabs (storage
 * event). Quoted strings stay sakura pink and hex chips stay self-colored in
 * every preset by design.
 * @returns {{ presetKey: MethodPresetKey, colors: object, setPreset: (key: MethodPresetKey) => void, restore: () => void }}
 */
export function useMethodPalette() {
  const presetKey = useSyncExternalStore(subscribe, getSnapshot);

  // Keep the document-level `--mp-*` variables in sync so static markdown
  // HTML (method pills, quotes) follows the palette without a re-render.
  useEffect(() => {
    applyMethodPaletteVars(presetKey);
  }, [presetKey]);

  function setPreset(key) {
    if (!METHOD_PRESETS[key]) return;
    try {
      localStorage.setItem(STORAGE_KEY, key);
    } catch {}
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  function restore() {
    setPreset(DEFAULT_PRESET_KEY);
  }

  return {
    presetKey,
    colors: METHOD_PRESETS[presetKey] || METHOD_PRESETS[DEFAULT_PRESET_KEY],
    setPreset,
    restore,
  };
}
