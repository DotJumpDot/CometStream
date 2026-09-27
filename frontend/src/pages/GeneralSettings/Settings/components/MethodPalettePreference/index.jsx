import { useMethodPalette, METHOD_PRESETS } from "@/hooks/useMethodPalette";
import { useTranslation } from "react-i18next";

export default function MethodPalettePreference() {
  const { t } = useTranslation();
  const { presetKey, setPreset, restore } = useMethodPalette();

  return (
    <div className="flex items-center justify-between gap-x-6 py-4">
      <div className="flex flex-col gap-y-0.5">
        <p className="text-sm leading-6 font-semibold text-theme-text-primary">
          {t("customization.items.method-palette.title")}
        </p>
        <p className="text-xs text-theme-text-secondary">
          {t("customization.items.method-palette.description")}
        </p>
      </div>
      <div className="flex items-center gap-x-2 shrink-0">
        <select
          value={presetKey}
          onChange={(e) => setPreset(e.target.value)}
          className="border-none bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-fit py-2 px-4"
        >
          {Object.keys(METHOD_PRESETS).map((key) => (
            <option key={key} value={key}>
              {t(`customization.items.method-palette.presets.${key}`)}
            </option>
          ))}
        </select>
        <button
          onClick={restore}
          className="text-xs font-semibold rounded-lg px-3 py-2 border border-theme-modal-border text-theme-text-primary hover:text-theme-text-primary"
        >
          {t("customization.items.method-palette.restore")}
        </button>
      </div>
    </div>
  );
}
