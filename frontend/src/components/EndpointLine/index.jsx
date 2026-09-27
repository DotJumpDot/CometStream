import { contrastText } from "@/components/ThemePalette";
import {
  useMethodPalette,
  METHOD_PRESETS,
  DEFAULT_PRESET_KEY,
} from "@/hooks/useMethodPalette";

/**
 * Default (Sakura) badge color per HTTP method. GET reuses the palette
 * success green, POST/PUT/PATCH stay in the sakura family, DELETE is a
 * sakura-adjacent red. Prefer `useMethodPalette()` colors for rendering so
 * the active preset applies; this export is the Sakura default.
 */
export const METHOD_COLORS = METHOD_PRESETS[DEFAULT_PRESET_KEY].methods;

const HEX_RE = /#[0-9A-Fa-f]{6}\b/;
const QUOTED_RE = /"[^"]*"/;

/**
 * Splits one endpoint line into typed tokens: an optional leading METHOD,
 * path text, "double-quoted" strings (pink), and #hex codes (self-colored).
 * Anything else renders as plain text.
 * @param {string} line - e.g. `POST /api/auth/register "username" #FFB7C5`
 * @param {Record<string, { bg: string, fg: string }>} methods - known method badges
 * @returns {Array<{ kind: string, value: string }>}
 */
export function tokenizeEndpoint(line, methods = METHOD_COLORS) {
  const tokens = [];
  let rest = line.trim();
  const method = Object.keys(methods).find(
    (m) => rest === m || rest.startsWith(m + " ")
  );
  if (method) {
    tokens.push({ kind: "method", value: method });
    rest = rest.slice(method.length).trim();
  }
  while (rest.length > 0) {
    const hexAt = rest.search(HEX_RE);
    const quotedAt = rest.search(QUOTED_RE);
    let next = -1;
    let kind = "text";
    if (hexAt !== -1 && (quotedAt === -1 || hexAt < quotedAt)) {
      next = hexAt;
      kind = "hex";
    } else if (quotedAt !== -1) {
      next = quotedAt;
      kind = "quoted";
    }
    if (next === -1) {
      tokens.push({ kind: "text", value: rest });
      break;
    }
    if (next > 0) tokens.push({ kind: "text", value: rest.slice(0, next) });
    if (kind === "hex") {
      const match = rest.slice(next).match(HEX_RE)[0];
      tokens.push({ kind, value: match });
      rest = rest.slice(next + match.length);
    } else {
      const end = rest.indexOf('"', next + 1);
      const close = end === -1 ? rest.length : end + 1;
      tokens.push({ kind, value: rest.slice(next, close) });
      rest = rest.slice(close);
    }
  }
  return tokens.filter((t) => t.value.length > 0);
}

/**
 * Renders one endpoint line with each part in its own color: method badge
 * from the active method palette, path in the preset path color, pink quoted
 * strings, self-colored hex chips.
 * @param {{ line: string, colors?: { methods: object, path: string } }} props
 */
export default function EndpointLine({ line = "", colors }) {
  const { colors: activeColors } = useMethodPalette();
  const palette = colors || activeColors;
  const tokens = tokenizeEndpoint(line, palette.methods);
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 font-mono text-[13px]">
      {tokens.map((token, i) => {
        if (token.kind === "method") {
          const colors = palette.methods[token.value] || {
            bg: "#4A3B40",
            fg: "#FFFFFF",
          };
          return (
            <span
              key={i}
              className="px-2 py-0.5 rounded-md text-[11px] font-bold tracking-wide"
              style={{ backgroundColor: colors.bg, color: colors.fg }}
            >
              {token.value}
            </span>
          );
        }
        if (token.kind === "quoted") {
          return (
            <span key={i} style={{ color: palette.quote }}>
              {token.value}
            </span>
          );
        }
        if (token.kind === "hex") {
          return (
            <span
              key={i}
              className="px-1.5 py-0.5 rounded border border-theme-modal-border"
              style={{
                backgroundColor: token.value,
                color: contrastText(token.value),
              }}
            >
              {token.value}
            </span>
          );
        }
        return (
          <span
            key={i}
            className="font-semibold"
            style={{ color: palette.path }}
          >
            {token.value}
          </span>
        );
      })}
    </p>
  );
}
