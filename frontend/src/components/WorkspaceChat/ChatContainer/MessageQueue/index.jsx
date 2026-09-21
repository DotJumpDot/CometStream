import {
  CaretDown,
  CaretUp,
  PencilSimple,
  Play,
  Queue,
  Trash,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

// Composer textarea id, mirrored from PromptInput's PROMPT_INPUT_ID export.
// Kept as a literal (not imported) so this module never import-cycles with
// PromptInput, which renders this panel.
const COMPOSER_TEXTAREA_ID = "primary-prompt-input";

/**
 * Queued follow-up messages. Anything submitted while a run is in flight
 * waits here instead of being dropped, then dispatches in order once the
 * run settles. Order is adjustable, items are editable/deletable, and an
 * error or manual stop halts auto-dispatch without losing the queue.
 *
 * @param {Object} props
 * @param {Array<{id: string, text: string}>} props.items - queued messages
 * @param {boolean} props.halted - auto-dispatch paused (error or manual stop)
 * @param {(id: string, dir: -1|1) => void} props.onMove - reorder item
 * @param {(id: string) => void} props.onEdit - move item text back to the box
 * @param {(id: string) => void} props.onDelete - drop item
 * @param {() => void} props.onContinue - resume a halted queue
 */
export default function MessageQueue({
  items = [],
  halted = false,
  onMove,
  onEdit,
  onDelete,
  onContinue,
}) {
  const { t } = useTranslation();
  if (items.length === 0) return null;

  return (
    <div className="w-full mx-auto md:max-w-[85%] mb-2 rounded-xl border border-white/10 light:border-black/10 bg-zinc-900/95 light:bg-white/95 shadow-lg overflow-hidden">
      <div className="flex items-center gap-x-2 px-3 pt-2.5 pb-1.5">
        <Queue className="w-4 h-4 text-zinc-400 light:text-zinc-500" />
        <span className="text-xs font-semibold text-zinc-300 light:text-zinc-700">
          {t("chat_window.queue.title", { count: items.length })}
        </span>
        {halted && (
          <button
            type="button"
            onClick={onContinue}
            className="ml-auto flex items-center gap-x-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 light:text-amber-700 text-xs font-semibold px-2.5 py-1 transition-colors border-none cursor-pointer"
          >
            <Play weight="fill" className="w-3 h-3" />
            {t("chat_window.queue.continue")}
          </button>
        )}
      </div>
      {halted && (
        <p className="px-3 pb-1 text-[11px] text-amber-300/80 light:text-amber-700/80">
          {t("chat_window.queue.halted")}
        </p>
      )}
      <ul className="max-h-[180px] overflow-y-auto px-2 pb-2 space-y-1">
        {items.map((item, index) => (
          <li
            key={item.id}
            className="flex items-center gap-x-1 rounded-lg px-2 py-1.5 bg-white/[0.04] light:bg-black/[0.04]"
          >
            <span className="text-[11px] font-mono text-zinc-500 light:text-zinc-400 tabular-nums shrink-0 w-6">
              #{index + 1}
            </span>
            <span className="flex-1 min-w-0 truncate text-[13px] text-zinc-200 light:text-zinc-800">
              {item.text}
            </span>
            <QueueButton
              title={t("chat_window.queue.move_up")}
              ariaLabel={t("chat_window.queue.move_up")}
              disabled={index === 0}
              onClick={() => onMove?.(item.id, -1)}
            >
              <CaretUp className="w-3.5 h-3.5" />
            </QueueButton>
            <QueueButton
              title={t("chat_window.queue.move_down")}
              ariaLabel={t("chat_window.queue.move_down")}
              disabled={index === items.length - 1}
              onClick={() => onMove?.(item.id, 1)}
            >
              <CaretDown className="w-3.5 h-3.5" />
            </QueueButton>
            <QueueButton
              title={t("chat_window.queue.edit")}
              ariaLabel={t("chat_window.queue.edit")}
              onClick={() => onEdit?.(item.id)}
            >
              <PencilSimple className="w-3.5 h-3.5" />
            </QueueButton>
            <QueueButton
              title={t("chat_window.queue.delete")}
              ariaLabel={t("chat_window.queue.delete")}
              danger
              onClick={() => onDelete?.(item.id)}
            >
              <Trash className="w-3.5 h-3.5" />
            </QueueButton>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QueueButton({
  children,
  title,
  ariaLabel,
  disabled = false,
  danger = false,
  onClick,
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={`border-none shrink-0 flex items-center justify-center w-6 h-6 rounded-md transition-colors ${
        disabled
          ? "text-zinc-600 light:text-zinc-300 cursor-not-allowed"
          : danger
            ? "text-zinc-400 light:text-zinc-500 hover:text-red-400 light:hover:text-red-500 hover:bg-white/5 cursor-pointer"
            : "text-zinc-400 light:text-zinc-500 hover:text-white light:hover:text-zinc-900 hover:bg-white/5 cursor-pointer"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Reads the live composer text. Used to enforce "edit only into an empty
 * box" without threading composer state through the queue.
 * @returns {boolean} True when the chat box currently holds text.
 */
export function isComposerNonEmpty() {
  const el = document.getElementById(COMPOSER_TEXTAREA_ID);
  return !!el?.value?.trim();
}
