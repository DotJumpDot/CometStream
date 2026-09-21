import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Workspace from "@/models/workspace";
import CustomLlmProviders from "@/models/customLlmProviders";
import useAnchoredOverlay from "./useAnchoredOverlay";

/**
 * Context-usage ring beside the model selector. The small ring fills with the
 * share of the model's context window the current conversation is estimated
 * to use; hovering it (or holding/clicking) opens a popover with the
 * breakdown - messages, system prompt, and attached/parsed files. Hover
 * peeks and auto-closes on leave; a click pins it open. Token counts are
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
  // A click (or hold) "pins" the popover: the invisible full-viewport
  // click-outside backdrop only renders for pinned opens. For hover peeks
  // the backdrop must NOT exist - it would sit between the cursor and the
  // ring, fire mouseleave, close the panel, and loop open/close forever.
  const [pinned, setPinned] = useState(false);
  const holdTimer = useRef(null);
  const didHold = useRef(false);
  const rootRef = useRef(null);
  const hoverOpenTimer = useRef(null);
  const hoverCloseTimer = useRef(null);
  const HOVER_OPEN_MS = 200;
  const HOVER_CLOSE_GRACE_MS = 350;
  const hoverPeek = open && !pinned;

  const clearHoverTimers = () => {
    if (hoverOpenTimer.current) clearTimeout(hoverOpenTimer.current);
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
    hoverOpenTimer.current = null;
    hoverCloseTimer.current = null;
  };

  const closePanel = useCallback(() => {
    clearHoverTimers();
    setPinned(false);
    setOpen(false);
  }, []);

  const onRingHoverEnter = () => {
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = null;
    if (open || hoverOpenTimer.current) return;
    hoverOpenTimer.current = setTimeout(() => {
      hoverOpenTimer.current = null;
      setPinned(false);
      setOpen(true);
    }, HOVER_OPEN_MS);
  };

  const onHoverLeave = () => {
    if (hoverOpenTimer.current) clearTimeout(hoverOpenTimer.current);
    hoverOpenTimer.current = null;
    // Only hover peeks close on leave; pinned panels need a click/Esc.
    if (!hoverPeek || hoverCloseTimer.current) return;
    hoverCloseTimer.current = setTimeout(() => {
      hoverCloseTimer.current = null;
      setOpen(false);
    }, HOVER_CLOSE_GRACE_MS);
  };

  useEffect(() => clearHoverTimers, []);

  // Fixed-position popover so the input box's overflow-hidden cannot clip it.
  const panelStyle = useAnchoredOverlay(open, rootRef, "right");

  // Esc closes the popover.
  useEffect(() => {
    if (!open) return;
    const onKey = (event) => {
      if (event.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closePanel]);

  const slug = workspace?.slug;

  // Limits that do not change with the conversation: the model's context
  // window and the parsed-file token count. Fetched on mount/param change
  // and refreshed whenever the popover opens (uploads may have changed the
  // file count). Everything else is derived live from chatHistory below, so
  // the ring tracks the conversation without needing a click.
  const [limits, setLimits] = useState({
    contextWindow: null,
    attachmentTokens: 0,
  });

  const fetchLimits = useCallback(async () => {
    const [contextWindow, parsed] = await Promise.all([
      provider
        ? CustomLlmProviders.contextWindow(provider, model)
        : Promise.resolve(null),
      slug
        ? Workspace.getParsedFiles(slug).catch(() => null)
        : Promise.resolve(null),
    ]);
    setLimits({
      contextWindow: contextWindow ?? parsed?.contextWindow ?? null,
      attachmentTokens: parsed?.currentContextTokenCount ?? 0,
    });
  }, [provider, model, slug]);

  useEffect(() => {
    fetchLimits().catch(() => {});
  }, [fetchLimits]);

  useEffect(() => {
    if (open) fetchLimits().catch(() => {});
  }, [open, fetchLimits]);

  // Synchronous estimate from the live history: recomputed on every history
  // change (new message, streaming chunk, compaction trim, chat switch).
  const usage = useMemo(() => {
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
    const used = messageTokens + systemPromptTokens + limits.attachmentTokens;
    return {
      messageTokens,
      systemPromptTokens,
      attachmentTokens: limits.attachmentTokens,
      contextWindow: limits.contextWindow,
      used,
      ratio: limits.contextWindow
        ? Math.min(used / limits.contextWindow, 1)
        : 0,
      messageCount: messages.length,
    };
  }, [chatHistory, workspace?.openAiPrompt, limits]);

  // Hold-to-open (like the reference UI) plus a plain click toggle that
  // pins the panel; hover handles the quick peek.
  const startHold = () => {
    didHold.current = false;
    holdTimer.current = setTimeout(() => {
      didHold.current = true;
      clearHoverTimers();
      setPinned(true);
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
    clearHoverTimers();
    if (open) {
      // An open panel toggles closed; a hover peek gets pinned instead.
      if (hoverPeek) setPinned(true);
      else closePanel();
      return;
    }
    setPinned(true);
    setOpen(true);
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
        onMouseEnter={onRingHoverEnter}
        onMouseLeave={onHoverLeave}
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
          {/* Click-outside catcher only for pinned opens - see `pinned`. */}
          {pinned && (
            <div
              className="fixed inset-0 z-30"
              onClick={(event) => {
                event.stopPropagation();
                closePanel();
              }}
            />
          )}
          <div
            onMouseEnter={onRingHoverEnter}
            onMouseLeave={onHoverLeave}
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
