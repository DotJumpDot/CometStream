import React, { useMemo, useState } from "react";
import DOMPurify from "@/utils/chat/purify";
import {
  CheckCircle,
  Circle,
  ClipboardText,
  XCircle,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import renderMarkdown from "@/utils/chat/markdown";

/**
 * Approved/proposed design doc card (plan mode). The full markdown renders
 * collapsed behind a header with a status chip - proposals can be long and
 * the approval card next to it already demands attention. Status follows
 * the doc lifecycle: proposed -> approved (build) or rejected (revise).
 * While the proposal streams in (pendingChars != null) the header shows a
 * live "receiving" line instead of the body - the completion's planCard
 * replaces this row (see agent.js).
 */
export default function PlanCard({
  plan = "",
  status = "proposed",
  pendingChars = null,
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(status !== "approved");
  const html = useMemo(
    () => DOMPurify.sanitize(renderMarkdown(plan || "")),
    [plan]
  );
  const chip =
    status === "approved" ? (
      <span className="flex items-center gap-x-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
        <CheckCircle weight="bold" className="w-3 h-3" />
        {t("agent_panel.plan_approved")}
      </span>
    ) : status === "rejected" ? (
      <span className="flex items-center gap-x-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-400">
        <XCircle weight="bold" className="w-3 h-3" />
        {t("agent_panel.plan_rejected")}
      </span>
    ) : (
      <span className="flex items-center gap-x-1 rounded-full bg-cta-button/15 px-2 py-0.5 text-[11px] font-medium text-cta-button">
        <Circle className="w-3 h-3" />
        {t("agent_panel.plan_proposed")}
      </span>
    );

  if (!plan && pendingChars == null) return null;
  return (
    <div className="rounded-[16px] bg-zinc-900 light:bg-white light:border-2 light:border-slate-300 px-4 py-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-x-2 border-none bg-transparent p-0 cursor-pointer text-left"
      >
        <ClipboardText className="w-4 h-4 text-zinc-400 light:text-zinc-500 shrink-0" />
        <span className="text-[13px] font-semibold text-white light:text-slate-900">
          {t("agent_panel.plan_title")}
        </span>
        <span className="ml-auto">{chip}</span>
      </button>
      {pendingChars != null && (
        <p className="mt-1.5 flex items-center gap-x-2 text-[12px] text-zinc-400 light:text-zinc-500">
          <span className="w-1.5 h-1.5 rounded-full bg-cta-button animate-pulse shrink-0" />
          <span className="tabular-nums">
            {t("agent_panel.plan_streaming", { count: pendingChars })}
          </span>
        </p>
      )}
      {expanded && !!plan && (
        <div className="mt-2 rounded-lg border border-white/10 light:border-slate-300 px-3 py-2 text-[13px] leading-6 text-zinc-200 light:text-slate-700 break-words flex flex-col gap-y-1">
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      )}
    </div>
  );
}
