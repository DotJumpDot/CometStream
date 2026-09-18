import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, CaretDown, FloppyDiskBack } from "@phosphor-icons/react";
import SkillFiles from "@/models/skillFiles";
import showToast from "@/utils/toast";
import { SimpleToggleSwitch } from "@/components/lib/Toggle";

/**
 * Self-contained admin section for SKILL.md skill files: points CometStream
 * at a folder of skills (e.g. C:\Code\AiSKill), lists what was found, and
 * toggles individual skills on/off for the agent. The folder is scanned live,
 * so new skills on disk appear here (and in chats) without a restart.
 */
export default function SkillFilesSection() {
  const { t } = useTranslation();
  const [directory, setDirectory] = useState("");
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingDirectory, setSavingDirectory] = useState(false);
  const [expandedSkill, setExpandedSkill] = useState(null);

  useEffect(() => {
    async function load() {
      const { directory, skills = [] } = await SkillFiles.list();
      setDirectory(directory || "");
      setSkills(skills);
      setLoading(false);
    }
    load();
  }, []);

  async function saveDirectory() {
    if (savingDirectory) return;
    setSavingDirectory(true);
    const result = await SkillFiles.setDirectory(directory);
    if (!result.success) {
      showToast(result.error || t("agent.skill_files.save-failed"), "error", {
        clear: true,
      });
    } else {
      setSkills(result.skills || []);
      setDirectory(result.directory || directory.trim());
      showToast(t("agent.skill_files.directory-saved"), "success", {
        clear: true,
      });
    }
    setSavingDirectory(false);
  }

  async function handleToggle(skill) {
    const newActive = !skill.active;
    setSkills((prev) =>
      prev.map((s) =>
        s.folder === skill.folder ? { ...s, active: newActive } : s
      )
    );
    const { success, error } = await SkillFiles.toggle(skill.folder, newActive);
    if (!success) {
      showToast(error || t("agent.skill_files.save-failed"), "error", {
        clear: true,
      });
      setSkills((prev) =>
        prev.map((s) =>
          s.folder === skill.folder ? { ...s, active: !newActive } : s
        )
      );
    }
  }

  return (
    <div className="mt-4">
      <div className="text-theme-text-primary flex items-center gap-x-2">
        <FolderOpen size={24} />
        <p className="text-lg font-medium">{t("agent.skill_files.title")}</p>
      </div>
      <p className="text-theme-text-secondary text-sm mt-1">
        {t("agent.skill_files.description")}
      </p>

      <div className="mt-3 flex gap-x-2">
        <input
          type="text"
          value={directory}
          onChange={(e) => setDirectory(e.target.value)}
          placeholder={t("agent.skill_files.directory-placeholder")}
          spellCheck={false}
          className="bg-theme-bg-primary text-theme-text-primary rounded-lg border border-white/10 px-3 py-2 flex-1 min-w-0 text-sm outline-none focus:border-cta-button"
        />
        <button
          type="button"
          onClick={saveDirectory}
          disabled={savingDirectory}
          className="border-none bg-cta-button text-white rounded-lg px-3 flex items-center gap-x-1.5 text-sm font-medium hover:opacity-80 disabled:opacity-50 shrink-0"
        >
          <FloppyDiskBack size={16} />
          {savingDirectory
            ? `${t("common.saving")}...`
            : t("agent.skill_files.save-directory")}
        </button>
      </div>

      {loading ? (
        <p className="text-theme-text-secondary text-sm mt-4">
          {t("agent.skill_files.loading")}...
        </p>
      ) : skills.length === 0 ? (
        <p className="text-theme-text-secondary text-sm mt-4">
          {directory
            ? t("agent.skill_files.none-found")
            : t("agent.skill_files.none-configured")}
        </p>
      ) : (
        <div className="mt-3 bg-theme-bg-secondary text-white rounded-xl">
          {skills.map((skill, index) => (
            <SkillFileRow
              key={skill.folder}
              skill={skill}
              isFirst={index === 0}
              isLast={index === skills.length - 1}
              expanded={expandedSkill === skill.folder}
              onExpand={() =>
                setExpandedSkill(
                  expandedSkill === skill.folder ? null : skill.folder
                )
              }
              onToggle={() => handleToggle(skill)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SkillFileRow({
  skill,
  isFirst,
  isLast,
  expanded,
  onExpand,
  onToggle,
}) {
  const { t } = useTranslation();
  return (
    <div
      className={`py-3 px-4 ${isFirst ? "rounded-t-xl" : ""} ${
        isLast ? "rounded-b-xl" : "border-b border-white/10"
      }`}
    >
      <div className="flex items-center justify-between gap-x-2">
        <button
          type="button"
          onClick={onExpand}
          className="flex items-center gap-x-2 min-w-0 flex-1 text-left"
        >
          <CaretDown
            size={14}
            className={`text-theme-text-secondary shrink-0 transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
          />
          <div className="text-sm font-light truncate">{skill.name}</div>
          <div className="text-xs text-theme-text-secondary font-mono shrink-0">
            {skill.folder}
          </div>
        </button>
        <SimpleToggleSwitch
          size="md"
          enabled={skill.active}
          onChange={onToggle}
        />
      </div>
      {expanded && (
        <div className="flex flex-col gap-y-2 mt-2">
          <p className="text-theme-text-secondary text-sm text-left">
            {skill.description || ""}
          </p>
          {skill.files.length > 0 && (
            <p className="text-theme-text-secondary text-xs text-left font-mono">
              {skill.files.join(", ")}
            </p>
          )}
          <p className="text-theme-text-secondary text-xs text-left">
            {t("agent.skill_files.tool-name")}: {skill.toolName}
          </p>
        </div>
      )}
    </div>
  );
}
