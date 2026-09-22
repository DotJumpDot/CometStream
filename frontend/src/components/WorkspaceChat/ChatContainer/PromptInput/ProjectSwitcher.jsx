import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  CaretDown,
  Check,
  ChatCircleText,
  Folder,
  FolderOpen,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import Workspace from "@/models/workspace";
import paths from "@/utils/paths";
import { OPEN_NEW_PROJECT_EVENT } from "@/utils/constants";
import { isDesktopApp, selectNativeFolder } from "@/utils/desktopBridge";

/**
 * ZCode-style project menu at the top of the composer: the current project
 * with a dropdown listing every project (searchable), an "Open folder…"
 * entry that opens the New Project modal from anywhere, and a "Chat
 * outside a project" entry that returns to the home composer. Switching
 * projects navigates to that project's chat (its draft page).
 */
export default function ProjectSwitcher({
  currentSlug = null,
  currentName = null,
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState(null);
  const [query, setQuery] = useState("");
  const [menuPos, setMenuPos] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      // Trigger and menu live apart (menu is portaled) - clicks in either
      // are inside; everything else closes.
      if (
        !rootRef.current?.contains(e.target) &&
        !menuRef.current?.contains(e.target)
      )
        setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    // The composer never scrolls under the menu, but a viewport change
    // would leave the fixed menu floating - just close it.
    const onViewport = () => setOpen(false);
    window.addEventListener("click", onClick);
    window.addEventListener("keyup", onKey);
    window.addEventListener("resize", onViewport);
    window.addEventListener("scroll", onViewport, true);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("resize", onViewport);
      window.removeEventListener("scroll", onViewport, true);
    };
  }, [open]);

  const toggle = async () => {
    if (!open) {
      if (triggerRef.current) {
        // Fixed drop-up position measured from the trigger: the composer
        // box is overflow-hidden, so a CSS drop-up would clip - the portal
        // escapes it entirely.
        const rect = triggerRef.current.getBoundingClientRect();
        setMenuPos({
          left: Math.max(8, rect.left),
          bottom: Math.max(8, window.innerHeight - rect.top + 4),
          width: 260,
        });
      }
      if (workspaces === null) {
        // Fetch lazily on first open - the sidebar already lists these, but
        // the composer mounts on pages without it (and must not add load).
        const all = await Workspace.all().catch(() => []);
        setWorkspaces(Workspace.orderWorkspaces(all));
      }
    }
    setQuery("");
    setOpen((prev) => !prev);
  };

  const goWorkspace = (slug) => {
    setOpen(false);
    navigate(paths.workspace.chat(slug));
  };

  const filtered = (workspaces || []).filter((ws) =>
    ws.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        className="border-none cursor-pointer flex items-center gap-x-1.5 h-[28px] px-2 rounded-lg text-[13px] text-zinc-300 light:text-slate-600 hover:bg-white/[0.06] light:hover:bg-black/[0.05] hover:text-white light:hover:text-slate-950 transition-colors max-w-[220px]"
      >
        <Folder size={14} className="shrink-0 opacity-70" />
        <span className="truncate font-medium">
          {currentName || t("project-switcher.no-workspaces")}
        </span>
        <CaretDown size={12} className="shrink-0 opacity-60" />
      </button>

      {open &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            // Portaled drop-up above the trigger: the composer box is
            // overflow-hidden, so only a portal escapes the clip.
            style={{
              position: "fixed",
              left: menuPos.left,
              bottom: menuPos.bottom,
              width: menuPos.width,
              zIndex: 60,
            }}
            className="rounded-xl border border-white/10 light:border-black/10 bg-zinc-900 light:bg-white shadow-xl p-1.5 flex flex-col gap-y-0.5"
          >
            <div className="flex items-center gap-x-2 px-2 h-[32px] rounded-lg bg-white/[0.04] light:bg-black/[0.04]">
              <MagnifyingGlass size={14} className="shrink-0 text-zinc-500" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("project-switcher.search-placeholder")}
                autoComplete="off"
                className="border-none outline-none bg-transparent flex-1 min-w-0 text-[13px] text-white light:text-slate-900 placeholder:text-zinc-600 light:placeholder:text-slate-400"
              />
            </div>

            <div className="max-h-[240px] overflow-y-auto flex flex-col gap-y-0.5 py-1">
              {filtered.length === 0 && (
                <p className="text-[12px] text-zinc-500 px-2 py-2">
                  {workspaces === null
                    ? t("common.loading")
                    : t("project-switcher.no-workspaces")}
                </p>
              )}
              {filtered.map((ws) => {
                const isCurrent = ws.slug === currentSlug;
                return (
                  <button
                    key={ws.slug}
                    type="button"
                    role="menuitem"
                    onClick={() => !isCurrent && goWorkspace(ws.slug)}
                    className="border-none cursor-pointer w-full rounded-lg flex items-center gap-x-2 px-2 h-[32px] text-[13px] text-zinc-300 light:text-slate-700 hover:bg-white/[0.06] light:hover:bg-black/[0.05] hover:text-white light:hover:text-slate-950 transition-colors"
                  >
                    <Folder size={14} className="shrink-0 opacity-60" />
                    <span className="flex-1 min-w-0 truncate text-left">
                      {ws.name}
                    </span>
                    {isCurrent && (
                      <Check size={14} weight="bold" className="shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="h-px bg-white/10 light:bg-black/10 my-1" />

            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                setOpen(false);
                // Desktop shell: the real OS folder dialog. The picked path
                // prefills the New Project modal (server jail-validates it).
                // Plain browser: the modal's jailed click-to-select picker.
                if (isDesktopApp()) {
                  const folder = await selectNativeFolder();
                  window.dispatchEvent(
                    new CustomEvent(OPEN_NEW_PROJECT_EVENT, {
                      detail: folder ? { folder } : {},
                    })
                  );
                  return;
                }
                window.dispatchEvent(new Event(OPEN_NEW_PROJECT_EVENT));
              }}
              className="border-none cursor-pointer w-full rounded-lg flex items-center gap-x-2 px-2 h-[32px] text-[13px] text-zinc-300 light:text-slate-700 hover:bg-white/[0.06] light:hover:bg-black/[0.05] hover:text-white light:hover:text-slate-950 transition-colors"
            >
              <FolderOpen size={14} className="shrink-0 opacity-60" />
              <span className="flex-1 min-w-0 truncate text-left">
                {t("project-switcher.open-folder")}
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                navigate(paths.home());
              }}
              className="border-none cursor-pointer w-full rounded-lg flex items-center gap-x-2 px-2 h-[32px] text-[13px] text-zinc-300 light:text-slate-700 hover:bg-white/[0.06] light:hover:bg-black/[0.05] hover:text-white light:hover:text-slate-950 transition-colors"
            >
              <ChatCircleText size={14} className="shrink-0 opacity-60" />
              <span className="flex-1 min-w-0 truncate text-left">
                {t("project-switcher.no-project")}
              </span>
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}
