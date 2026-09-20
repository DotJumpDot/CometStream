import { useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Context-compaction controls: a segmented auto/off toggle plus the
 * context-window percentage that triggers automatic compaction. Stored on the
 * workspace so each workspace's threshold follows the model it chats with
 * (context windows are per-model). Manual /compact always works regardless.
 */
export default function ContextCompactionSettings({
  workspace,
  setHasChanges,
}) {
  const { t } = useTranslation();
  const [autoCompact, setAutoCompact] = useState(
    workspace?.autoCompact !== false
  );
  const [threshold, setThreshold] = useState(workspace?.compactThreshold ?? 75);

  return (
    <div className="flex flex-col gap-y-[8px]">
      <div className="flex flex-col gap-y-[8px]">
        <label htmlFor="autoCompact" className="block input-label">
          {t("chat.compaction.title")}
        </label>
        <p className="text-white text-opacity-60 text-xs font-medium">
          {t("chat.compaction.description")}
        </p>
      </div>

      <div className="flex flex-col gap-y-[12px]">
        <div className="w-fit flex gap-x-1 items-center p-1 rounded-lg bg-theme-settings-input-bg">
          <input type="hidden" name="autoCompact" value={String(autoCompact)} />
          <button
            type="button"
            disabled={autoCompact}
            onClick={() => {
              setAutoCompact(true);
              setHasChanges(true);
            }}
            className={`border-none transition-bg duration-200 px-5 py-1 text-md rounded-md hover:bg-white/10 light:hover:bg-black/10 ${
              autoCompact
                ? "text-white bg-[#687280] cursor-default"
                : "text-white/60 bg-transparent cursor-pointer"
            }`}
          >
            {t("chat.compaction.auto_on")}
          </button>
          <button
            type="button"
            disabled={!autoCompact}
            onClick={() => {
              setAutoCompact(false);
              setHasChanges(true);
            }}
            className={`border-none transition-bg duration-200 px-5 py-1 text-md rounded-md hover:bg-white/10 light:hover:bg-black/10 ${
              !autoCompact
                ? "text-white bg-[#687280] cursor-default"
                : "text-white/60 bg-transparent cursor-pointer"
            }`}
          >
            {t("chat.compaction.auto_off")}
          </button>
        </div>

        <div className="flex flex-col gap-y-[8px]">
          <label
            htmlFor="compactThreshold"
            className="block text-xs font-medium text-white text-opacity-60"
          >
            {t("chat.compaction.threshold_label")}
          </label>
          <input
            name="compactThreshold"
            type="number"
            min={30}
            max={95}
            step={1}
            onWheel={(e) => e.target.blur()}
            defaultValue={threshold}
            onChange={(e) => {
              setThreshold(e.target.value);
              setHasChanges(true);
            }}
            className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
            placeholder="75"
            required={true}
            autoComplete="off"
          />
          <p className="text-white/40 text-xs">
            {t("chat.compaction.threshold_hint")}
          </p>
        </div>
      </div>
    </div>
  );
}
