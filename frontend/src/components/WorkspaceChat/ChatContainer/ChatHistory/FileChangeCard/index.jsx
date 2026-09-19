import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CaretDown,
  FileCode,
  FileMagnifyingGlass,
  FilePlus,
  PencilSimple,
} from "@phosphor-icons/react";
import { splitPath, UnifiedDiffView } from "./shared.jsx";

const ACTION_ICONS = {
  edit: PencilSimple,
  create: FilePlus,
  read: FileMagnifyingGlass,
};

/**
 * A single file-activity row in the chat stream, styled after agentic IDEs:
 * icon + filename + muted directory + `+N -N` line counts on the right.
 * Edit/create rows expand inline to a colored unified diff; read rows are
 * static.
 * @param {Object} props
 * @param {string} props.action - "edit" | "create" | "read"
 * @param {string} props.path - display path (relative to the agent's allowed root)
 * @param {number} [props.added] - added line count
 * @param {number} [props.removed] - removed line count
 * @param {string} [props.diff] - unified diff (edit/create only)
 * @param {boolean} [props.diffTruncated] - diff was capped server-side
 * @param {number} [props.readLines] - lines read (read action only)
 */
function FileChangeCard({
  action = "edit",
  path = "",
  added = 0,
  removed = 0,
  diff = "",
  diffTruncated = false,
  readLines = null,
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const segments = splitPath(path);
  const Icon = ACTION_ICONS[action] ?? FileCode;
  const hasDiff = action !== "read" && !!diff;
  const isRead = action === "read";

  const ariaLabel = isRead
    ? t("chat_window.file_change.read_file", { path })
    : action === "create"
      ? t("chat_window.file_change.created_file", { path })
      : t("chat_window.file_change.edited_file", { path });

  return (
    <div className="not-prose w-full">
      <button
        type="button"
        onClick={() => hasDiff && setExpanded((v) => !v)}
        aria-expanded={hasDiff ? expanded : undefined}
        aria-label={ariaLabel}
        title={path}
        disabled={!hasDiff}
        className={`flex items-center gap-x-2 w-full max-w-[560px] rounded-md px-2 py-1 text-left text-sm transition-colors duration-150 ${
          hasDiff
            ? "cursor-pointer hover:bg-white/[0.05] light:hover:bg-black/[0.05]"
            : "cursor-default"
        }`}
      >
        <Icon className="w-4 h-4 flex-shrink-0 text-zinc-400 light:text-zinc-500" />
        <span className="font-mono text-[13px] text-zinc-100 light:text-zinc-900 truncate">
          {segments.basename}
        </span>
        {segments.dirname && (
          <span className="font-mono text-xs text-zinc-500 light:text-zinc-400 truncate">
            {segments.dirname}
          </span>
        )}
        <span className="ml-auto flex items-center gap-x-2 flex-shrink-0 pl-2">
          {isRead ? (
            readLines != null && (
              <span className="text-xs text-zinc-500 light:text-zinc-400">
                {t("chat_window.file_change.lines", { count: readLines })}
              </span>
            )
          ) : (
            <>
              {added > 0 && (
                <span className="font-mono text-xs text-emerald-500 light:text-emerald-600">
                  +{added}
                </span>
              )}
              {removed > 0 && (
                <span className="font-mono text-xs text-red-400 light:text-red-500">
                  &minus;{removed}
                </span>
              )}
            </>
          )}
          {hasDiff && (
            <CaretDown
              className={`w-3 h-3 text-zinc-500 light:text-zinc-400 transition-transform ${
                expanded ? "rotate-180" : ""
              }`}
            />
          )}
        </span>
      </button>
      {hasDiff && (
        <div
          className={`grid max-w-[560px] transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
            expanded
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <UnifiedDiffView diff={diff} truncated={diffTruncated} />
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(FileChangeCard);
