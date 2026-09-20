import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Workspace from "@/models/workspace";
import CustomLlmProviders from "@/models/customLlmProviders";
import useAnchoredOverlay from "./useAnchoredOverlay";

/**
 * Context-usage ring beside the model selector. The small ring fills with the
 * share of the model's context window the current conversation is estimated
 * to use; holding (or clicking) it opens a popover with the breakdown -
 * messages, system prompt, and attached/parsed files. Token counts are
 * estimates (chars/4) except where the backend reports real counts.
 */

const RING_SIZE = 18;
const RING_STROKE = 2.5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function estimateTokens(text) {
  if (!text || typeof text !== "string") return 0;
  return Math.ceil(text.length / 4);
}

function ringColor(ratio) {
  if (ratio >= 0.95) return "#f87171";
  if (ratio >= 0.8) return "#fbbf24";
  return "var(--theme-button-cta)";
}

export default function ContextRing({
  provider,
  model,
  workspace,
  chatHistory = [],
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState(null);
  const holdTimer = useRef(null);
  const didHold = useRef(false);
  const rootRef = useRef(null);
  // Fixed-position popover so the input box's overflow-hidden cannot clip it.
  const panelStyle = useAnchoredOverlay(open, rootRef, "right");

  // Esc closes the popover.
  useEffect(() => {
    if (!open) return;
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const slug = workspace?.slug;

  const gatherUsage = useCallback(async () => {
    // Message history estimate (skip tool/status cards without plain content).
    const messages = (chatHistory ?? [])
      .filter(
        (message) => typeof message?.content === "string" && message.content
      )
      .map((message) => message.content);
    const messageTokens = messages.reduce(
      (sum, content) => sum + estimateTokens(content),
      0
    );
    const systemPromptTokens = estimateTokens(workspace?.openAiPrompt ?? "");

    const [contextWindow, parsed] = await Promise.all([
      provider
        ? CustomLlmProviders.contextWindow(provider, model)
        : Promise.resolve(null),
      slug
        ? Workspace.getParsedFiles(slug).catch(() => null)
        : Promise.resolve(null),
    ]);

    const attachmentTokens = parsed?.currentContextTokenCount ?? 0;
    const limit = contextWindow ?? parsed?.contextWindow ?? null;
    const used = messageTokens + systemPromptTokens + attachmentTokens;
    setUsage({
      messageTokens,
      systemPromptTokens,
      attachmentTokens,
      contextWindow: limit,
      used,
      ratio: limit ? Math.min(used / limit, 1) : 0,
      messageCount: messages.length,
    });
  }, [chatHistory, provider, model, slug, workspace?.openAiPrompt]);

  useEffect(() => {
    if (open) gatherUsage();
  }, [open, gatherUsage]);

  // Hold-to-open (like the reference UI) plus a plain click toggle.
  const startHold = () => {
    didHold.current = false;
    holdTimer.current = setTimeout(() => {
      didHold.current = true;
      setOpen(true);
    }, 250);
  };
  const endHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  const onClick = () => {
    if (didHold.current) {
      didHold.current = false;
      return;
    }
    setOpen((value) => !value);
  };

  const pctLabel = useMemo(() => {
    if (!usage?.contextWindow) return "";
    return `${Math.round(usage.ratio * 100)}%`;
  }, [usage]);

  // Null while gathering, or when the limit is unknown -> non-numeric UI.
  const unavailable = !usage || !usage.contextWindow;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={t("context_ring.title")}
        title={t("context_ring.title")}
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerLeave={endHold}
        onClick={onClick}
        className="border-none cursor-pointer p-0.5 rounded-full hover:bg-white/10 transition-colors duration-150 flex items-center justify-center"
      >
        <svg
          width={RING_SIZE}
          height={RING_SIZE}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          aria-hidden="true"
        >
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth={RING_STROKE}
          />
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke={ringColor(usage?.ratio ?? 0)}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - (usage?.ratio ?? 0))}
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            style={{ transition: "stroke-dashoffset 300ms var(--ease-out)" }}
          />
        </svg>
      </button>

      {open && panelStyle && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
            }}
          />
          <div
            className="cs-pop-in z-40 w-[280px] max-w-[calc(100vw-16px)] rounded-xl border border-theme-modal-border bg-theme-bg-popup-menu shadow-2xl p-3"
            style={{ ...panelStyle, transformOrigin: "bottom right" }}
          >
            <div className="text-xs font-medium text-theme-text-primary mb-2">
              {t("context_ring.title")}
            </div>

            {!usage ? (
              <div className="text-[11px] text-theme-text-secondary">
                {t("context_ring.loading")}
              </div>
            ) : unavailable ? (
              <div className="text-[11px] text-theme-text-secondary">
                {t("context_ring.unknown_limit")}
              </div>
            ) : (
              <>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-[11px] text-theme-text-secondary">
                    {usage.used.toLocaleString()} /{" "}
                    {usage.contextWindow.toLocaleString()}
                  </span>
                  <span className="text-[11px] font-medium text-theme-text-primary">
                    {pctLabel}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-3">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(usage.ratio * 100, usage.ratio > 0 ? 2 : 0)}%`,
                      background: ringColor(usage.ratio),
                      transition: "width 300ms var(--ease-out)",
                    }}
                  />
                </div>

                <div className="flex flex-col gap-y-1">
                  <UsageRow
                    label={t("context_ring.messages", {
                      count: usage.messageCount,
                    })}
                    tokens={usage.messageTokens}
                  />
                  <UsageRow
                    label={t("context_ring.system_prompt")}
                    tokens={usage.systemPromptTokens}
                  />
                  <UsageRow
                    label={t("context_ring.attachments")}
                    tokens={usage.attachmentTokens}
                  />
                </div>

                <div className="mt-2.5 pt-2 border-t border-white/10 text-[10px] text-theme-text-secondary">
                  {t("context_ring.estimated")}
                  {model ? ` · ${model}` : ""}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function UsageRow({ label, tokens }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-theme-text-secondary">{label}</span>
      <span className="text-[11px] text-theme-text-primary">
        ~{tokens.toLocaleString()}
      </span>
    </div>
  );
}
