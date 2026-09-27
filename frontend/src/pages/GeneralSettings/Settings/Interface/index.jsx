import Sidebar from "@/components/SettingsSidebar";
import SettingsCard from "@/components/SettingsCard";
import ThemePreview from "@/components/ThemePreview";
import TokenExamples from "@/components/TokenExamples";
import { THEME_SWATCHES } from "@/components/ThemePalette";
import EndpointLine from "@/components/EndpointLine";
import { isMobile } from "react-device-detect";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/hooks/useTheme";
import LanguagePreference from "../components/LanguagePreference";
import ThemePreference from "../components/ThemePreference";
import MethodPalettePreference from "../components/MethodPalettePreference";

const ENDPOINT_EXAMPLES = [
  "GET /api/blossoms?favorite=true",
  'POST /api/auth/register "username" "password" #FFB7C5',
  'PUT /api/settings/theme "sakura"',
  'PATCH /api/users/9 "hanami_user" #D4637D',
  "DELETE /api/blossoms/9 #D6455A",
];

export default function InterfaceSettings() {
  const { t } = useTranslation();
  const { theme, isLight } = useTheme();
  // The swatch card follows the active UI theme (`system` resolves to the
  // OS-driven light/dark choice), so Monokai shows Monokai hexes, not Sakura.
  const swatchKey = theme === "system" ? (isLight ? "light" : "dark") : theme;
  const swatches = THEME_SWATCHES[swatchKey] || THEME_SWATCHES.dark;

  return (
    <div className="w-screen h-screen overflow-hidden bg-theme-bg-container flex">
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
      >
        <div className="flex flex-col w-full px-1 md:pl-6 md:pr-[86px] md:py-6 py-16">
          <div className="w-full flex flex-col gap-y-1 pb-6 border-white light:border-theme-sidebar-border border-b-2 border-opacity-10">
            <div className="items-center">
              <p className="text-lg leading-6 font-bold text-theme-text-primary">
                {t("customization.interface.title")}
              </p>
            </div>
            <p className="text-xs leading-[18px] font-base text-theme-text-secondary">
              {t("customization.interface.description")}
            </p>
          </div>
          <SettingsCard>
            <ThemePreference />
            <LanguagePreference />
          </SettingsCard>
          <SettingsCard
            title={t("customization.items.palette.title")}
            description={t("customization.items.palette.description")}
          >
            <ThemePreview
              items={swatches.map(({ hex, labelKey }) => ({
                hex,
                label: t(`customization.items.palette.${labelKey}`),
              }))}
            />
          </SettingsCard>
          <SettingsCard
            title={t("customization.items.endpoint-preview.title")}
            description={t("customization.items.endpoint-preview.description")}
          >
            <MethodPalettePreference />
            <div className="py-2 grid gap-x-6 md:grid-cols-2">
              <div>
                {ENDPOINT_EXAMPLES.map((line) => (
                  <EndpointLine key={line} line={line} />
                ))}
              </div>
              <TokenExamples />
            </div>
          </SettingsCard>
        </div>
      </div>
    </div>
  );
}
