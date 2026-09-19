import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Workspace from "@/models/workspace";

/**
 * Trae-style chat header: the workspace (and active thread) name on the left
 * as a breadcrumb, chat actions on the right, rendered as a slim bar above
 * the scroll area so the current chat is always identifiable.
 *
 * @param {Object} props
 * @param {Object} props.workspace - workspace object (name/slug used)
 * @param {string|null} [props.threadSlug] - active thread slug, if any
 * @param {React.ReactNode} [props.children] - action buttons rendered right
 */
export default function ChatHeader({
  workspace = null,
  threadSlug = null,
  children,
}) {
  const { t } = useTranslation();
  const [threadName, setThreadName] = useState(null);

  // Threads are listed per workspace; one call resolves the current thread's
  // name. Failure is non-fatal - the breadcrumb just falls back to "Thread".
  useEffect(() => {
    let cancelled = false;
    setThreadName(null);
    if (!workspace?.slug || !threadSlug) return;
    Workspace.threads
      .all(workspace.slug)
      .then(({ threads }) => {
        if (cancelled) return;
        setThreadName(
          threads.find((thread) => thread.slug === threadSlug)?.name ?? null
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [workspace?.slug, threadSlug]);

  return (
    <header className="flex items-center justify-between gap-x-3 h-12 shrink-0 px-4 border-b border-white/5 light:border-black/10">
      <div className="flex items-center gap-x-2 min-w-0">
        <h1
          title={workspace?.name}
          className="text-sm font-semibold text-white light:text-slate-900 truncate"
        >
          {workspace?.name ?? t("chat_header.workspace")}
        </h1>
        {threadSlug && (
          <>
            <span className="text-zinc-600 light:text-zinc-400 shrink-0">
              /
            </span>
            <span
              title={threadName ?? t("chat_header.thread")}
              className="text-sm text-zinc-400 light:text-zinc-500 truncate"
            >
              {threadName ?? t("chat_header.thread")}
            </span>
          </>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-x-1 shrink-0">{children}</div>
      )}
    </header>
  );
}
