import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  ChatCircleDots,
  House,
  MagnifyingGlass,
  MoonStars,
  Plus,
} from "@phosphor-icons/react";
import { isMobile } from "react-device-detect";
import paths from "@/utils/paths";
import Workspace from "@/models/workspace";
import { useTheme } from "@/hooks/useTheme";
import NewWorkspaceModal from "../Modals/NewWorkspace";
import { OPEN_COMMAND_PALETTE_EVENT } from "@/utils/constants";
import debounce from "lodash.debounce";

/**
 * ZCode-style command palette: one fuzzy box that searches workspaces and
 * threads and runs actions (new workspace, theme switch, open settings).
 * Opened with Ctrl+K / Ctrl+Shift+P anywhere in the app; desktop only.
 */
export default function CommandPalette() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { theme, setTheme, availableThemes } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [workspaces, setWorkspaces] = useState([]);
  const [threadResults, setThreadResults] = useState([]);
  const [showingNewWs, setShowingNewWs] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    setThreadResults([]);
  }, []);

  const openPalette = useCallback(() => {
    if (isMobile) return;
    setOpen(true);
    setQuery("");
    setActiveIndex(0);
    setThreadResults([]);
  }, []);

  // Opened via the global shortcut registry (Ctrl+K / Ctrl+Shift+P in
  // utils/keyboardShortcuts.js) or programmatically. Toggles so pressing the
  // shortcut while open closes it.
  const openRef = useRef(false);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    const onOpen = () => (openRef.current ? close() : openPalette());
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
  }, [openPalette, close]);

  // Load the workspace list each time the palette opens so it is fresh.
  useEffect(() => {
    if (!open) return;
    Workspace.all()
      .then((all) => setWorkspaces(all))
      .catch(() => setWorkspaces([]));
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const searchThreads = useMemo(
    () =>
      debounce((value) => {
        if (!value || value.length < 3) {
          setThreadResults([]);
          return;
        }
        Workspace.searchWorkspaceOrThread(value)
          .then((results) =>
            setThreadResults(
              (results?.threads ?? []).map((thread) => ({
                id: `${thread.workspace.slug}/${thread.slug}`,
                label: thread.name,
                hint: thread.workspace.name,
                run: () =>
                  navigate(
                    paths.workspace.thread(thread.workspace.slug, thread.slug)
                  ),
              }))
            )
          )
          .catch(() => setThreadResults([]));
      }, 300),
    [navigate]
  );

  const runQuery = (value) => {
    setQuery(value);
    setActiveIndex(0);
    searchThreads(value);
  };

  const items = useMemo(() => {
    const groups = [];
    const q = query.trim().toLowerCase();

    const matches = (label) => !q || label.toLowerCase().includes(q);

    const actions = [];
    if (matches(t("command_palette.action_new_workspace")))
      actions.push({
        id: "action:new-workspace",
        label: t("command_palette.action_new_workspace"),
        icon: <Plus size={15} />,
        run: () => setShowingNewWs(true),
      });
    Object.entries(availableThemes)
      .filter(([, name]) =>
        matches(`${t("command_palette.group_theme")}: ${name}`)
      )
      .forEach(([key, name]) =>
        actions.push({
          id: `theme:${key}`,
          label: `${t("command_palette.group_theme")}: ${name}`,
          icon: <MoonStars size={15} />,
          hint: key === theme ? t("command_palette.active") : undefined,
          run: () => setTheme(key),
        })
      );
    if (actions.length)
      groups.push({
        label: t("command_palette.group_actions"),
        items: actions,
      });

    const navigation = [];
    const navTargets = [
      { label: t("command_palette.nav_home"), to: paths.home() },
      { label: t("settings.customization"), to: paths.settings.interface() },
      { label: t("settings.chat"), to: paths.settings.chat() },
      { label: t("settings.llm"), to: paths.settings.llmPreference() },
      { label: t("settings.agents-and-mcp"), to: paths.settings.agentSkills() },
      { label: t("settings.security"), to: paths.settings.security() },
    ];
    navTargets.forEach((target, i) => {
      if (!matches(target.label)) return;
      navigation.push({
        id: `nav:${i}`,
        label: target.label,
        icon:
          target.to === paths.home() ? (
            <House size={15} />
          ) : (
            <ArrowRight size={15} />
          ),
        run: () => navigate(target.to),
      });
    });
    if (navigation.length)
      groups.push({
        label: t("command_palette.group_navigate"),
        items: navigation,
      });

    const wsItems = workspaces
      .filter((ws) => matches(ws.name))
      .slice(0, 8)
      .map((ws) => ({
        id: `ws:${ws.slug}`,
        label: ws.name,
        icon: <ChatCircleDots size={15} />,
        run: () => navigate(paths.workspace.chat(ws.slug)),
      }));
    if (wsItems.length)
      groups.push({
        label: t("command_palette.group_workspaces"),
        items: wsItems,
      });

    const matchedThreads = threadResults.filter((item) => matches(item.label));
    if (matchedThreads.length)
      groups.push({
        label: t("command_palette.group_threads"),
        items: matchedThreads,
      });

    return groups;
  }, [
    query,
    workspaces,
    threadResults,
    theme,
    availableThemes,
    setTheme,
    navigate,
    t,
  ]);

  const flatItems = useMemo(
    () => items.flatMap((group) => group.items),
    [items]
  );

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown" || (e.key === "n" && e.ctrlKey)) {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
    }
    if (e.key === "ArrowUp" || (e.key === "p" && e.ctrlKey)) {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const item = flatItems[activeIndex];
      if (item) {
        close();
        item.run();
      }
    }
  };

  // Keep the active row visible while arrowing through the list.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-palette-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (isMobile) return null;

  let runningIndex = -1;
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[999] flex items-start justify-center bg-black/50 backdrop-blur-[2px]"
          onClick={close}
        >
          <div
            className="cs-pop-in mt-[12vh] w-[92vw] max-w-[560px] rounded-xl border border-theme-modal-border bg-theme-bg-primary shadow-2xl overflow-hidden"
            style={{ transformOrigin: "top center" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-x-2.5 px-4 py-3 border-b border-theme-modal-border">
              <MagnifyingGlass
                size={15}
                className="text-theme-text-secondary shrink-0"
              />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => runQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={t("command_palette.placeholder")}
                className="flex-1 bg-transparent border-none outline-none text-sm text-theme-text-primary placeholder:text-theme-text-secondary"
                autoComplete="off"
                spellCheck={false}
              />
              <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-theme-modal-border text-theme-text-secondary shrink-0">
                ESC
              </kbd>
            </div>
            <div
              ref={listRef}
              className="max-h-[46vh] overflow-y-auto py-2"
              role="listbox"
              aria-label={t("command_palette.placeholder")}
            >
              {flatItems.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-theme-text-secondary">
                  {t("command_palette.no_results")}
                </div>
              )}
              {items.map((group) => (
                <div key={group.label} className="mb-1">
                  <p className="px-4 py-1 text-[10px] uppercase tracking-[0.08em] font-semibold text-theme-text-secondary opacity-60">
                    {group.label}
                  </p>
                  {group.items.map((item) => {
                    runningIndex += 1;
                    const index = runningIndex;
                    const isActive = index === activeIndex;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-palette-index={index}
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => {
                          close();
                          item.run();
                        }}
                        className={`w-full flex items-center gap-x-2.5 px-4 py-2 text-left text-[13px] transition-colors duration-100 ${
                          isActive
                            ? "bg-theme-sidebar-item-selected text-white light:text-black"
                            : "text-theme-text-primary hover:bg-white/5"
                        }`}
                      >
                        <span className="shrink-0 opacity-70">{item.icon}</span>
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.hint && (
                          <span className="text-[10px] text-theme-text-secondary shrink-0">
                            {item.hint}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {showingNewWs && (
        <NewWorkspaceModal hideModal={() => setShowingNewWs(false)} />
      )}
    </>
  );
}
