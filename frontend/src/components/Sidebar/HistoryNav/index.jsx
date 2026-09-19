import { useEffect, useState } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

/**
 * ZCode-style back/forward navigation for the sidebar header. React Router
 * does not expose canGoBack/canGoForward, so a session-scoped stack of
 * visited location keys is tracked here and the index moves with PUSH/POP
 * navigations. Module scope (not component state) so the stack survives the
 * sidebar unmounting across route changes.
 */
const historyKeys = [];
let historyIndex = -1;

export default function HistoryNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const navType = useNavigationType();
  const navigate = useNavigate();
  // Stack lives in module scope; bump a counter to re-render on changes.
  const [, setTick] = useState(0);

  useEffect(() => {
    if (navType === "REPLACE") {
      historyKeys[historyIndex] = location.key;
    } else if (navType === "POP") {
      const idx = historyKeys.lastIndexOf(location.key);
      if (idx >= 0) {
        historyIndex = idx;
      } else {
        // Unknown key (e.g. browser restored the tab) - start a new branch.
        historyKeys.splice(historyIndex + 1);
        historyKeys.push(location.key);
        historyIndex = historyKeys.length - 1;
      }
    } else {
      // PUSH - a new entry truncates anything forward of the current index.
      historyKeys.splice(historyIndex + 1);
      historyKeys.push(location.key);
      historyIndex = historyKeys.length - 1;
    }
    setTick((v) => v + 1);
  }, [location.key, navType]);

  const canBack = historyIndex > 0;
  const canForward = historyIndex < historyKeys.length - 1;

  return (
    <div className="flex items-center gap-x-1 w-full">
      <button
        type="button"
        onClick={() => navigate(-1)}
        disabled={!canBack}
        aria-label={t("sidebar.nav_back")}
        title={t("sidebar.nav_back")}
        className="flex items-center justify-center w-7 h-7 rounded-lg text-theme-text-secondary transition-colors duration-150 hover:bg-white/10 hover:text-theme-text-primary disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-theme-text-secondary disabled:cursor-default"
      >
        <ArrowLeft size={16} />
      </button>
      <button
        type="button"
        onClick={() => navigate(1)}
        disabled={!canForward}
        aria-label={t("sidebar.nav_forward")}
        title={t("sidebar.nav_forward")}
        className="flex items-center justify-center w-7 h-7 rounded-lg text-theme-text-secondary transition-colors duration-150 hover:bg-white/10 hover:text-theme-text-primary disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-theme-text-secondary disabled:cursor-default"
      >
        <ArrowRight size={16} />
      </button>
    </div>
  );
}
