import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import DOMPurify from "dompurify";
import {
  CheckCircle,
  Circle,
  ListChecks,
  SpinnerGap,
} from "@phosphor-icons/react";
import renderMarkdown from "@/utils/chat/markdown";
import StatusResponse from "../../StatusResponse";
import FileChangeCard from "../../FileChangeCard";
import FileDownloadCard from "../../FileDownloadCard";
import SessionCard from "../../SessionCard";
import PlanCard from "../../PlanCard";

/**
 * Renders a persisted agent run trace (see server `plugins/trace.js`) in
 * chronological order above the turn's final reply - the reloaded
 * equivalent of the live activity chain. Consecutive thought/status events
 * regroup into chains and render through the same StatusResponse component
 * as the live chat (settled: collapsed, no live timestamps), so a reopened
 * thread reads the same as the working view. Visible cards break the run
 * exactly like they break the live chain, preserving chronological
 * interleave. Solo bare tool calls hide via the shared StatusResponse rule.
 * `agentNote` progress sentences render as reply-styled prose between the
 * runs. Sessions have no live-chain equivalent and keep their compact
 * static rows; plan docs render the full PlanCard like the live chat.
 * @param {Object} props
 * @param {Array<{type: string, content: any}>} [props.trace] - recorded events
 */
function HistoricalTrace({ trace = [] }) {
  const events = useMemo(() => (Array.isArray(trace) ? trace : []), [trace]);
  const rows = useMemo(() => {
    const out = [];
    // Two frames arrive per session (`running` then `done`/`error` with the
    // same id) - only the last one renders, mirroring the live in-place
    // update. Otherwise a reloaded run shows every session twice.
    const lastSessionIdx = new Map();
    events.forEach((event, index) => {
      if (event?.type === "sessionCard" && event?.content?.id != null)
        lastSessionIdx.set(event.content.id, index);
    });
    let run = null;
    const flush = () => {
      if (run) {
        out.push({ run });
        run = null;
      }
    };
    events.forEach((event, index) => {
      if (
        event?.type === "sessionCard" &&
        event?.content?.id != null &&
        lastSessionIdx.get(event.content.id) !== index
      )
        return;
      if (event?.type === "thoughtChain" || event?.type === "statusResponse") {
        if (!run) run = [];
        run.push(event);
      } else {
        flush();
        out.push({ event });
      }
    });
    flush();
    return out;
  }, [events]);
  if (rows.length === 0) return null;
  return (
    <div className="not-prose w-full flex flex-col gap-y-2 mb-2">
      {rows.map((row, index) =>
        row.run ? (
          <StatusResponse
            key={`trace-chain-${index}`}
            messages={row.run}
            isThinking={false}
            isLastGroup={false}
          />
        ) : (
          <TraceRow
            key={`${row.event?.type || "event"}-${index}`}
            event={row.event || {}}
          />
        )
      )}
    </div>
  );
}

function TraceRow({ event }) {
  const { type, content } = event;

  // Mid-run progress note: the model's visible text from a tool-call
  // iteration. Renders as plain reply-styled prose (same renderer and
  // colors as the chat reply) so the reloaded run narrates like the live
  // one. Like any visible message it breaks the activity run.
  if (type === "agentNote" && typeof content === "string" && content.trim()) {
    return <TraceNote text={content} />;
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
  if (type === "sessionCard" && content?.id != null) {
    return <SessionCard session={content} />;
  }
  if (type === "planCard" && content?.plan) {
    return <PlanCard plan={content.plan} status={content.status} />;
  }
  // Thoughts and statuses only ever arrive inside a regrouped run (rendered
  // by StatusResponse above); anything reaching here renders nothing.
  return null;
}

/**
 * One persisted narration sentence, styled like reply prose.
 */
const TraceNote = memo(function TraceNote({ text }) {
  const html = useMemo(() => DOMPurify.sanitize(renderMarkdown(text)), [text]);
  return (
    <span
      className="flex flex-col gap-y-1 text-white light:text-slate-900 w-full break-words"
      dangerouslySetInnerHTML={{ __html: html }}
    />
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
              <SpinnerGap className="w-3.5 h-3.5 text-cta-button shrink-0 animate-spin" />
            ) : (
              <Circle className="w-3 h-3 text-zinc-500 light:text-zinc-400 shrink-0" />
            )}
            <span className="min-w-0 truncate">{item?.content || ""}</span>
          </li>
        ))}
        {list.length > 20 && (
          <li className="text-[11px] text-zinc-500 light:text-zinc-400 pl-[22px] tabular-nums">
            {t("agent_panel.plan_more", { count: list.length - 20 })}
          </li>
        )}
      </ul>
    </div>
  );
}

export default memo(HistoricalTrace);
