import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import {
  CheckCircle,
  Circle,
  FilePlus,
  FlowArrow,
  GitDiff,
  ListChecks,
  PencilSimple,
  Robot,
  SidebarSimple,
  SpinnerGap,
  Stack,
  Terminal,
  X,
} from "@phosphor-icons/react";
import {
  getAgentActivity,
  groupSessions,
  groupTrajectory,
  resetAgentActivity,
  rollupSessionGroup,
  rollupTrajectoryGroup,
  shortCommand,
  subscribeAgentActivity,
  TRAJECTORY_WINDOW,
  windowTrajectory,
} from "@/utils/agentActivity";
import {
  getLatestSources,
  resetLatestSources,
  subscribeLatestSources,
} from "@/utils/chat/sourcesStore";
import {
  splitPath,
  UnifiedDiffView,
} from "@/components/WorkspaceChat/ChatContainer/ChatHistory/FileChangeCard/shared.jsx";
import {
  CitationDetailModal,
  combineLikeSources,
} from "@/components/WorkspaceChat/ChatContainer/ChatHistory/Citation";
import SourceItem from "@/components/WorkspaceChat/ChatContainer/SourcesSidebar/SourceItem";
import ChatSidebar from "@/components/WorkspaceChat/ChatContainer/ChatSidebar";
import FileViewer from "./FileViewer";

/**
 * Window event that opens the side panel (e.g. from composer toolbar
 * buttons). `detail.section` optionally scrolls to a section id.
 * @type {string}
 */
export const AGENT_PANEL_OPEN_EVENT = "agent-side-panel-open";

/**
 * Window event that toggles the side panel (e.g. from the chat header
 * button). Opening resets to the panel home; closing leaves state alone.
 * @type {string}
 */
export const AGENT_PANEL_TOGGLE_EVENT = "agent-side-panel-toggle";

/**
 * Chat header button for the agent side panel: same 35px circle metrics as
 * the chat settings button it sits next to. Dispatches a toggle - the
 * panel owns its open state, the header stays stateless.
 */
export function AgentPanelButton() {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(new CustomEvent(AGENT_PANEL_TOGGLE_EVENT))
      }
      title={t("agent_panel.open")}
      aria-label={t("agent_panel.open")}
      className="group border-none cursor-pointer hidden md:flex items-center justify-center w-[35px] h-[35px] rounded-full transition-all hover:bg-zinc-700 light:hover:bg-slate-200"
    >
      <SidebarSimple
        size={18}
        className="text-zinc-300 light:text-slate-600 group-hover:text-white light:group-hover:text-slate-800"
      />
    </button>
  );
}

/**
 * Right-docked agent side panel (ZCode-style): one merged view of the
 * session's work - Changes on top (aggregated file changes with
 * click-to-expand diffs), Plan below (the todo-write stepper), Sessions
 * (terminal executions + subagent runs with expandable output), and Sources
 * (the chat's latest citations). Hidden by default; opens itself the first
 * time an agent event lands, and can be toggled with the chat header
 * button or opened from the composer toolbar buttons.
 *
 * Uses the same ChatSidebar animation wrapper as the Sources panel so both
 * right-side panels share the identical open/close motion. Session-scoped
 * like the chat activity chain: state resets when the active chat changes
 * and nothing is persisted.
 */
