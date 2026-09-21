import { memo, useState } from "react";
import { CaretDown, Robot, Terminal } from "@phosphor-icons/react";
import { formatDuration } from "@/utils/numbers";

// Command-class accents for the category chip: the row reads
// `Search - $ grep …` so terminal use scans by kind at a glance.
const CATEGORY_STYLES = {
  Search: "text-sky-400 light:text-sky-600",
  Run: "text-emerald-500 light:text-emerald-600",
  Install: "text-amber-400 light:text-amber-600",
  Write: "text-violet-400 light:text-violet-600",
  Fetch: "text-cyan-400 light:text-cyan-600",
};

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
  const ms =
    session.endedAt != null && session.startedAt != null
      ? session.endedAt - session.startedAt
      : null;
  // Same expand contract as file rows: sessions with captured output open
  // inline to the full command + tail; rows without detail stay static.
  const hasDetail = !!session.detail;
  return (
    <div className="not-prose w-full max-w-[640px] mt-2 mb-2 overflow-hidden">
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
        {session.category && CATEGORY_STYLES[session.category] && (
          <span className="flex items-baseline gap-x-1 shrink-0">
            <span
              className={`text-[11px] font-semibold ${CATEGORY_STYLES[session.category]}`}
            >
              {session.category}
            </span>
            <span className="text-[11px] text-zinc-600 light:text-zinc-400">
              -
            </span>
          </span>
        )}
        <span
          className={`flex-1 min-w-0 truncate font-mono text-[12px] text-zinc-200 light:text-zinc-800`}
        >
          {session.label}
        </span>
        {Number.isFinite(ms) && ms >= 0 && (
          <span className="text-[10px] text-zinc-500 light:text-zinc-400 tabular-nums shrink-0">
            {formatDuration(ms / 1000)}
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

export default memo(SessionCard);
