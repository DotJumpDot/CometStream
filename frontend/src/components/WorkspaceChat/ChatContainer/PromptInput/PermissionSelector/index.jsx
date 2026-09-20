import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CaretDown,
  Check,
  Lightning,
  ShieldCheck,
  ShieldWarning,
} from "@phosphor-icons/react";
import {
  getPermissionMode,
  setPermissionMode,
  subscribePermissionMode,
} from "@/utils/chat/permissions";
import useAnchoredOverlay from "../ModelSelector/useAnchoredOverlay";

/**
 * Tool permission pill in the chat bar (ZCode-style): picks how gated tool
 * calls are approved - ask every time, auto-approve for this chat, or
 * auto-approve and remember the tool permanently. Applies to the live agent
 * session immediately (the ChatContainer pushes changes over the socket)
 * and persists for future chats via localStorage.
 */

const MODE_OPTIONS = [
  {
    value: "ask",
    icon: ShieldWarning,
    titleKey: "permission.mode_ask",
    descriptionKey: "permission.mode_ask_description",
  },
  {
    value: "auto",
    icon: Lightning,
    titleKey: "permission.mode_auto",
    descriptionKey: "permission.mode_auto_description",
  },
  {
    value: "auto-remember",
    icon: ShieldCheck,
    titleKey: "permission.mode_auto_remember",
    descriptionKey: "permission.mode_auto_remember_description",
  },
];

export default function PermissionSelector() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(getPermissionMode);
  const rootRef = useRef(null);
  // Fixed-position dropdown so the input box's overflow-hidden cannot clip it.
  const panelStyle = useAnchoredOverlay(open, rootRef, "left");

  useEffect(() => subscribePermissionMode(setMode), []);

  // Esc closes the dropdown.
  useEffect(() => {
    if (!open) return;
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const active =
    MODE_OPTIONS.find((option) => option.value === mode) ?? MODE_OPTIONS[0];
  const ActiveIcon = active.icon;

  return (
    <div ref={rootRef} className="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={t("permission.title")}
        className="group border-none cursor-pointer px-2 py-1 flex items-center gap-x-1 rounded-lg transition-colors duration-150 hover:bg-white/10"
      >
        <ActiveIcon
          size={13}
          className={`shrink-0 ${
            mode === "ask"
              ? "text-theme-text-secondary"
              : "text-amber-400 light:text-amber-600"
          }`}
        />
        <span className="text-xs text-theme-text-secondary group-hover:text-theme-text-primary transition-colors duration-150 hidden sm:inline">
          {t(active.titleKey)}
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
            className="cs-pop-in z-40 w-[300px] max-w-[calc(100vw-16px)] rounded-xl border border-theme-modal-border bg-theme-bg-popup-menu shadow-2xl overflow-hidden"
            style={{ ...panelStyle, transformOrigin: "bottom left" }}
          >
            <div className="py-1">
              {MODE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isActive = option.value === mode;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setPermissionMode(option.value);
                      setOpen(false);
                    }}
                    className={`w-full flex items-start gap-x-2.5 px-3 py-2 text-left transition-colors duration-100 ${
                      isActive ? "bg-white/10" : "hover:bg-white/5"
                    }`}
                  >
                    <Icon
                      size={14}
                      className={`mt-0.5 shrink-0 ${
                        option.value === "ask"
                          ? "text-theme-text-secondary"
                          : "text-amber-400 light:text-amber-600"
                      }`}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs text-theme-text-primary">
                        {t(option.titleKey)}
                      </span>
                      <span className="block text-[10px] leading-4 text-theme-text-secondary">
                        {t(option.descriptionKey)}
                      </span>
                    </span>
                    {isActive && (
                      <Check
                        size={13}
                        className="text-cta-button shrink-0 mt-0.5"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
