import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AUTO_SCROLL_DISENGAGE_EVENT } from "@/hooks/useAutoScroll";

/**
 * Predicate shared with buildMessages in ../index.jsx: a history item counts
 * as a jump-rail turn exactly when it also gets a `data-jump-id` marker in
 * the rendered DOM. Keep both sides in sync or dash-to-marker mapping drifts.
 * @param {Object} message - chat history item
 * @returns {boolean}
 */
export const isJumpTurn = (message) =>
  message?.role === "user" &&
  typeof message.content === "string" &&
  message.content.trim().length > 0;

// Hard cap so a very long thread cannot push dashes under the header or the
// prompt input; the rail keeps the most recent turns.
const MAX_DASHES = 24;
// Viewport distance from the bottom that still counts as "at the newest
// turn" - mirrors useAutoScroll's bottom threshold.
const BOTTOM_PX = 40;

/**
 * ZCode-style turn rail: a column of thin dashes fixed to the left edge of
 * the chat panel, one per user prompt. The dash nearest the viewport's focus
 * line (upper third) is active; clicking a dash smooth-scrolls that prompt
 * into view and shows a hover tooltip with the prompt's text.
 * @param {Object} props
 * @param {Array} props.history - live chat history
 */
export default function JumpRail({ history = [] }) {
  const { t } = useTranslation();
  const turns = useMemo(
    () =>
      history
        .filter(isJumpTurn)
        .map((m) => m.content.trim().replace(/\s+/g, " ")),
    [history]
  );
  const [active, setActive] = useState(-1);
  const scrollElRef = useRef(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const el = document.getElementById("chat-history");
    scrollElRef.current = el;
    if (!el || turns.length === 0) return;

    const compute = () => {
      rafRef.current = 0;
      const container = scrollElRef.current;
      if (!container) return;
      const markers = container.querySelectorAll("[data-jump-id]");
      if (markers.length === 0) return;

      // Bottom-pinned means the newest turn is the one being read even
      // though its marker may sit above the focus line while the reply
      // streams below the fold.
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollHeight - scrollTop - clientHeight < BOTTOM_PX) {
        setActive(markers.length - 1);
        return;
      }
      const focusLine =
        container.getBoundingClientRect().top + clientHeight * 0.33;
      let current = 0;
      markers.forEach((marker, i) => {
        if (marker.getBoundingClientRect().top <= focusLine) current = i;
      });
      setActive(current);
    };

    const onScroll = () => {
      if (!rafRef.current) rafRef.current = requestAnimationFrame(compute);
    };

    compute();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [turns.length]);

  const jumpTo = (index) => {
    const container = scrollElRef.current;
    if (!container) return;
    const marker = container.querySelectorAll("[data-jump-id]")[index];
    if (!marker) return;
    // Cut follow-autoscroll or the streaming pin loop snaps the viewport
    // back to the bottom on the next animation frame.
    window.dispatchEvent(new CustomEvent(AUTO_SCROLL_DISENGAGE_EVENT));
    const targetTop =
      marker.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop -
      12;
    container.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    setActive(index);
  };

  if (turns.length < 2) return null;

  const offset = Math.max(0, turns.length - MAX_DASHES);
  return (
    <nav
      aria-label={t("chat_window.jump.label")}
      className="absolute left-1.5 top-24 bottom-40 z-40 hidden md:flex flex-col justify-center gap-[7px] cs-jump-rail-in"
    >
      {turns.slice(offset).map((text, i) => {
        const fullIndex = offset + i;
        const isActive = fullIndex === active;
        return (
          <button
            key={fullIndex}
            type="button"
            onClick={() => jumpTo(fullIndex)}
            aria-label={t("chat_window.jump.jump_to_message")}
            className="group relative flex h-3 w-4 items-center justify-start"
          >
            <span
              className={`h-[2px] rounded-full transition-all duration-200 ${
                isActive
                  ? "w-4 bg-white/90 light:bg-slate-700"
                  : "w-2.5 bg-white/25 light:bg-slate-400 group-hover:w-4 group-hover:bg-white/60 light:group-hover:bg-slate-600"
              }`}
            />
            <span className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 max-w-[280px] truncate rounded-md border border-white/10 light:border-slate-300 bg-zinc-900 light:bg-slate-100 px-2.5 py-1 text-xs text-zinc-300 light:text-slate-600 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150">
              {text.slice(0, 120)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
