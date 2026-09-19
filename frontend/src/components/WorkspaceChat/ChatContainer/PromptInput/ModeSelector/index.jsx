import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CaretDown,
  ChatCircleText,
  Check,
  FileMagnifyingGlass,
  Robot,
  Wrench,
} from "@phosphor-icons/react";
import useUser from "@/hooks/useUser";
import showToast from "@/utils/toast";
import Workspace from "@/models/workspace";
import useAnchoredOverlay from "../ModelSelector/useAnchoredOverlay";

/**
 * Chat mode pill on the left of the input (ZCode-style permission modes):
 * Agent (every message runs the agent - the default), Chat (RAG chat), and
 * Query docs (answers only from workspace documents). All three persist on
 * the workspace's chatMode; a live agent session always reads as Agent. The
 * "Agent skills" row opens the tools menu so what the agent may access can
 * be edited right here.
 */

const MODE_OPTIONS = [
  {
    value: "automatic",
    mode: "agent",
    icon: Robot,
    descriptionKey: "mode_selector.agent_description",
  },
  {
    value: "chat",
    mode: "chat",
    icon: ChatCircleText,
    descriptionKey: "mode_selector.chat_description",
  },
  {
    value: "query",
    mode: "query",
    icon: FileMagnifyingGlass,
    descriptionKey: "mode_selector.query_description",
  },
];

export default function ModeSelector({
  workspace,
  agentSessionActive = false,
  showAgentCommand = false,
  onOpenTools,
}) {
  const { t } = useTranslation();
  const { user } = useUser();
  const canEdit = !user || ["admin", "manager"].includes(user.role);
  const [open, setOpen] = useState(false);
  const [chatMode, setChatMode] = useState(workspace?.chatMode ?? "automatic");
  const rootRef = useRef(null);
  // Fixed-position dropdown so the input box's overflow-hidden cannot clip it.
  const panelStyle = useAnchoredOverlay(open, rootRef, "left");

  // Esc closes the dropdown.
  useEffect(() => {
    if (!open) return;
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    setChatMode(workspace?.chatMode ?? "automatic");
  }, [workspace?.chatMode, workspace?.slug]);

  const activeMode = useMemo(
    () =>
      agentSessionActive
        ? "agent"
        : MODE_OPTIONS.some((m) => m.value === chatMode)
          ? MODE_OPTIONS.find((m) => m.value === chatMode).mode
          : "agent",
    [agentSessionActive, chatMode]
  );

  const selectMode = async (value) => {
    setOpen(false);
    if (!canEdit || value === chatMode || !workspace?.slug) return;
    const { message } = await Workspace.update(workspace.slug, {
      chatMode: value,
    }).catch(() => ({ message: "Failed to update chat mode" }));
    if (message) {
      showToast(message, "error", { clearOnRouteChange: false });
      return;
    }
    setChatMode(value);
  };

  const ActiveIcon =
    activeMode === "agent"
      ? Robot
      : activeMode === "query"
        ? FileMagnifyingGlass
        : ChatCircleText;
  const activeLabel = t(
    activeMode === "agent"
      ? "mode_selector.agent"
      : activeMode === "query"
        ? "mode_selector.query"
        : "mode_selector.chat"
  );

  return (
    <div ref={rootRef} className="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={t("mode_selector.title")}
        className="group border-none cursor-pointer px-2 py-1 flex items-center gap-x-1 rounded-lg transition-colors duration-150 hover:bg-white/10"
      >
        <ActiveIcon size={13} className="text-theme-text-secondary shrink-0" />
        <span className="text-xs text-theme-text-secondary group-hover:text-theme-text-primary transition-colors duration-150 hidden sm:inline">
          {activeLabel}
        </span>
        <CaretDown
          size={10}
          className={`text-theme-text-secondary transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && panelStyle && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="cs-pop-in z-40 w-[300px] max-w-[calc(100vw-16px)] rounded-xl border border-theme-modal-border bg-theme-popup-menu-bg shadow-2xl overflow-hidden"
            style={{ ...panelStyle, transformOrigin: "bottom left" }}
          >
            <div className="py-1">
              {MODE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isActive =
                  !agentSessionActive && option.value === chatMode;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => selectMode(option.value)}
                    className={`w-full flex items-start gap-x-2.5 px-3 py-2 text-left transition-colors duration-100 ${
                      isActive ? "bg-white/10" : "hover:bg-white/5"
                    }`}
                  >
                    <Icon
                      size={14}
                      className="mt-0.5 text-theme-text-secondary shrink-0"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs text-theme-text-primary">
                        {t(`mode_selector.${option.mode}`)}
                      </span>
                      <span className="block text-[10px] leading-4 text-theme-text-secondary">
                        {t(option.descriptionKey)}
                      </span>
                    </span>
                    {isActive && (
                      <Check
                        size={13}
                        className="text-theme-button-cta shrink-0 mt-0.5"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {(showAgentCommand || activeMode === "agent") &&
              typeof onOpenTools === "function" && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onOpenTools();
                  }}
                  className="w-full flex items-center gap-x-2 px-3 py-2.5 border-t border-white/10 text-xs text-theme-text-secondary hover:text-theme-text-primary hover:bg-white/5 transition-colors duration-100"
                >
                  <Wrench size={13} />
                  {t("mode_selector.agent_skills")}
                </button>
              )}
          </div>
        </>
      )}
    </div>
  );
}