export default function AgentSidePanel() {
  const { t } = useTranslation();
  // `chatKey` covers both workspace and thread switches.
  const { slug = "", threadSlug = "" } = useParams();
  const chatKey = `${slug}/${threadSlug}`;

  const [open, setOpen] = useState(false);
  const [activity, setActivity] = useState(getAgentActivity);
  const [sources, setSources] = useState(getLatestSources);
  // Sandbox-relative path being read in the file viewer; null shows the
  // panel's normal Changes/Plan/Sources sections.
  const [viewerPath, setViewerPath] = useState(null);
  const sessionsRef = useRef(null);
  // Ref mirror so the toggle handler always reads the current state
  // (assigned in an effect - refs must not be touched during render).
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // Layout effect on purpose: the sources store is populated by the new
  // chat's message actions in passive effects, which run after layout
  // effects - resetting here first means the fresh sources survive.
  // The panel's open state survives the switch on purpose: slamming it
  // shut on every thread change reflows the whole screen and reads as a
  // flash. Only the per-thread content resets.
  useLayoutEffect(() => {
    resetAgentActivity();
    resetLatestSources();
    setViewerPath(null);
  }, [chatKey]);

  useEffect(() => subscribeAgentActivity(setActivity), []);
  useEffect(() => subscribeLatestSources(setSources), []);

  // Composer toolbar buttons (terminal / subagent) open the panel here.
  // `detail.section` scrolls to a section anchor (currently "sessions").
  useEffect(() => {
    const onOpen = (event) => {
      setViewerPath(null);
      setOpen(true);
      const section = event?.detail?.section;
      if (section === "sessions") {
        // Wait a tick for the panel to lay out before scrolling.
        setTimeout(() => {
          sessionsRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }, 100);
      }
    };
    window.addEventListener(AGENT_PANEL_OPEN_EVENT, onOpen);
    const onToggle = () => {
      // Opening resets to the panel home; closing keeps state for next time.
      if (!openRef.current) {
        setViewerPath(null);
        setOpen(true);
      } else {
        setOpen(false);
      }
    };
    window.addEventListener(AGENT_PANEL_TOGGLE_EVENT, onToggle);
    return () => {
      window.removeEventListener(AGENT_PANEL_OPEN_EVENT, onOpen);
      window.removeEventListener(AGENT_PANEL_TOGGLE_EVENT, onToggle);
    };
  }, []);

  // File references render inside markdown HTML (dangerouslySetInnerHTML),
  // so clicks are delegated at the document level: any [data-file-ref]
  // element - in any message, thought, or card - opens the file reader.
  useEffect(() => {
    const onClick = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const ref = target?.closest("[data-file-ref]");
      if (!ref) return;
      const filePath = ref.getAttribute("data-file-ref");
      if (!filePath) return;
      event.preventDefault();
      setViewerPath(filePath);
      setOpen(true);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // Auto-open once per chat when the agent produces panel content.
  useEffect(() => {
    const hasContent =
      activity.todo.length > 0 || activity.fileChanges.length > 0;
    if (hasContent) setOpen(true);
  }, [activity.todo.length, activity.fileChanges.length]);

  const todoDone = activity.todo.filter((i) => i.status === "done").length;
  const totals = activity.fileChanges.reduce(
    (acc, c) => ({
      added: acc.added + c.added,
      removed: acc.removed + c.removed,
    }),
    { added: 0, removed: 0 }
  );
  const combinedSources = useMemo(() => combineLikeSources(sources), [sources]);

  return (
    // `contents` on md+ keeps the ChatSidebar flex item laid out by the
    // app-level row; the whole panel (open affordance included) hides below
    // the md breakpoint, where the header button hides too.
    <div className="hidden md:contents">
      {/* Card fills the 382px wrapper (374 + 0 + 8): it docks 16px off
          the chat (same rhythm as the screen margins) and the content
          gains the freed width for diffs/output. The top offset is
          relative positioning (not mt-4): child margins collapse through
          the animation wrapper above, which would pin the card to the
          viewport top and leave it 16px short at the bottom. */}
      <ChatSidebar isOpen={open} width={382}>
        <aside
          className="relative top-4 ml-0 mr-2 w-[374px] rounded-[16px] bg-zinc-900 light:bg-white light:border-2 light:border-slate-300 flex flex-col overflow-hidden"
          style={{ height: "calc(100% - 32px)" }}
        >
          {viewerPath ? (
            <FileViewer
              workspaceSlug={slug}
              filePath={viewerPath}
              onBack={() => setViewerPath(null)}
              onClose={() => setOpen(false)}
            />
          ) : (
            <>
              <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-white/10 light:border-black/10">
                <p className="font-medium text-base leading-6 text-white light:text-slate-900">
                  {t("agent_panel.title")}
                </p>
                <button
                  onClick={() => setOpen(false)}
                  type="button"
                  aria-label={t("agent_panel.close")}
                  title={t("agent_panel.close")}
                  className="text-white/60 light:text-slate-400 hover:text-white light:hover:text-slate-900 transition-colors border-none bg-transparent cursor-pointer"
                >
                  <X size={16} weight="bold" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
                <section>
                  <SectionHeader
                    icon={<GitDiff className="w-3.5 h-3.5" />}
                    label={t("agent_panel.tab_changes")}
                    count={activity.fileChanges.length}
                    right={
                      activity.fileChanges.length > 0 && (
                        <span className="flex items-center gap-x-1.5 font-mono text-xs">
                          {totals.added > 0 && (
                            <span className="text-emerald-500 light:text-emerald-600">
                              +{totals.added}
                            </span>
                          )}
                          {totals.removed > 0 && (
                            <span className="text-red-400 light:text-red-500">
                              &minus;{totals.removed}
                            </span>
                          )}
                        </span>
                      )
                    }
                  />
                  <ChangesTab changes={activity.fileChanges} />
                </section>
                <section>
                  <SectionHeader
                    icon={<ListChecks className="w-3.5 h-3.5" />}
                    label={t("agent_panel.tab_plan")}
                    count={activity.todo.length}
                    right={
                      activity.todo.length > 0 && (
                        <span className="text-xs text-zinc-500 light:text-zinc-400 tabular-nums">
                          {todoDone}/{activity.todo.length}
                        </span>
                      )
                    }
                  />
                  <PlanTab items={activity.todo} done={todoDone} />
                </section>
                <section ref={sessionsRef} className="scroll-mt-2">
                  <SectionHeader
                    icon={<Terminal className="w-3.5 h-3.5" />}
                    label={t("agent_panel.tab_sessions")}
                    count={activity.sessions.length}
                    right={
                      activity.sessions.some((s) => s.status === "running") && (
                        <span className="flex items-center gap-x-1 text-[11px] text-sky-400 light:text-sky-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                          {t("agent_panel.sessions_running")}
                        </span>
                      )
                    }
                  />
                  <SessionsTab sessions={activity.sessions} />
                </section>
                {activity.trajectory.length > 0 && (
                  <section>
                    <SectionHeader
                      icon={<FlowArrow className="w-3.5 h-3.5" />}
                      label={t("agent_panel.tab_trajectory")}
                      count={activity.trajectory.length}
                    />
                    <TrajectoryTab records={activity.trajectory} />
                  </section>
                )}
                {combinedSources.length > 0 && (
                  <section>
                    <SectionHeader
                      icon={<Stack className="w-3.5 h-3.5" />}
                      label={t("agent_panel.tab_sources")}
                      count={combinedSources.length}
                    />
                    <SourcesTab sources={combinedSources} />
                  </section>
                )}
              </div>
            </>
          )}
        </aside>
      </ChatSidebar>
    </div>
  );
}

/**
 * Lists the chat's citation sources with the same rows the Sources side
 * panel uses; clicking one opens the full citation text in a modal.
 * @param {Object} props
 * @param {Array} props.sources - combined sources (combineLikeSources output)
 */
function SourcesTab({ sources }) {
  const [selected, setSelected] = useState(null);

  return (
    <div className="flex flex-col gap-3">
      {sources.map((source, idx) => (
        <SourceItem
          key={source.title || idx}
          source={source}
          onClick={() => setSelected(source)}
        />
      ))}
      {selected && (
        <CitationDetailModal
          source={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

/**
 * Small uppercase section label with an icon, optional count chip, and an
 * optional right-aligned detail.
 */
function SectionHeader({ icon, label, count = 0, right = null }) {
  return (
    <div className="flex items-center gap-x-2 mb-2">
      <span className="flex items-center gap-x-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 light:text-zinc-400">
        {icon}
        {label}
      </span>
      {count > 0 && (
        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-white/10 light:bg-black/10 text-[10px] leading-[18px] text-center text-zinc-300 light:text-zinc-500 tabular-nums">
          {count}
        </span>
      )}
      {right && <span className="ml-auto flex items-center">{right}</span>}
    </div>
  );
}

/**
 * Trae-style plan stepper: one colored status badge per step with a
 * connecting rail, a progress bar summary on top, and a per-step status
 * label so the agent's current step reads at a glance.
 * @param {Object} props
 * @param {Array<{content: string, status: string}>} props.items
 * @param {number} props.done - completed item count
 */
function PlanTab({ items, done }) {
  const { t } = useTranslation();

  if (items.length === 0)
    return (
      <p className="text-xs text-zinc-500 light:text-zinc-400 mt-4">
        {t("agent_panel.plan_empty")}
      </p>
    );

  const percent = Math.round((done / items.length) * 100);

  return (
    <div className="mt-1">
      <div className="flex items-center justify-between text-xs text-zinc-400 light:text-zinc-500 mb-2">
        <span className="tabular-nums">{percent}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 light:bg-black/10 overflow-hidden">
        <div
          className="h-full bg-emerald-500/80 rounded-full transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <ol className="mt-4">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          const label =
            item.status === "done"
              ? t("agent_panel.status_done")
              : item.status === "in_progress"
                ? t("agent_panel.status_in_progress")
                : t("agent_panel.status_pending");
          return (
            <li key={i} className="relative flex gap-x-3 pb-4 last:pb-0">
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`absolute left-[13px] top-[30px] bottom-[-2px] w-px ${
                    item.status === "done"
                      ? "bg-emerald-500/30"
                      : "bg-white/10 light:bg-black/10"
                  }`}
                />
              )}
              <span
                className={`relative z-[1] flex h-[26px] w-[26px] items-center justify-center rounded-full shrink-0 ${
                  item.status === "done"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : item.status === "in_progress"
                      ? "bg-cta-button/15 text-cta-button"
                      : "bg-white/5 light:bg-black/5 text-zinc-500 light:text-zinc-400"
                }`}
              >
                {item.status === "done" ? (
                  <CheckCircle weight="bold" className="w-3.5 h-3.5" />
                ) : item.status === "in_progress" ? (
                  <SpinnerGap className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Circle className="w-3 h-3" />
                )}
              </span>
              <div className="min-w-0 pt-0.5">
                <p
                  className={`text-[13px] leading-5 ${
                    item.status === "done"
                      ? "text-zinc-500 light:text-zinc-400 line-through"
                      : item.status === "in_progress"
                        ? "text-white light:text-zinc-900 font-medium"
                        : "text-zinc-300 light:text-zinc-600"
                  }`}
                >
                  {item.content}
                </p>
                <p className="text-[11px] text-zinc-500 light:text-zinc-400 mt-0.5">
                  {label}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Sessions tab: terminal executions + subagent runs, newest first. Each row
 * shows live status; clicking expands the full command / output / result so
 * the panel doubles as the session inspector. Filter chips narrow by kind.
 * Consecutive runs of the same command fold into one "N similar runs"
 * group row (marathon runs collapse from 50 rows to a handful); expanding
 * a group reveals its members with the same row UI.
 * @param {Object} props
 * @param {Array<{id: number|string, kind: string, label: string, status: string, detail: string, startedAt: number, endedAt: number|null}>} props.sessions
 */
function SessionsTab({ sessions }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  const [expandedGroup, setExpandedGroup] = useState(null);

  if (sessions.length === 0)
    return (
      <p className="text-xs text-zinc-500 light:text-zinc-400 mt-4">
        {t("agent_panel.sessions_empty")}
      </p>
    );

  const visible =
    filter === "all" ? sessions : sessions.filter((s) => s.kind === filter);
  const groups = groupSessions(visible);

  return (
    <div className="mt-1">
      <div className="flex items-center gap-x-1.5 mb-2">
        {[
          { key: "all", label: t("agent_panel.sessions_filter_all") },
          { key: "terminal", label: t("agent_panel.sessions_filter_terminal") },
          { key: "subagent", label: t("agent_panel.sessions_filter_subagent") },
        ].map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setFilter(chip.key)}
            className={`border-none cursor-pointer rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
              filter === chip.key
                ? "bg-white/15 light:bg-black/10 text-white light:text-zinc-900"
                : "text-zinc-500 light:text-zinc-400 hover:text-zinc-300 light:hover:text-zinc-600"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-y-1">
        {groups.map((group) => {
          if (group.members.length === 1) {
            const session = group.members[0];
            return (
              <SessionRow
                key={session.id}
                session={session}
                expanded={expandedId === session.id}
                onToggle={() =>
                  setExpandedId(expandedId === session.id ? null : session.id)
                }
              />
            );
          }
          const rollup = rollupSessionGroup(group);
          const open = expandedGroup === group.key;
          const dot =
            rollup.status === "running"
              ? "bg-sky-400 animate-pulse"
              : rollup.status === "error"
                ? "bg-red-400"
                : "bg-emerald-400";
          const KindIcon = group.kind === "subagent" ? Robot : Terminal;
          return (
            <div
              key={group.key}
              // Group headers carry a sky tint so a folded "N similar runs"
              // row never reads as a plain singleton row.
              className="rounded-lg bg-sky-500/[0.08] light:bg-sky-600/[0.08] overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setExpandedGroup(open ? null : group.key)}
                title={group.label}
                className="flex items-center gap-x-2 w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.05] light:hover:bg-black/[0.05] transition-colors border-none cursor-pointer"
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                <KindIcon className="w-3.5 h-3.5 text-zinc-400 light:text-zinc-500 shrink-0" />
                <span className="flex-1 min-w-0 truncate text-[12px] text-zinc-200 light:text-zinc-800 font-mono">
                  {shortCommand(group.label)}
                </span>
                <span className="rounded-full bg-sky-500/15 light:bg-sky-600/15 px-1.5 py-px text-[10px] font-medium text-sky-300 light:text-sky-700 tabular-nums shrink-0">
                  {t("agent_panel.similar_runs", { count: rollup.count })}
                </span>
                {rollup.ms != null && (
                  <span className="text-[10px] text-zinc-500 light:text-zinc-400 tabular-nums shrink-0">
                    {rollup.ms < 1000
                      ? `${rollup.ms}ms`
                      : `${(rollup.ms / 1000).toFixed(1)}s`}
                  </span>
                )}
              </button>
              {open && (
                <div className="px-1 pb-1 flex flex-col gap-y-1">
                  {group.members.map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      nested={true}
                      expanded={expandedId === session.id}
                      onToggle={() =>
                        setExpandedId(
                          expandedId === session.id ? null : session.id
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && (
          <p className="text-xs text-zinc-500 light:text-zinc-400">
            {t("agent_panel.sessions_filter_empty")}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * One session row: status dot, kind icon, truncated label, duration, and
 * an expandable output tail. Shared by singleton rows and group members;
 * members render on a darker inset surface so they read as "inside" the
 * tinted group header.
 */
function SessionRow({ session, expanded, onToggle, nested = false }) {
  const KindIcon = session.kind === "subagent" ? Robot : Terminal;
  const dot =
    session.status === "running"
      ? "bg-sky-400 animate-pulse"
      : session.status === "error"
        ? "bg-red-400"
        : "bg-emerald-400";
  const ms =
    session.endedAt != null && session.startedAt != null
      ? session.endedAt - session.startedAt
      : null;
  return (
    <div
      className={`rounded-lg overflow-hidden ${
        // Nested members sit on a darker inset surface so they read as
        // "inside" the tinted group header.
        nested
          ? "bg-zinc-950/50 light:bg-slate-100"
          : "bg-white/[0.04] light:bg-black/[0.04]"
      }`}
    >
      {" "}
      <button
        type="button"
        onClick={onToggle}
        title={session.label}
        className="flex items-center gap-x-2 w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.05] light:hover:bg-black/[0.05] transition-colors border-none cursor-pointer"
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
        <KindIcon className="w-3.5 h-3.5 text-zinc-400 light:text-zinc-500 shrink-0" />
        <span
          className={`flex-1 min-w-0 truncate text-[12px] text-zinc-200 light:text-zinc-800 ${
            session.kind === "terminal" ? "font-mono" : ""
          }`}
        >
          {shortCommand(session.label)}
        </span>
        {Number.isFinite(ms) && ms >= 0 && (
          <span className="text-[10px] text-zinc-500 light:text-zinc-400 tabular-nums shrink-0">
            {ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`}
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

/**
 * Trajectory tab: one row per LLM iteration (per-turn debug view for local
 * models) - what the turn sent (message deltas), what it requested (tool
 * calls with arg previews), and usage. Expands inline. Session-only.
 * Consecutive iterations with the same model and tool set fold into one
 * "#a–#b" range group (marathon runs collapse from 100 rows to a handful);
 * groups beyond the recent window hide behind a "show all" expander.
 * @param {Object} props
 * @param {Array} props.records - trajectoryEvent payloads in order
 */
function TrajectoryTab({ records }) {
  const { t } = useTranslation();
  const [expandedSeq, setExpandedSeq] = useState(null);
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [showAll, setShowAll] = useState(false);

  if (records.length === 0)
    return (
      <p className="text-xs text-zinc-500 light:text-zinc-400 mt-4">
        {t("agent_panel.trajectory_empty")}
      </p>
    );

  const groups = groupTrajectory(records);
  const visible = windowTrajectory(groups, showAll);

  return (
    <div className="flex flex-col gap-y-1 mt-1">
      {groups.length > TRAJECTORY_WINDOW && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="border-none cursor-pointer self-start rounded-full px-2 py-0.5 text-[11px] font-medium text-zinc-400 light:text-zinc-500 hover:text-white light:hover:text-zinc-900 hover:bg-white/[0.06] light:hover:bg-black/[0.05] transition-colors"
        >
          {showAll
            ? t("agent_panel.show_recent")
            : t("agent_panel.show_all", { count: groups.length })}
        </button>
      )}
      {visible.map((group) => {
        if (group.members.length === 1) {
          const record = group.members[0];
          return (
            <TrajectoryRow
              key={record.seq}
              record={record}
              expanded={expandedSeq === record.seq}
              onToggle={() =>
                setExpandedSeq(expandedSeq === record.seq ? null : record.seq)
              }
            />
          );
        }
        const rollup = rollupTrajectoryGroup(group);
        const open = expandedGroup === group.key;
        const usageText = [
          rollup.prompt > 0 ? `${rollup.prompt}p` : null,
          rollup.completion > 0 ? `${rollup.completion}c` : null,
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <div
            key={group.key}
            // Range groups carry a violet tint so a folded "#a–#b" row
            // never reads as a plain singleton iteration row.
            className="rounded-lg bg-violet-500/[0.08] light:bg-violet-600/[0.08] overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setExpandedGroup(open ? null : group.key)}
              className="flex items-center gap-x-2 w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.05] light:hover:bg-black/[0.05] transition-colors border-none cursor-pointer"
            >
              <span className="text-[10px] font-mono text-zinc-500 light:text-zinc-400 tabular-nums shrink-0">
                #{group.from}–{group.to}
              </span>
              <span className="flex-1 min-w-0 truncate text-[12px] text-zinc-200 light:text-zinc-800 font-mono">
                {group.model}
              </span>
              <span className="rounded-full bg-violet-500/15 light:bg-violet-600/15 px-1.5 py-px text-[10px] font-medium text-violet-300 light:text-violet-700 tabular-nums shrink-0">
                {t("agent_panel.similar_iterations", {
                  count: rollup.count,
                })}
              </span>
              {rollup.tools > 0 && (
                <span className="text-[10px] text-amber-400 light:text-amber-600 tabular-nums shrink-0">
                  {rollup.tools} tool{rollup.tools === 1 ? "" : "s"}
                </span>
              )}
              {usageText && (
                <span className="text-[10px] text-zinc-500 light:text-zinc-400 tabular-nums shrink-0">
                  {usageText}
                </span>
              )}
            </button>
            {open && (
              <div className="px-1 pb-1 flex flex-col gap-y-1">
                {group.members.map((record) => (
                  <TrajectoryRow
                    key={record.seq}
                    record={record}
                    nested={true}
                    expanded={expandedSeq === record.seq}
                    onToggle={() =>
                      setExpandedSeq(
                        expandedSeq === record.seq ? null : record.seq
                      )
                    }
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * One trajectory iteration row: seq, model, tool count, usage, and an
 * expandable tools/messages detail. Shared by singleton rows and group
 * members; members render on a darker inset surface so they read as
 * "inside" the tinted range header.
 */
function TrajectoryRow({ record, expanded, onToggle, nested = false }) {
  const { t } = useTranslation();
  const tools = record.requestedTools || [];
  const deltas = record.newMessages || [];
  const usage = record.usage || {};
  const usageText = [
    usage.prompt_tokens != null ? `${usage.prompt_tokens}p` : null,
    usage.completion_tokens != null ? `${usage.completion_tokens}c` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={`rounded-lg overflow-hidden ${
        nested
          ? "bg-zinc-950/50 light:bg-slate-100"
          : "bg-white/[0.04] light:bg-black/[0.04]"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-x-2 w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.05] light:hover:bg-black/[0.05] transition-colors border-none cursor-pointer"
      >
        <span className="text-[10px] font-mono text-zinc-500 light:text-zinc-400 tabular-nums shrink-0">
          #{record.seq}
        </span>
        <span className="flex-1 min-w-0 truncate text-[12px] text-zinc-200 light:text-zinc-800 font-mono">
          {record.model || record.provider || "llm"}
        </span>
        {tools.length > 0 && (
          <span className="text-[10px] text-amber-400 light:text-amber-600 tabular-nums shrink-0">
            {tools.length} tool{tools.length === 1 ? "" : "s"}
          </span>
        )}
        {usageText && (
          <span className="text-[10px] text-zinc-500 light:text-zinc-400 tabular-nums shrink-0">
            {usageText}
          </span>
        )}
      </button>
      {expanded && (
        <div className="mx-2 mb-2 p-2 rounded-md bg-zinc-950/70 light:bg-slate-100 max-h-[260px] overflow-y-auto">
          {record.error && (
            <p className="text-[11px] text-red-400 light:text-red-500 font-mono whitespace-pre-wrap break-words mb-2">
              {record.error}
            </p>
          )}
          {tools.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] uppercase tracking-wide text-zinc-500 light:text-zinc-400 mb-1">
                {t("agent_panel.trajectory_tools")}
              </p>
              {tools.map((tool, i) => (
                <div key={i} className="mb-1 last:mb-0">
                  <p className="text-[11px] font-mono text-sky-300 light:text-sky-700 break-words">
                    {tool.name}
                  </p>
                  {!!tool.args && (
                    <pre className="text-[11px] font-mono text-zinc-300 light:text-zinc-700 whitespace-pre-wrap break-words">
                      {tool.args}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
          {deltas.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-zinc-500 light:text-zinc-400 mb-1">
                {t("agent_panel.trajectory_messages", {
                  count: deltas.length,
                })}
              </p>
              {deltas.map((msg, i) => (
                <p
                  key={i}
                  className="text-[11px] font-mono text-zinc-400 light:text-zinc-600 whitespace-pre-wrap break-words mb-1 last:mb-0"
                >
                  <span className="text-zinc-500 light:text-zinc-500">
                    [{msg.role}]
                  </span>{" "}
                  {msg.preview}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * @param {Object} props
 * @param {Array<{path: string, action: string, added: number, removed: number, diff: string, diffTruncated: boolean}>} props.changes
 */
function ChangesTab({ changes }) {
  const { t } = useTranslation();
  const [expandedPath, setExpandedPath] = useState(null);

  if (changes.length === 0)
    return (
      <p className="text-xs text-zinc-500 light:text-zinc-400 mt-4">
        {t("agent_panel.changes_empty")}
      </p>
    );

  return (
    <div>
      {changes.map((change) => {
        const { basename, dirname } = splitPath(change.path);
        const expanded = expandedPath === change.path;
        const Icon = change.action === "create" ? FilePlus : PencilSimple;
        const badge =
          change.action === "create"
            ? "bg-emerald-500/15 text-emerald-400"
            : "bg-amber-500/15 text-amber-400";
        return (
          <div key={change.path}>
            <button
              type="button"
              onClick={() => setExpandedPath(expanded ? null : change.path)}
              title={change.path}
              className="flex items-center gap-x-2.5 w-full rounded-lg px-2 py-1 text-left hover:bg-white/[0.05] light:hover:bg-black/[0.05] transition-colors"
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-md shrink-0 ${badge}`}
              >
                <Icon className="w-3.5 h-3.5" />
              </span>
              <span className="min-w-0 flex-1 flex items-baseline gap-x-1.5">
                <span className="font-mono text-[12px] text-zinc-100 light:text-zinc-900 shrink-0">
                  {basename}
                </span>
                {dirname && (
                  <span className="font-mono text-[10px] text-zinc-500 light:text-zinc-400 truncate">
                    {dirname}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-x-1.5 flex-shrink-0 font-mono text-[11px]">
                {change.added > 0 && (
                  <span className="text-emerald-500 light:text-emerald-600">
                    +{change.added}
                  </span>
                )}
                {change.removed > 0 && (
                  <span className="text-red-400 light:text-red-500">
                    &minus;{change.removed}
                  </span>
                )}
              </span>
            </button>
            {change.diff && (
              <div
                className={`grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                  expanded
                    ? "grid-rows-[1fr] opacity-100"
                    : "grid-rows-[0fr] opacity-0"
                }`}
              >
                <div className="min-h-0 overflow-hidden">
                  <UnifiedDiffView
                    diff={change.diff}
                    truncated={change.diffTruncated}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
