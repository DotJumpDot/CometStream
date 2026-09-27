/**
 * Representative swatches per UI theme: background, accent, text, card,
 * border, success. The Sakura theme carries its full named set (including
 * the card-border extra). Keys match `availableThemes` in useTheme.js;
 * `system` resolves via the `isLight` flag at render time.
 */
export const THEME_SWATCHES = {
  dark: [
    { hex: "#0E0F0F", labelKey: "background" },
    { hex: "#46C8FF", labelKey: "accent" },
    { hex: "#FFFFFF", labelKey: "text" },
    { hex: "#1B1B1E", labelKey: "card" },
    { hex: "#3F3F42", labelKey: "border" },
    { hex: "#A6F4C5", labelKey: "success" },
  ],
  light: [
    { hex: "#F9FBFD", labelKey: "background" },
    { hex: "#0BA5EC", labelKey: "accent" },
    { hex: "#0E0F0F", labelKey: "text" },
    { hex: "#FFFFFF", labelKey: "card" },
    { hex: "#D3D3D3", labelKey: "border" },
    { hex: "#039855", labelKey: "success" },
  ],
  "monokai-night": [
    { hex: "#0F0F0F", labelKey: "background" },
    { hex: "#F92672", labelKey: "accent" },
    { hex: "#DDDDDD", labelKey: "text" },
    { hex: "#262626", labelKey: "card" },
    { hex: "#464646", labelKey: "border" },
    { hex: "#A6E22E", labelKey: "success" },
  ],
  "monokai-dark-soda": [
    { hex: "#1E1E1E", labelKey: "background" },
    { hex: "#FD971F", labelKey: "accent" },
    { hex: "#F8F8F2", labelKey: "text" },
    { hex: "#2A2A2A", labelKey: "card" },
    { hex: "#403D3D", labelKey: "border" },
    { hex: "#60CF30", labelKey: "success" },
  ],
  sakura: [
    { hex: "#FFF7F9", labelKey: "background" },
    { hex: "#FFB7C5", labelKey: "sakura-pink" },
    { hex: "#D4637D", labelKey: "deep-plum" },
    { hex: "#4A3B40", labelKey: "text" },
    { hex: "#FFFFFF", labelKey: "card" },
    { hex: "#FFD9E1", labelKey: "card-border" },
    { hex: "#7FB069", labelKey: "success" },
  ],
};

/**
 * Picks a readable foreground (#4A3B40 plum-text or #FFFFFF) for any hex
 * background using relative luminance, so self-colored tiles stay legible.
 * @param {string} hex - 6-digit hex color, with or without leading "#".
 * @returns {string} Foreground hex color.
 */
export function contrastText(hex) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.55 ? "#4A3B40" : "#FFFFFF";
}

/**
 * Self-colored hex swatches: every tile is filled with its own hex color and
 * labeled with its name, so the color is visible rather than described.
 * @param {{ items: Array<{ hex: string, label: string }> }} props
 */
export default function ThemePalette({ items = [] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 py-4">
      {items.map(({ hex, label }) => (
        <div
          key={hex}
          className="rounded-lg overflow-hidden border border-theme-modal-border"
        >
          <div
            className="h-14 w-full flex items-end p-2"
            style={{ backgroundColor: hex }}
          >
            <span
              className="text-xs font-semibold"
              style={{ color: contrastText(hex) }}
            >
              {label}
            </span>
          </div>
          <div className="px-2 py-1 bg-theme-bg-secondary">
            <p className="text-[11px] font-mono text-theme-text-primary">
              {hex}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
