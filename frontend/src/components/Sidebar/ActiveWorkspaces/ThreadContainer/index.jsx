import Workspace from "@/models/workspace";
import paths from "@/utils/paths";
import showToast from "@/utils/toast";
import { Plus, CircleNotch, Trash } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ThreadItem from "./ThreadItem";
import { useNavigate, useParams } from "react-router-dom";
import useHoverMetaKey from "./hooks";
import { PINNED_THREADS_CHANGED_EVENT } from "@/utils/constants";
export const THREAD_RENAME_EVENT = "renameThread";
export const THREAD_FORK_EVENT = "forkToThread";

export default function ThreadContainer({
  workspace,
  isVirtualThread = false,
}) {
  const navigate = useNavigate();
  const { threadSlug = null } = useParams();
  const [threads, setThreads] = useState([]);
  const [defaultThreadHasChats, setDefaultThreadHasChats] = useState(false);
  const [loading, setLoading] = useState(true);
  const { containerRef, ctrlPressed } = useHoverMetaKey(setThreads, !loading);

  useEffect(() => {
    const chatHandler = (event) => {
      const { threadSlug, newName } = event.detail;
      setThreads((prevThreads) =>
        prevThreads.map((thread) => {
          if (thread.slug === threadSlug) {
            return { ...thread, name: newName };
          }
          return thread;
        })
      );
    };

    window.addEventListener(THREAD_RENAME_EVENT, chatHandler);

    return () => {
      window.removeEventListener(THREAD_RENAME_EVENT, chatHandler);
    };
  }, []);

  // Handle new fork events from chat actions. Forking navigates via the router
  // now, so a blocked/cancelled navigation would otherwise leave the new thread
  // missing from this list until the next refetch.
  useEffect(() => {
    const forkHandler = () => {
      if (!workspace?.slug) return;
      Workspace.threads
        .all(workspace.slug)
        .then(({ threads }) => setThreads(threads))
        .catch((e) => console.error(e));
    };

    window.addEventListener(THREAD_FORK_EVENT, forkHandler);
    return () => {
      window.removeEventListener(THREAD_FORK_EVENT, forkHandler);
    };
  }, [workspace?.slug]);

  useEffect(() => {
    async function fetchThreads() {
      if (!workspace.slug) return;
      const { threads, defaultThreadChatCount } = await Workspace.threads.all(
        workspace.slug
      );
      setLoading(false);
      setThreads(threads);
      setDefaultThreadHasChats(defaultThreadChatCount > 0);
    }
    fetchThreads();
  }, [workspace.slug, threadSlug]);

  const toggleForDeletion = (id) => {
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        return { ...t, deleted: !t.deleted };
      })
    );
  };

  const handleDeleteAll = async () => {
    const slugs = threads.filter((t) => t.deleted === true).map((t) => t.slug);
    await Workspace.threads.deleteBulk(workspace.slug, slugs);
    setThreads((prev) => prev.filter((t) => !t.deleted));

    // Only redirect if current thread is being deleted. Use router navigation
    // so ActiveGenerationGuard can intercept if a response is generating.
    if (slugs.includes(threadSlug)) {
      navigate(paths.workspace.chat(workspace.slug));
    }
  };

  function removeThread(threadId) {
    setThreads((prevThreads) =>
      prevThreads.map((_t) => {
        if (_t.id !== threadId) return _t;
        return { ..._t, deleted: true };
      })
    );

    // Show thread was deleted, but then remove from threads entirely so it will
    // not appear in bulk-selection.
    setTimeout(() => {
      setThreads((prevThreads) => prevThreads.filter((t) => !t.deleted));
    }, 500);
  }

  /**
   * Optimistically flips the local pinned flag (so the pin icon and menu
   * label update immediately), then persists and notifies the sidebar's
   * Pinned section to refetch.
   */
  function togglePinned(thread) {
    const pinned = !thread.pinned;
    setThreads((prevThreads) =>
      prevThreads.map((_t) => {
        if (_t.id !== thread.id) return _t;
        return { ..._t, pinned };
      })
    );
    // Notify the sidebar's Pinned section AFTER the state is persisted - a
    // pre-flight event would make its refetch race the write and see stale data.
    Workspace.threads
      .setPinned(workspace.slug, thread.slug, pinned)
      .finally(() =>
        window.dispatchEvent(new Event(PINNED_THREADS_CHANGED_EVENT))
      )
      .then((success) => {
        if (!success) {
          showToast("Could not update pin", "error");
          setThreads((prevThreads) =>
            prevThreads.map((_t) => {
              if (_t.id !== thread.id) return _t;
              return { ..._t, pinned: !pinned };
            })
          );
        }
      });
  }

  function getActiveThreadIdx() {
    if (isVirtualThread)
      return threads.length + (defaultThreadHasChats ? 1 : 0);
    // On a bare workspace route with no default chats, show virtual thread as active
    if (!threadSlug && !defaultThreadHasChats)
      return threads.length + (defaultThreadHasChats ? 1 : 0);
    const idx = threads.findIndex((t) => t?.slug === threadSlug);
    if (idx >= 0) return idx + (defaultThreadHasChats ? 1 : 0);
    if (!threadSlug && defaultThreadHasChats) return 0;
    return -1;
  }

  if (loading) {
    return (
      <div
        className="flex flex-col gap-y-[2px] pt-[2px]"
        aria-label="Loading threads"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[30px] rounded-[8px] bg-white/[0.04] light:bg-black/[0.04] animate-pulse"
          />
        ))}
      </div>
    );
  }

  const activeThreadIdx = getActiveThreadIdx();

  // Show a virtual thread when on a bare workspace route (no threadSlug) and
  // the default thread has no chats — mimics the Home page virtual thread behavior.
  const showVirtualThread =
    isVirtualThread || (!threadSlug && !defaultThreadHasChats);

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-y-[2px] pt-[2px]"
      role="list"
      aria-label="Threads"
    >
      {defaultThreadHasChats && (
        <ThreadItem
          isActive={activeThreadIdx === 0}
          workspace={workspace}
          thread={{ slug: null, name: "default" }}
        />
      )}
      {threads.map((thread, i) => (
        <ThreadItem
          key={thread.slug}
          ctrlPressed={ctrlPressed}
          toggleMarkForDeletion={toggleForDeletion}
          onTogglePinned={togglePinned}
          isActive={activeThreadIdx === i + (defaultThreadHasChats ? 1 : 0)}
          workspace={workspace}
          onRemove={removeThread}
          thread={thread}
        />
      ))}
      {showVirtualThread && (
        <ThreadItem
          isActive={true}
          workspace={workspace}
          thread={{ slug: null, name: "Draft", virtual: true }}
        />
      )}
      <DeleteAllThreadButton
        ctrlPressed={ctrlPressed}
        threads={threads}
        onDelete={handleDeleteAll}
      />
      <NewThreadButton
        workspace={workspace}
        onNewThread={(thread) => setThreads((prev) => [...prev, thread])}
      />
    </div>
  );
}

