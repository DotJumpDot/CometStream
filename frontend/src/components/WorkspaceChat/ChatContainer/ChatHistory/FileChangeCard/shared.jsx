import { useMemo } from "react";
import { useTranslation } from "react-i18next";

/**
 * Hard cap on rendered diff rows - the server already caps the payload, this
 * keeps a pathological patch from producing an unbounded DOM.
 */
export const MAX_DIFF_ROWS = 400;

/**
 * Splits a display path into basename and leading directory.
 * @param {string} path
 * @returns {{basename: string, dirname: string}}
 */
export function splitPath(path) {
  const normalized = (path || "").replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  if (idx === -1) return { basename: normalized, dirname: "" };
  return {
    basename: normalized.slice(idx + 1),
    dirname: normalized.slice(0, idx),
  };
}

/**
 * Parses hunk headers (`@@ -a,b +c,d @@`) so each row can show old/new line
 * numbers the way an IDE diff gutter does.
 * @param {string} header - hunk header line
 * @returns {{oldStart: number, newStart: number}|null}
 */
export function parseHunkHeader(header) {
  const match = header.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if (!match) return null;
  return { oldStart: parseInt(match[1], 10), newStart: parseInt(match[2], 10) };
}

/**
 * Inline unified-diff renderer with +/- coloring and dual line gutters.
 * File headers (`Index:`, `===`, `---`, `+++`) are skipped - the surrounding
 * UI already identifies the file.
 * @param {Object} props
 * @param {string} props.diff - unified diff text
 * @param {boolean} props.truncated - payload was capped server-side
 */
export function UnifiedDiffView({ diff, truncated = false }) {
  const { t } = useTranslation();

  const rows = useMemo(() => {
    const parsed = [];
    let oldNo = 0;
    let newNo = 0;
    for (const line of diff.split("\n")) {
      if (parsed.length >= MAX_DIFF_ROWS) break;
      // Skip patch preamble - the surrounding UI already names the file.
      if (
        line.startsWith("Index:") ||
        line.startsWith("===") ||
        line.startsWith("---") ||
        line.startsWith("+++") ||
        line.startsWith("diff --git")
      )
        continue;

      if (line.startsWith("@@")) {
        const hunk = parseHunkHeader(line);
        if (hunk) {
          oldNo = hunk.oldStart;
          newNo = hunk.newStart;
        }
        parsed.push({ kind: "hunk", text: line });
        continue;
      }

      if (line.startsWith("+")) {
        parsed.push({ kind: "add", old: null, new: newNo++, text: line });
      } else if (line.startsWith("-")) {
        parsed.push({ kind: "del", old: oldNo++, new: null, text: line });
      } else if (line.startsWith("\\")) {
        // "\ No newline at end of file" marker
        parsed.push({ kind: "meta", old: null, new: null, text: line });
      } else {
        parsed.push({ kind: "ctx", old: oldNo++, new: newNo++, text: line });
      }
    }
    return parsed;
  }, [diff]);

  const hitRenderCap = rows.length >= MAX_DIFF_ROWS;

  return (
    <div className="mt-1 rounded-lg border border-white/10 light:border-black/10 overflow-hidden text-[12px] font-mono w-full">
      <div className="max-h-[420px] overflow-y-auto">
        {rows.map((row, i) => {
          if (row.kind === "hunk")
            return (
              <div
                key={i}
                className="px-3 py-0.5 bg-white/5 light:bg-black/5 text-zinc-500 light:text-zinc-400 whitespace-pre-wrap break-words"
              >
                {row.text}
              </div>
            );
          if (row.kind === "meta")
            return (
              <div
                key={i}
                className="px-3 py-0.5 text-zinc-600 light:text-zinc-400 italic whitespace-pre-wrap break-words"
              >
                {row.text}
              </div>
            );

          const isAdd = row.kind === "add";
          const isDel = row.kind === "del";
          return (
            <div
              key={i}
              className={`flex ${
                isAdd ? "bg-emerald-500/10" : isDel ? "bg-red-500/10" : ""
              }`}
            >
              <span className="w-9 flex-shrink-0 pr-1 text-right text-zinc-600 light:text-zinc-400 select-none">
                {row.old ?? ""}
              </span>
              <span className="w-9 flex-shrink-0 pr-1 text-right text-zinc-600 light:text-zinc-400 select-none border-r border-white/5 light:border-black/10 mr-2">
                {row.new ?? ""}
              </span>
              <span
                className={`flex-1 pr-3 whitespace-pre-wrap break-words ${
                  isAdd
                    ? "text-emerald-300 light:text-emerald-700"
                    : isDel
                      ? "text-red-300 light:text-red-600"
                      : "text-zinc-300 light:text-zinc-700"
                }`}
              >
                {row.text}
              </span>
            </div>
          );
        })}
      </div>
      {(truncated || hitRenderCap) && (
        <div className="px-3 py-1 text-[11px] text-zinc-500 light:text-zinc-400 border-t border-white/10 light:border-black/10">
          {t("chat_window.file_change.diff_capped")}
        </div>
      )}
    </div>
  );
}
