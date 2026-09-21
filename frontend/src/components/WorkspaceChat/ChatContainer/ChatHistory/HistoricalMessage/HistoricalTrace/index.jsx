import { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import DOMPurify from "dompurify";
import {
  Brain,
  CaretDown,
  CheckCircle,
  Circle,
  ListChecks,
  Robot,
  SpinnerGap,
  Terminal,
} from "@phosphor-icons/react";
import { renderThoughtMarkdown } from "@/utils/chat/markdown";
import { stripThoughtTags } from "../../ThoughtContainer";
import { humanizeAgentStatus } from "../../StatusResponse";
import FileChangeCard from "../../FileChangeCard";
import FileDownloadCard from "../../FileDownloadCard";
import { formatDuration } from "@/utils/numbers";

/**
 * Renders a persisted agent run trace (see server `plugins/trace.js`) in
 * chronological order above the turn's final reply - the reloaded
 * equivalent of the live activity chain. Live-only stores (agentActivity,
 * per-chain arrival timestamps) are gone after reload, so rows render
 * statically: thoughts collapsed with their own toggle, statuses as dim
 * one-liners, file cards via the shared component, plans and sessions as
 * compact static rows.
 * @param {Object} props
 * @param {Array<{type: string, content: any}>} [props.trace] - recorded events
 */
function HistoricalTrace({ trace = [] }) {
  const events = useMemo(() => (Array.isArray(trace) ? trace : []), [trace]);
  if (events.length === 0) return null;
  return (
    <div className="not-prose w-full max-w-[640px] flex flex-col gap-y-2 mb-2">
      {events.map((event, index) => (
        <TraceRow
          key={`${event?.type || "event"}-${index}`}
          event={event || {}}
        />
      ))}
    </div>
  );
}

function TraceRow({ event }) {
  const { type, content } = event;

  if (type === "thoughtChain" && typeof content === "string" && content) {
    return <TraceThought text={content} />;
  }
  if (type === "fileChangeCard" && content?.path) {
    return (
      <FileChangeCard
        action={content.action || "edit"}
        path={content.path}
        added={content.added ?? 0}
        removed={content.removed ?? 0}
        diff={content.diff || ""}
        diffTruncated={!!content.truncated}
        readLines={content.lines ?? null}
      />
    );
  }
  if (type === "fileDownloadCard" && content?.filename) {
    return <FileDownloadCard props={{ content }} />;
  }
  if (type === "todoListCard") {
    return <TracePlan items={content?.items} />;
  }
  if (type === "sessionCard" && content?.label) {
    return <TraceSession session={content} />;
  }
  if (
    type === "statusResponse" &&
    typeof content === "string" &&
    content.trim()
  ) {
    // Same humanized one-liners as the live chain (verbose echoes and
    // assembly dumps drop out); noise-only lines render nothing.
    const label = humanizeAgentStatus(content);
    if (!label) return null;
    return (
      <p
        title={content}
        className="truncate text-xs text-zinc-500 light:text-zinc-400 font-mono px-2 py-0.5"
      >
        {label}
      </p>
    );
  }
  return null;
}

/**
 * Collapsed reasoning block. No arrival timestamps survive reload, so there
 * is no duration - just the thought text behind a toggle.
 */
const TraceThought = memo(function TraceThought({ text }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const html = useMemo(
    () => DOMPurify.sanitize(renderThoughtMarkdown(stripThoughtTags(text))),
    [text]
  );
  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex items-center gap-x-2 w-full rounded-lg px-2 py-1 text-left border-none cursor-pointer bg-transparent hover:bg-white/[0.05] light:hover:bg-black/[0.05] transition-colors"
      >
        <Brain className="w-3.5 h-3.5 text-zinc-500 light:text-zinc-400 shrink-0" />
        <span className="flex-1 min-w-0 truncate text-[12px] text-zinc-400 light:text-zinc-500">
          {t("chat_window.trace.thought")}
        </span>
        <CaretDown
          className={`w-3 h-3 text-zinc-500 light:text-zinc-400 shrink-0 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>
      {expanded && (
        <div
          className="mx-2 mb-1 px-2 py-1.5 text-[13px] leading-relaxed text-zinc-300 light:text-zinc-700 break-words"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
});

/**
 * Static plan snapshot: check icons per status plus an n/m counter.
 */
function TracePlan({ items }) {
  const { t } = useTranslation();
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return null;
  const done = list.filter((i) => i?.status === "done").length;
  return (
    <div className="rounded-lg bg-white/[0.04] light:bg-black/[0.04] px-2 py-1.5">
      <p className="flex items-center gap-x-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 light:text-zinc-400 mb-1">
        <ListChecks className="w-3.5 h-3.5" />
        {t("agent_panel.tab_plan")}
        <span className="ml-auto tabular-nums normal-case font-normal">
          {done}/{list.length}
        </span>
      </p>
      <ul className="flex flex-col gap-y-0.5">
        {list.slice(0, 20).map((item, i) => (
          <li
            key={i}
            className="flex items-center gap-x-2 text-[12px] text-zinc-300 light:text-zinc-600"
          >
            {item?.status === "done" ? (
              <CheckCircle
                weight="bold"
                className="w-3.5 h-3.5 text-emerald-400 shrink-0"
              />
            ) : item?.status === "in_progress" ? (
              <SpinnerGap className="w-3.5 h-3.5 text-cta-button shrink-0" />
            ) : (
              <Circle className="w-3 h-3 text-zinc-500 light:text-zinc-400 shrink-0" />
            )}
            <span className="min-w-0 truncate">{item?.content || ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Static terminal/subagent row with status dot, duration, and an expandable
 * detail (command output / result text).
 */
function TraceSession({ session }) {
  const [expanded, setExpanded] = useState(false);
  const KindIcon = session.kind === "subagent" ? Robot : Terminal;
  const dot =
    session.status === "running"
      ? "bg-sky-400"
      : session.status === "error"
        ? "bg-red-400"
        : "bg-emerald-400";
  const ms =
    session.endedAt != null && session.startedAt != null
      ? session.endedAt - session.startedAt
      : null;
  return (
    <div className="rounded-lg bg-white/[0.04] light:bg-black/[0.04] overflow-hidden">
      <button
        type="button"
        onClick={() => session.detail && setExpanded((v) => !v)}
        title={session.label}
        className="flex items-center gap-x-2 w-full rounded-lg px-2 py-1.5 text-left border-none cursor-pointer bg-transparent hover:bg-white/[0.05] light:hover:bg-black/[0.05] transition-colors"
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
        <KindIcon className="w-3.5 h-3.5 text-zinc-400 light:text-zinc-500 shrink-0" />
        <span
          className={`flex-1 min-w-0 truncate text-[12px] text-zinc-200 light:text-zinc-800 ${
            session.kind === "terminal" ? "font-mono" : ""
          }`}
        >
          {session.label}
        </span>
        {Number.isFinite(ms) && ms >= 0 && (
          <span className="text-[10px] text-zinc-500 light:text-zinc-400 tabular-nums shrink-0">
            {formatDuration(ms / 1000)}
          </span>
        )}
      </button>
      {expanded && !!session.detail && (
        <pre className="mx-2 mb-2 p-2 rounded-md bg-zinc-950/70 light:bg-slate-100 text-[11px] leading-relaxed text-zinc-300 light:text-zinc-700 font-mono whitespace-pre-wrap break-words max-h-[260px] overflow-y-auto">
          {session.detail}
        </pre>
      )}
    </div>
  );
}

export default memo(HistoricalTrace);
