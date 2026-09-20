import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowsInLineHorizontal,
  CaretDown,
  WarningCircle,
} from "@phosphor-icons/react";

/**
 * ZCode-style context-compaction divider: a slim centered pill that shows
 * "Compressing context" while the summarizer runs and "Context compressed"
 * with freed-token stats once done. The compacted summary expands inline.
 * @param {Object} props
 * @param {boolean} [props.pending] - summarizer still running
 * @param {string} [props.summary] - the compacted summary text
 * @param {number} [props.compactedMessages] - rows folded into the summary
 * @param {number} [props.tokensBefore] - estimated context tokens before
 * @param {number} [props.tokensAfter] - estimated context tokens after
 * @param {string|null} [props.failure] - compaction failed (persisted reload)
 */
export default function ContextCompactCard({
  pending = false,
  summary = "",
  compactedMessages = null,
  tokensBefore = null,
  tokensAfter = null,
  failure = null,
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const freedTokens =
    Number.isFinite(tokensBefore) && Number.isFinite(tokensAfter)
      ? Math.max(0, tokensBefore - tokensAfter)
      : null;

  const formatTokens = (tokens) =>
    tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);

  if (pending) {
    return (
      <div className="not-prose w-full flex justify-center my-2">
        <div className="flex items-center gap-x-2 rounded-full border border-white/10 light:border-slate-300 bg-zinc-900 light:bg-slate-100 px-3.5 py-1.5 text-xs text-zinc-400 light:text-slate-600 cs-fade-in">
          <span className="cs-compact-spin inline-block w-3 h-3 rounded-full border-[1.5px] border-zinc-500 border-t-transparent" />
          <span>{t("chat_window.compact.compressing")}</span>
        </div>
      </div>
    );
  }

  if (failure) {
    return (
      <div className="not-prose w-full flex justify-center my-2">
        <div className="flex items-center gap-x-2 rounded-full border border-white/10 light:border-slate-300 bg-zinc-900 light:bg-slate-100 px-3.5 py-1.5 text-xs text-zinc-400 light:text-slate-600 cs-fade-in">
          <WarningCircle size={13} weight="fill" className="shrink-0" />
          <span>
            {failure === "nothing-to-compact"
              ? t("chat_window.compact.nothing")
              : t("chat_window.compact.failed")}
          </span>
        </div>
      </div>
    );
  }

  const hasSummary = !!summary.trim();

  return (
    <div className="not-prose w-full flex flex-col items-center my-2 gap-y-1.5">
      <button
        type="button"
        onClick={() => hasSummary && setExpanded((v) => !v)}
        aria-expanded={hasSummary ? expanded : undefined}
        className={`flex items-center gap-x-2 rounded-full border border-white/10 light:border-slate-300 bg-zinc-900 light:bg-slate-100 px-3.5 py-1.5 text-xs text-zinc-400 light:text-slate-600 cs-fade-in ${
          hasSummary
            ? "cursor-pointer hover:border-white/25 light:hover:border-slate-400 transition-colors duration-150"
            : "cursor-default"
        }`}
      >
        <ArrowsInLineHorizontal
          size={13}
          className="text-cta-button shrink-0"
        />
        <span>{t("chat_window.compact.compressed")}</span>
        {compactedMessages !== null && (
          <span className="text-zinc-500 light:text-slate-500">
            · {compactedMessages}{" "}
            {t("chat_window.compact.messages", { count: compactedMessages })}
          </span>
        )}
        {freedTokens !== null && (
          <span className="text-zinc-500 light:text-slate-500">
            · ~{formatTokens(freedTokens)}{" "}
            {t("chat_window.compact.tokens_freed")}
          </span>
        )}
        {hasSummary && (
          <CaretDown
            size={11}
            className={`text-zinc-500 transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
          />
        )}
      </button>
      {expanded && hasSummary && (
        <div className="w-full md:max-w-[85%] rounded-lg border border-white/10 light:border-slate-300 bg-zinc-900/80 light:bg-slate-100 px-4 py-3 max-h-48 overflow-y-auto show-scrollbar">
          <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-theme-text-secondary opacity-70 mb-2">
            {t("chat_window.compact.summary_label")}
          </p>
          <p className="text-xs text-zinc-300 light:text-slate-600 whitespace-pre-wrap font-mono leading-relaxed">
            {summary}
          </p>
        </div>
      )}
    </div>
  );
}
