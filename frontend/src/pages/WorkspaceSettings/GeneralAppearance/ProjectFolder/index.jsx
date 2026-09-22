import { useTranslation } from "react-i18next";

/**
 * Per-project folder binding (ZCode-style folder-bound project).
 * Shows the absolute folder the agent works in for this project; bound at
 * creation from the folder name, editable here. Unbound legacy workspaces
 * fall back to the global terminal root. A relative entry is resolved
 * inside the terminal root when the agent runs.
 */
export default function ProjectFolder({ workspace, setHasChanges }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-y-[8px]">
      <div className="flex flex-col gap-y-[8px]">
        <label htmlFor="projectPath" className="block input-label">
          {t("general.project-folder.title")}
        </label>
        <p className="text-white text-opacity-60 text-xs font-medium">
          {t("general.project-folder.description")}
        </p>
      </div>
      <input
        name="projectPath"
        type="text"
        defaultValue={workspace?.projectPath ?? ""}
        className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5 font-mono"
        placeholder={t("general.project-folder.placeholder")}
        autoComplete="off"
        spellCheck={false}
        onChange={() => setHasChanges(true)}
      />
    </div>
  );
}