function NewThreadButton({ workspace, onNewThread }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const onClick = async () => {
    setLoading(true);
    const { thread, error } = await Workspace.threads.new(workspace.slug);
    if (!!error) {
      showToast(`Could not create thread - ${error}`, "error", { clear: true });
      setLoading(false);
      return;
    }
    // Show the new thread in the sidebar immediately - if the navigation below
    // gets blocked (ActiveGenerationGuard) and cancelled, the thread still
    // exists and remains reachable. Router navigation also ensures the guard
    // can intercept and the button never wedges in its loading state.
    onNewThread?.(thread);
    navigate(paths.workspace.thread(workspace.slug, thread.slug), {
      replace: true,
    });
    setLoading(false);
  };

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-x-2 h-8 pl-2.5 pr-2 rounded-[8px] border-none text-zinc-400 light:text-slate-500 hover:text-zinc-200 light:hover:text-slate-800 hover:bg-white/[0.04] light:hover:bg-black/[0.04] transition-colors duration-150 group/new-thread"
    >
      {loading ? (
        <CircleNotch
          weight="bold"
          size={16}
          className="shrink-0 animate-spin"
        />
      ) : (
        <Plus weight="bold" size={16} className="shrink-0" />
      )}
      <p className="text-left text-[13px]">
        {loading ? t("sidebar.starting_thread") : t("sidebar.new_thread")}
      </p>
    </button>
  );
}

function DeleteAllThreadButton({ ctrlPressed, threads, onDelete }) {
  const { t } = useTranslation();
  if (!ctrlPressed || threads.filter((t) => t.deleted).length === 0)
    return null;
  return (
    <button
      type="button"
      onClick={onDelete}
      className="w-full flex items-center gap-x-2 h-8 pl-2.5 pr-2 rounded-[8px] border-none hover:bg-red-400/15 transition-colors duration-150 group/delete-all"
    >
      <Trash
        weight="bold"
        size={16}
        className="shrink-0 text-zinc-400 group-hover/delete-all:text-red-400 transition-colors"
      />
      <p className="text-left text-[13px] text-zinc-400 light:text-theme-text-secondary group-hover/delete-all:text-red-400 transition-colors">
        {t("sidebar.delete_selected")}
      </p>
    </button>
  );
}
