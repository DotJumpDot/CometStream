import { memo, useState } from "react";
import { CaretDown, Robot, Terminal } from "@phosphor-icons/react";
import { formatDuration } from "@/utils/numbers";
import { shortCommand, categorizeLabel } from "@/utils/agentActivity";

// Command-class accents for the category chip: the row reads
// `Search - $ grep …` so terminal use scans by kind at a glance. Each
// class gets its own hue (Search/Fetch share the blue family by design).
const CATEGORY_STYLES = {
  Search: "text-sky-400 light:text-sky-600",
  Run: "text-emerald-500 light:text-emerald-600",
  Install: "text-amber-400 light:text-amber-600",
  Write: "text-violet-400 light:text-violet-600",
  Fetch: "text-cyan-400 light:text-cyan-600",
  Kill: "text-red-400 light:text-red-500",
  Sleep: "text-yellow-300 light:text-yellow-600",
  Git: "text-blue-400 light:text-blue-500",
  Test: "text-fuchsia-400 light:text-fuchsia-600",
  Files: "text-teal-300 light:text-teal-600",
  Cat: "text-orange-400 light:text-orange-600",
  List: "text-lime-400 light:text-lime-600",
  Pwd: "text-stone-400 light:text-stone-500",
  Bash: "text-indigo-400 light:text-indigo-500",
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
  // Server value wins; historical rows stored chipless fall back to the
  // client-side classifier so old threads read like new ones.
  const category = session.category || categorizeLabel(session.label);
  const ms =
    session.endedAt != null && session.startedAt != null
      ? session.endedAt - session.startedAt
      : null;
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
        {category && CATEGORY_STYLES[category] && (
          <span className="flex items-baseline gap-x-1 shrink-0">
            <span
              className={`text-[11px] font-semibold ${CATEGORY_STYLES[category]}`}
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
          <span className="text-[13px] text-pink-400 light:text-pink-600 tabular-nums shrink-0">
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
