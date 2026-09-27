import { memo, useState } from "react";
import { CaretDown, Robot, Terminal } from "@phosphor-icons/react";
import { formatDuration } from "@/utils/numbers";
import { shortCommand, categorizeLabel } from "@/utils/agentActivity";

// Command-category accents read the active method palette
// (`--mp-cat-<name>`, applied by useMethodPalette): the row still reads
// `Search - $ grep …` and scans by kind at a glance, but the hues now follow
// the picked preset. Fallbacks are the long-standing classic values so the
// legacy look survives with no variables set.
const CATEGORY_FALLBACKS = {
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
};

function categoryColor(category) {
  return `var(--mp-cat-${String(category).toLowerCase()}, ${CATEGORY_FALLBACKS[category] || "#a1a1aa"})`;
}

/**
 * One terminal/subagent session row in the chat stream: status dot, command
 * label, duration, and an expandable output/detail tail. The same component
 * renders live sessions (updated in place as `running` flips to
 * `done`/`error`) and reloaded ones from the persisted trace, so both read
 * identically. Mirrors the AgentSidePanel Sessions feed at chat scale.
 * @param {Object} props
 * @param {Object} props.session - session payload ({id, kind, label, status, detail, startedAt, endedAt})
 */
function SessionCard({ session = {} }) {
  const [expanded, setExpanded] = useState(false);
  const KindIcon = session.kind === "subagent" ? Robot : Terminal;
  const running = session.status === "running";
  const dot = running
    ? "bg-sky-400 animate-pulse"
    : session.status === "error"
      ? "bg-red-400"
      : "bg-emerald-400";
  // Server value wins; historical rows stored chipless fall back to the
  // client-side classifier so old threads read like new ones.
  const category = session.category || categorizeLabel(session.label);
  const ms =
    session.endedAt != null && session.startedAt != null
      ? session.endedAt - session.startedAt
      : null;
  // Live write payload size: terminal commands execute atomically (no
  // incremental progress exists), but for Write-kind runs the full command
  // - heredoc payload included - is known at start, so the running row
  // names its weight instead of just pulsing. Line breaks read like the
  // completion's `+N`; byte size is the fallback before any break.
  const writeDetail =
    running && category === "Write" && typeof session.detail === "string"
      ? session.detail
      : "";
  const writeLines = writeDetail ? (writeDetail.match(/\n/g) || []).length : 0;
  const writeBytes = writeDetail ? writeDetail.length : 0;
  // Same expand contract as file rows: sessions with captured output open
  // inline to the full command + tail; rows without detail stay static.
  const hasDetail = !!session.detail;
  return (
    <div className="not-prose w-full mt-2 mb-2 overflow-hidden">
      <button
        type="button"
        onClick={() => hasDetail && setExpanded((v) => !v)}
        aria-expanded={hasDetail ? expanded : undefined}
        title={session.label}
        aria-label={session.label}
        disabled={!hasDetail}
        className={`flex items-center gap-x-2 w-full rounded-lg px-2 py-1.5 text-left border-none bg-transparent transition-colors duration-150 ${
          hasDetail
            ? "cursor-pointer hover:bg-white/[0.05] light:hover:bg-black/[0.05]"
            : "cursor-default"
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
        <KindIcon className="w-3.5 h-3.5 text-zinc-400 light:text-zinc-500 shrink-0" />
        {category && (
          <span className="flex items-baseline gap-x-1 shrink-0">
            <span
              className="text-[11px] font-semibold"
              style={{ color: categoryColor(category) }}
            >
              {category}
            </span>
            <span className="text-[11px] text-zinc-600 light:text-zinc-400">
              -
            </span>
          </span>
        )}
        {/* Label sizes to content (capped at 60%) so the duration sits snug
      against the cut-off text instead of at the far right edge. */}
        <span
          className={`min-w-0 max-w-[60%] truncate font-mono text-[12px] text-zinc-500 light:text-zinc-400`}
        >
          {shortCommand(session.label, 90)}
        </span>
        {Number.isFinite(ms) && ms >= 0 && (
          <span
            className="text-[13px] tabular-nums shrink-0"
            style={{ color: "var(--mp-timing, #f472b6)" }}
          >
            {formatDuration(ms / 1000)}
          </span>
        )}
        {(writeLines > 0 || writeBytes > 0) && (
          <span className="font-mono text-[13px] text-emerald-500 light:text-emerald-600 tabular-nums shrink-0">
            +{writeLines > 0 ? writeLines : formatWriteBytes(writeBytes)}
          </span>
        )}
        {hasDetail && (
          <CaretDown
            className={`w-3 h-3 text-zinc-500 light:text-zinc-400 shrink-0 transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
          />
        )}
      </button>
      {hasDetail && (
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
            expanded
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <pre className="mx-2 mb-2 p-2 rounded-md bg-zinc-950/70 light:bg-slate-100 text-[11px] leading-relaxed text-zinc-300 light:text-zinc-700 font-mono whitespace-pre-wrap break-words max-h-[260px] overflow-y-auto">
              {session.detail}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact byte counter for the live write-payload hint (mirrors the
 * FileChangeCard checkpoint format so both rows read alike).
 * @param {number} bytes - command/detail length
 * @returns {string} Compact label without the `+` prefix.
 */
function formatWriteBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${Math.round(n)}B`;
  return `${(n / 1024).toFixed(1)}KB`;
}

export default memo(SessionCard);
