import useScrollActiveItemIntoView from "@/hooks/useScrollActiveItemIntoView";
import Workspace from "@/models/workspace";
import paths from "@/utils/paths";
import showToast from "@/utils/toast";
import { relativeTime } from "@/utils/dates";
import {
  ArrowCounterClockwise,
  ChatCircleText,
  DotsThreeVertical,
  PencilSimple,
  PushPin,
  Trash,
  X,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

/**
 * Flat thread row: chat icon + name with the relative time kept visible at a
 * whisper; hovering swaps the timestamp for the kebab so the row never
 * reflows. The kebab and the Ctrl-click mark-for-deletion X share the same
 * overlay slot.
 */
export default function ThreadItem({
  isActive,
  workspace,
  thread,
  onRemove,
  onTogglePinned,
  toggleMarkForDeletion,
  ctrlPressed = false,
}) {
  const { slug: urlSlug, threadSlug = null } = useParams();
  const workspaceSlug = workspace?.slug ?? urlSlug;
  const optionsContainer = useRef(null);
  const [showOptions, setShowOptions] = useState(false);
  const { t } = useTranslation();
  const linkTo = thread.virtual
    ? "/"
    : !thread.slug
      ? paths.workspace.chat(workspaceSlug)
      : paths.workspace.thread(workspaceSlug, thread.slug);

  const { ref } = useScrollActiveItemIntoView({
    isActive,
    behavior: "instant",
    block: "center",
  });

  if (thread.deleted) {
    return (
      <div
        className="w-full flex items-center justify-between h-[30px] pl-[32px] pr-2 rounded-[8px] group/thread"
        role="listitem"
      >
        <p className="text-[13px] italic text-theme-text-secondary opacity-60">
          {t("sidebar.deleted_thread")}
        </p>
        {ctrlPressed && (
          <button
            type="button"
            className="border-none"
            onClick={() => toggleMarkForDeletion(thread.id)}
            aria-label={t("sidebar.restore_thread")}
          >
            <ArrowCounterClockwise
              className="text-zinc-400 hover:text-white light:text-theme-text-secondary hover:light:text-theme-text-primary"
              size={16}
            />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="w-full relative group/thread" role="listitem">
      <Link
        ref={ref}
        to={linkTo}
        data-tooltip-id="workspace-thread-name"
        data-tooltip-content={thread.name}
        aria-current={isActive ? "page" : ""}
        className={`flex items-center gap-x-2 w-full h-[30px] pl-[32px] pr-2 rounded-[8px] transition-colors duration-150 ${
          isActive
            ? "bg-white/[0.07] light:bg-blue-200/70"
            : "hover:bg-white/[0.04] light:hover:bg-black/[0.04]"
        }`}
      >
        <ChatCircleText
          size={14}
          weight={isActive ? "fill" : "regular"}
          className={`shrink-0 ${
            isActive
              ? "text-cta-button"
              : "text-theme-text-secondary opacity-70"
          }`}
        />
        {thread.pinned && (
          <PushPin
            size={10}
            weight="fill"
            className="shrink-0 text-cta-button"
          />
        )}
        <p
          className={`truncate text-[13px] ${
            isActive
              ? "font-medium text-white light:text-blue-900"
              : "text-zinc-300 light:text-slate-600"
          }`}
        >
          {thread.name}
        </p>
        {/* Timestamp yields its spot to the kebab on hover/focus so the row
            never reflows; touch devices have no hover, so both simply stack. */}
        <span className="ml-auto shrink-0 text-[10px] leading-none text-theme-text-secondary opacity-70 transition-opacity duration-150 group-hover/thread:opacity-0 group-focus-within/thread:opacity-0">
          {thread.lastUpdatedAt ? relativeTime(thread.lastUpdatedAt) : ""}
        </span>
      </Link>

      {!!thread.slug && !thread.virtual && (
        <div
          ref={optionsContainer}
          // inset-y-0 centering instead of top-1/2 + -translate-y-1/2: a
          // transform here would create a stacking context that traps the
          // z-20 options dropdown inside the row, letting later thread rows
          // paint over the open menu.
          className="absolute right-1 inset-y-0 flex items-center"
        >
          {ctrlPressed ? (
            <button
              type="button"
              className="border-none"
              onClick={() => toggleMarkForDeletion(thread.id)}
              aria-label={t("sidebar.mark_for_deletion")}
            >
              <X
                className="text-zinc-400 hover:text-white light:text-theme-text-secondary hover:light:text-theme-text-primary"
                weight="bold"
                size={16}
              />
            </button>
          ) : (
            <div className="flex items-center md:invisible md:group-hover/thread:visible md:group-focus-within/thread:visible">
              <button
                type="button"
                className="border-none rounded-md p-0.5 hover:bg-white/[0.08] light:hover:bg-black/[0.08] transition-colors"
                onClick={() => setShowOptions(!showOptions)}
                aria-label={t("sidebar.thread_options")}
              >
                <DotsThreeVertical
                  className="text-zinc-400 hover:text-white light:text-theme-text-secondary hover:light:text-theme-text-primary"
                  size={16}
                  weight="bold"
                />
              </button>
            </div>
          )}
          {showOptions && (
            <OptionsMenu
              containerRef={optionsContainer}
              workspace={workspace}
              thread={thread}
              onRemove={onRemove}
              onTogglePinned={onTogglePinned}
              close={() => setShowOptions(false)}
              currentThreadSlug={threadSlug}
            />
          )}
        </div>
      )}
    </div>
  );
}

function OptionsMenu({
  containerRef,
  workspace,
  thread,
  onRemove,
  onTogglePinned,
  close,
  currentThreadSlug,
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const menuRef = useRef(null);

  // Ref menu options
  const outsideClick = (e) => {
    if (!menuRef.current) return false;
    if (
      !menuRef.current?.contains(e.target) &&
      !containerRef.current?.contains(e.target)
    )
      close();
    return false;
  };

  const isEsc = (e) => {
    if (e.key === "Escape" || e.key === "Esc") close();
  };

  function cleanupListeners() {
    window.removeEventListener("click", outsideClick);
    window.removeEventListener("keyup", isEsc);
  }
  // end Ref menu options

  useEffect(() => {
    function setListeners() {
      if (!menuRef?.current || !containerRef.current) return false;
      window.document.addEventListener("click", outsideClick);
      window.document.addEventListener("keyup", isEsc);
    }

    setListeners();
    return cleanupListeners;
  }, [menuRef.current, containerRef.current]);

  const renameThread = async () => {
    const name = window
      .prompt("What would you like to rename this thread to?")
      ?.trim();
    if (!name || name.length === 0) {
      close();
      return;
    }

    const { message } = await Workspace.threads.update(
      workspace.slug,
      thread.slug,
      { name }
    );
    if (!!message) {
      showToast(`Thread could not be updated! ${message}`, "error", {
        clear: true,
      });
      close();
      return;
    }

    thread.name = name;
    close();
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        "Are you sure you want to delete this thread? All of its chats will be deleted. You cannot undo this."
      )
    )
      return;
    const success = await Workspace.threads.delete(workspace.slug, thread.slug);
    if (!success) {
      showToast("Thread could not be deleted!", "error", { clear: true });
      return;
    }
    if (success) {
      showToast("Thread deleted successfully!", "success", { clear: true });
      onRemove(thread.id);
      // Redirect if deleting the active thread. Use router navigation so
      // ActiveGenerationGuard can intercept if a response is generating.
      if (currentThreadSlug === thread.slug) {
        navigate(paths.workspace.chat(workspace.slug));
      }
      return;
    }
  };

  return (
    <div
      ref={menuRef}
      className="absolute z-20 top-[26px] right-2 w-[170px] rounded-lg border border-white/10 light:border-black/10 bg-zinc-900 light:bg-white shadow-xl p-1"
    >
      <button
        onClick={renameThread}
        type="button"
        className="w-full rounded-md flex items-center gap-x-2 px-2 py-1.5 text-[13px] text-zinc-300 light:text-slate-700 hover:bg-white/[0.06] light:hover:bg-black/[0.05] hover:text-white light:hover:text-slate-950 transition-colors"
      >
        <PencilSimple size={14} />
        {t("sidebar.rename_thread")}
      </button>
      {onTogglePinned && (
        <button
          onClick={() => {
            onTogglePinned(thread);
            close();
          }}
          type="button"
          className="w-full rounded-md flex items-center gap-x-2 px-2 py-1.5 text-[13px] text-zinc-300 light:text-slate-700 hover:bg-white/[0.06] light:hover:bg-black/[0.05] hover:text-white light:hover:text-slate-950 transition-colors"
        >
          <PushPin size={14} />
          {thread.pinned ? t("sidebar.unpin") : t("sidebar.pin")}
        </button>
      )}
      <button
        onClick={handleDelete}
        type="button"
        className="w-full rounded-md flex items-center gap-x-2 px-2 py-1.5 text-[13px] text-zinc-300 light:text-slate-700 hover:bg-red-500/15 hover:text-red-300 light:hover:text-red-600 transition-colors"
      >
        <Trash size={14} />
        {t("sidebar.delete_thread")}
      </button>
    </div>
  );
}
