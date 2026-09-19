import { useEffect, useState } from "react";

/**
 * Position an overlay panel above its trigger while escaping any ancestor
 * `overflow: hidden` (the chat input box clips absolutely-positioned
 * children). A `position: fixed` panel's containing block is the viewport,
 * so the clip no longer applies; coordinates come from the anchor's live
 * rect when the overlay opens.
 *
 * @param {boolean} open - Whether the overlay is shown.
 * @param {import("react").RefObject<HTMLElement>} anchorRef - The trigger root to anchor to.
 * @param {"left"|"right"} [align] - Which edge of the anchor the panel shares.
 * @param {number} [offset] - Gap between anchor top and panel bottom, in px.
 * @returns {Object|null} Inline style for the panel (null until measured).
 */
export default function useAnchoredOverlay(
  open,
  anchorRef,
  align = "left",
  offset = 8
) {
  const [style, setStyle] = useState(null);

  useEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }
    const measure = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setStyle({
        position: "fixed",
        ...(align === "right"
          ? { right: Math.max(8, window.innerWidth - rect.right) }
          : { left: Math.max(8, rect.left) }),
        bottom: Math.max(8, window.innerHeight - rect.top + offset),
      });
    };
    measure();
    // Re-measure on resize so the panel stays glued to its trigger.
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, anchorRef, align, offset]);

  return style;
}
