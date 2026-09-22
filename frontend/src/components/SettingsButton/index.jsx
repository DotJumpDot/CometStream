import useUser from "@/hooks/useUser";
import paths from "@/utils/paths";
import { ArrowUUpLeft, Wrench } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { useMatch } from "react-router-dom";
import { useTranslation } from "react-i18next";

// Long settings tab (ZCode project-panel style): a full-width ghost row that
// matches the sidebar quick-link rows, replacing the old floating circle
// icon button so Settings reads as part of the project panel.
const ROW_CLASS =
  "flex items-center gap-x-2.5 h-[34px] px-2.5 rounded-[8px] text-[13px] leading-none w-full text-white light:text-black hover:bg-theme-sidebar-subitem-hover transition-all duration-[200ms]";

export default function SettingsButton() {
  const isInSettings = !!useMatch("/settings/*");
  const { user } = useUser();
  const { t } = useTranslation();

  if (user && user?.role === "default") return null;

  if (isInSettings)
    return (
      <Link
        to={paths.home()}
        className={ROW_CLASS}
        aria-label="Home"
        data-tooltip-id="footer-item"
        data-tooltip-content="Back to workspaces"
      >
        <ArrowUUpLeft className="h-4 w-4 shrink-0 opacity-70" weight="bold" />
        <p className="whitespace-nowrap overflow-hidden">
          {t("sidebar.back-to-workspaces")}
        </p>
      </Link>
    );

  return (
    <Link
      to={paths.settings.interface()}
      className={ROW_CLASS}
      aria-label="Settings"
      data-tooltip-id="footer-item"
      data-tooltip-content="Open settings"
    >
      <Wrench className="h-4 w-4 shrink-0 opacity-70" weight="regular" />
      <p className="whitespace-nowrap overflow-hidden">
        {t("sidebar.settings")}
      </p>
    </Link>
  );
}
