import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import {
  CheckCircle,
  Circle,
  FilePlus,
  GitDiff,
  ListChecks,
  PencilSimple,
  SidebarSimple,
  SpinnerGap,
  X,
} from "@phosphor-icons/react";
import {
  getAgentActivity,
  resetAgentActivity,
  subscribeAgentActivity,
} from "@/utils/agentActivity";
import {
  splitPath,
  UnifiedDiffView,
} from "@/components/WorkspaceChat/ChatContainer/ChatHistory/FileChangeCard/shared.jsx";

/**
 * Right-docked agent side panel (ZCode-style): one merged view of the
 * session's work - Changes on top (aggregated file changes with
 * click-to-expand diffs), Plan below (the todo-write stepper). Hidden by
 * default; opens itself the first time an agent event lands, and can be
 * toggled with the edge button.
 *
 * Session-scoped like the chat activity chain: state resets when the active
 * chat changes and nothing is persisted.
 */
export default function AgentSidePanel() {
  const { t } = useTranslation();
  // `chatKey` covers both workspace and thread switches.
  const { slug = "", threadSlug = "" } = useParams();
  const chatKey = `${slug}/${threadSlug}`;

  const [open, setOpen] = useState(false);
  const [activity, setActivity] = useState(getAgentActivity);

  useEffect(() => {
    resetAgentActivity();
    setOpen(false);
  }, [chatKey]);

  useEffect(() => subscribeAgentActivity(setActivity), []);

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

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={t("agent_panel.open")}
          aria-label={t("agent_panel.open")}
          className="hidden md:flex absolute top-1/2 -translate-y-1/2 right-0 z-30 items-center gap-x-2 rounded-l-lg border border-r-0 border-white/10 light:border-black/10 bg-zinc-900 light:bg-white px-2 py-3 text-zinc-400 light:text-zinc-500 hover:text-white light:hover:text-zinc-900 hover:bg-zinc-800 light:hover:bg-slate-100"
        >
          <SidebarSimple className="w-4 h-4" />
          <span className="text-xs font-medium [writing-mode:vertical-rl] rotate-180">
            {t("agent_panel.title")}
          </span>
        </button>
      )}
      {open && (
        <aside className="hidden md:flex w-[340px] xl:w-[380px] shrink-0 flex-col border-l border-white/10 light:border-black/10 bg-zinc-900/70 light:bg-white/70 backdrop-blur-sm h-full">
          <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/10 light:border-black/10">
            <h2 className="text-sm font-medium text-white light:text-zinc-900">
              {t("agent_panel.title")}
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("agent_panel.close")}
              title={t("agent_panel.close")}
              className="text-zinc-500 light:text-zinc-400 hover:text-white light:hover:text-zinc-900"
            >
              <X className="w-4 h-4" />
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
          </div>
        </aside>
      )}
    </>
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
