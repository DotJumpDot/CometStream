import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CaretDown,
  CheckCircle,
  FileCode,
  FileMagnifyingGlass,
  FilePlus,
  PencilSimple,
} from "@phosphor-icons/react";
import { formatDuration } from "@/utils/numbers";
import { splitPath, UnifiedDiffView } from "../FileChangeCard/shared.jsx";

const ACTION_ICONS = {
  edit: PencilSimple,
  create: FilePlus,
  read: FileMagnifyingGlass,
};

// Same action accents as the in-stream file steps so the summary reads as
// part of one visual system (emerald create / amber edit / sky read).
const ACTION_BADGES = {
  edit: "bg-amber-500/15 text-amber-400 light:text-amber-500",
  create: "bg-emerald-500/15 text-emerald-400 light:text-emerald-500",
  read: "bg-sky-500/15 text-sky-400 light:text-sky-500",
};

const ACTION_VERB_KEYS = {
  edit: "chat_window.file_change.verb_edit",
  create: "chat_window.file_change.verb_create",
  read: "chat_window.file_change.verb_read",
};

/**
 * Trae-style run summary that closes an agent session: a completion header
 * with the wall-clock duration, then the run's plan progress and every file
 * it touched, each expandable to its diff. Rendered from a snapshot of the
 * session activity taken when the agent socket closes, so it stays stable
 * after the live panel state moves on.
 *
 * @param {Object} props
 * @param {number|null} [props.durationMs] - wall-clock session duration
 * @param {Array<{content: string, status: string}>} [props.todo]
 * @param {Array<{path: string, action: string, added: number, removed: number, diff: string, diffTruncated: boolean}>} [props.fileChanges]
 */
function AgentRunSummaryCard({
  durationMs = null,
  todo = [],
  fileChanges = [],
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const [expandedPath, setExpandedPath] = useState(null);

  const todoDone = todo.filter((i) => i.status === "done").length;
  const totals = fileChanges.reduce(
    (acc, c) => ({
      added: acc.added + c.added,
      removed: acc.removed + c.removed,
    }),
    { added: 0, removed: 0 }
  );
  const hasBody = todo.length > 0 || fileChanges.length > 0;

  return (
    <div className="not-prose w-full mt-2 mb-2">
      <div className="rounded-xl border border-white/10 light:border-black/10 bg-white/[0.02] light:bg-black/[0.02] overflow-hidden">
        <button
          type="button"
          onClick={() => hasBody && setExpanded((v) => !v)}
          aria-expanded={hasBody ? expanded : undefined}
          className={`flex items-center gap-x-3 w-full px-3.5 py-2.5 text-left ${
            hasBody
              ? "cursor-pointer hover:bg-white/[0.03] light:hover:bg-black/[0.03]"
              : "cursor-default"
          } transition-colors duration-150`}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0 bg-emerald-500/15 text-emerald-400">
            <CheckCircle weight="bold" className="w-4 h-4" />
          </span>
          <span className="flex-1 min-w-0 flex items-baseline gap-x-2">
            <span className="text-sm font-semibold text-white light:text-zinc-900 truncate">
              {t("agent_summary.title")}
            </span>
            {durationMs != null && durationMs > 0 && (
              <span className="text-xs text-zinc-500 light:text-zinc-400 shrink-0">
                {t("agent_summary.worked_for", {
                  duration: formatDuration(durationMs / 1000),
                })}
              </span>
            )}
          </span>
          {fileChanges.length > 0 && (
            <span className="flex items-center gap-x-1.5 font-mono text-xs shrink-0">
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
          )}
          {hasBody && (
            <CaretDown
              className={`w-3.5 h-3.5 text-zinc-500 light:text-zinc-400 shrink-0 transition-transform duration-200 ${
                expanded ? "rotate-180" : ""
              }`}
            />
          )}
        </button>

        {hasBody && (
          <div
            className={`grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
              expanded
                ? "grid-rows-[1fr] opacity-100"
                : "grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="px-3.5 pb-3 pt-1 space-y-3 border-t border-white/5 light:border-black/5">
                {todo.length > 0 && (
                  <p className="text-xs text-zinc-400 light:text-zinc-500">
                    {t("agent_panel.progress", {
                      done: todoDone,
                      total: todo.length,
                    })}
                  </p>
                )}
                {fileChanges.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-zinc-300 light:text-zinc-600 mb-1">
                      {t("agent_summary.files_changed", {
                        count: fileChanges.length,
                      })}
                    </p>
                    {fileChanges.map((change) => {
                      const { basename, dirname } = splitPath(change.path);
                      const fileExpanded = expandedPath === change.path;
                      const Icon = ACTION_ICONS[change.action] ?? FileCode;
                      const hasDiff = change.action !== "read" && !!change.diff;
                      return (
                        <div key={change.path}>
                          <button
                            type="button"
                            onClick={() =>
                              hasDiff &&
                              setExpandedPath(fileExpanded ? null : change.path)
                            }
                            title={change.path}
                            className={`flex items-center gap-x-2.5 w-full rounded-lg px-2 py-1.5 text-left text-sm ${
                              hasDiff
                                ? "cursor-pointer hover:bg-white/[0.05] light:hover:bg-black/[0.05]"
                                : "cursor-default"
                            } transition-colors duration-150`}
                          >
                            <span
                              className={`flex h-6 w-6 items-center justify-center rounded-lg shrink-0 ${
                                ACTION_BADGES[change.action] ??
                                "bg-white/5 text-zinc-400"
                              }`}
                            >
                              <Icon className="w-3.5 h-3.5" />
                            </span>
                            <span className="min-w-0 flex-1 flex items-baseline gap-x-1.5">
                              <span className="text-[12px] text-zinc-400 light:text-zinc-500 shrink-0">
                                {t(
                                  ACTION_VERB_KEYS[change.action] ??
                                    "chat_window.file_change.verb_edit"
                                )}
                              </span>
                              <span className="font-mono text-[13px] text-zinc-100 light:text-zinc-900 truncate">
                                {basename}
                              </span>
                              {dirname && (
                                <span className="font-mono text-[11px] text-zinc-500 light:text-zinc-400 truncate">
                                  {dirname}
                                </span>
                              )}
                            </span>
                            <span className="flex items-center gap-x-1.5 font-mono text-xs shrink-0">
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
                              {hasDiff && (
                                <CaretDown
                                  className={`w-3 h-3 text-zinc-500 transition-transform duration-200 ${
                                    fileExpanded ? "rotate-180" : ""
                                  }`}
                                />
                              )}
                            </span>
                          </button>
                          {hasDiff && (
                            <div
                              className={`grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                                fileExpanded
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
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(AgentRunSummaryCard);
