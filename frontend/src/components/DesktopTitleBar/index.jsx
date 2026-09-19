import { useEffect, useState } from "react";
import { Copy, Minus, Square, X } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

/**
 * In-page title bar for the CometStream desktop app.
 *
 * The Electron shell runs frameless and exposes `window.cometstreamDesktop`
 * (see desktop/src/preload.js). When that bridge is absent - i.e. the app is
 * running in a normal browser - this component renders nothing and no layout
 * shift happens. The bar is a drag region (move the window, double-click to
 * maximize/restore) with styled window controls on the right; it sits above
 * every overlay (modals included) so the window is always movable, and
 * `body.has-desktop-titlebar` reserves its 38px in index.css.
 */

/** Comet mark - same artwork as the desktop app icon (desktop/scripts/make-icon.mjs). */
function CometMark({ className = "h-[18px] w-[18px]" }) {
  return (
    <svg viewBox="0 0 256 256" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="cs-tb-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#161616" />
          <stop offset="1" stopColor="#0f0f0f" />
        </linearGradient>
        <linearGradient id="cs-tb-comet" gradientTransform="rotate(45)">
          <stop offset="0" stopColor="#fd971f" />
          <stop offset="1" stopColor="#f92672" />
        </linearGradient>
        <linearGradient id="cs-tb-tail">
          <stop offset="0" stopColor="#f92672" stopOpacity="0.9" />
          <stop offset="1" stopColor="#f92672" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="256" height="256" rx="56" fill="url(#cs-tb-bg)" />
      <path
        d="M 96 160 L 36 220 Q 60 224 84 208 Q 104 194 112 176 Z"
        fill="url(#cs-tb-tail)"
        transform="rotate(180 75 190)"
      />
      <path
        d="M 108 148 L 60 196 Q 74 198 88 188 Q 102 178 110 164 Z"
        fill="#f92672"
        opacity="0.45"
      />
      <circle cx="150" cy="106" r="44" fill="url(#cs-tb-comet)" />
      <circle
        cx="150"
        cy="106"
        r="44"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.18"
        strokeWidth="4"
      />
      <circle cx="196" cy="58" r="7" fill="#e6db74" />
      <circle cx="214" cy="84" r="4" fill="#66d9ef" />
    </svg>
  );
}

/** One window-control button. Fixed action, no-drag so clicks land. */
function ControlButton({ onClick, label, children, danger = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{ WebkitAppRegion: "no-drag" }}
      className={
        "w-[46px] h-full flex items-center justify-center text-theme-text-secondary " +
        "transition-colors duration-150 " +
        (danger
          ? "hover:bg-[#e81123] hover:text-white"
          : "hover:bg-white/10 hover:text-theme-text-primary")
      }
    >
      {children}
    </button>
  );
}

export default function DesktopTitleBar() {
  const { t } = useTranslation();
  const desktop = window.cometstreamDesktop;
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!desktop) return;
    document.body.classList.add("has-desktop-titlebar");
    desktop
      .isMaximized()
      .then(setIsMaximized)
      .catch(() => {});
    const dispose = desktop.onMaximizeChange(setIsMaximized);
    return () => {
      dispose?.();
      document.body.classList.remove("has-desktop-titlebar");
    };
  }, [desktop]);

  if (!desktop) return null;

  return (
    <div
      aria-label={t("desktop.titlebar.windowControls")}
      style={{ WebkitAppRegion: "drag" }}
      className="fixed top-0 inset-x-0 z-[99999] h-[38px] flex items-stretch justify-between select-none bg-theme-bg-sidebar border-b border-theme-sidebar-border"
    >
      <div className="flex items-center gap-x-2 pl-3 pointer-events-none">
        <CometMark />
        <span className="text-xs font-medium text-theme-text-secondary">
          CometStream
        </span>
      </div>
      <div className="flex items-stretch">
        <ControlButton
          onClick={desktop.minimize}
          label={t("desktop.titlebar.minimize")}
        >
          <Minus size={14} />
        </ControlButton>
        <ControlButton
          onClick={desktop.toggleMaximize}
          label={
            isMaximized
              ? t("desktop.titlebar.restore")
              : t("desktop.titlebar.maximize")
          }
        >
          {isMaximized ? <Copy size={12} /> : <Square size={12} />}
        </ControlButton>
        <ControlButton
          onClick={desktop.close}
          label={t("desktop.titlebar.close")}
          danger
        >
          <X size={16} />
        </ControlButton>
      </div>
    </div>
  );
}
