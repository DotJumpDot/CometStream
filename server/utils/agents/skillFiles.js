/**
 * SKILL.md skill-file loader.
 *
 * Discovers Claude/ZCode-style skills (a folder of subfolders, each with a
 * SKILL.md entry file) and exposes them to workspace agents as invocable
 * tools using progressive disclosure - see the SkillFiles class docs below.
 *
 * Settings (SystemSettings):
 *  - `agent_skill_files_directory`: absolute path to the skills root folder.
 *  - `active_skill_files`: JSON array of toggled-off/on folder names; when
 *    unset every discovered skill is active (default-on).
 */
const fs = require("fs");
const path = require("path");
const { SystemSettings } = require("../../models/systemSettings");

const SKILL_ENTRY_FILE = "SKILL.md";
const DIRECTORY_SETTING = "agent_skill_files_directory";
const ACTIVE_SETTING = "active_skill_files";
const READER_ID = "@@skill_file_read";
const READER_TOOL_NAME = "skill-file-read";
// LLM tool descriptions are capped by providers; keep the surfaced text short.
const MAX_DESCRIPTION_LENGTH = 1024;
// Guard for the shared reader so a huge support file cannot flood the context.
const MAX_FILE_READ_BYTES = 1024 * 1024;

/**
 * A user-supplied path fragment is only safe to join when it is a single
 * plain path segment: no separators, no "." / "..", no NUL bytes. This makes
 * traversal via "../" or absolute-path injection impossible before any
 * path.resolve runs.
 * @param {string} segment - A path fragment from a tool call.
 * @returns {boolean}
 */
function isSafeSegment(segment = "") {
  return (
    typeof segment === "string" &&
    segment.length > 0 &&
    !segment.includes("/") &&
    !segment.includes("\\") &&
    segment !== "." &&
    segment !== ".." &&
    !segment.includes("\0") &&
    path.basename(segment) === segment
  );
}

/**
 * Loads Claude/ZCode-style skills from a user-curated folder on disk.
 * A skill is any immediate subfolder containing a SKILL.md with flat YAML
 * frontmatter (`name`, `description`). Skills are surfaced to the agent as
 * tools with progressive disclosure: the model only sees the name and
 * description up front; invoking the tool returns the full SKILL.md body and
 * a manifest of the skill's support files, which can be fetched on demand
 * with the shared `skill-file-read` tool.
 *
 * The folder is scanned live on every agent session, so skills added or
 * edited on disk are picked up by the next chat without a server restart.
 * When a directory is configured every skill in it is active by default;
 * individual skills can be toggled off (persisted in SystemSettings).
 */
class SkillFiles {
  /**
   * The configured skills directory, validated to exist and be a directory.
   * @returns {Promise<string|null>} Absolute path, or null when unset/invalid.
   */
  static async skillsDirectory() {
    const directory = await SystemSettings.getValueOrFallback(
      { label: DIRECTORY_SETTING },
      null
    );
    if (!directory) return null;
    try {
      const resolved = path.resolve(directory);
      if (!fs.statSync(resolved).isDirectory()) return null;
      return resolved;
    } catch {
      return null;
    }
  }

  /**
   * Set (or clear, when empty) the skills directory.
   * @param {string} directory - Absolute path to a folder of skill subfolders.
   * @returns {Promise<{success: boolean, error: string|null, directory: string|null}>}
   */
  static async setSkillsDirectory(directory = "") {
    const trimmed = (directory || "").trim();
    if (!trimmed) {
      await SystemSettings.updateSettings({ [DIRECTORY_SETTING]: "" });
      return { success: true, error: null, directory: null };
    }

    try {
      const resolved = path.resolve(trimmed);
      if (!fs.statSync(resolved).isDirectory())
        return {
          success: false,
          error: `"${trimmed}" is not a directory.`,
          directory: null,
        };
      await SystemSettings.updateSettings({ [DIRECTORY_SETTING]: resolved });
      return { success: true, error: null, directory: resolved };
    } catch {
      return {
        success: false,
        error: `"${trimmed}" does not exist.`,
        directory: null,
      };
    }
  }

  /**
   * Parse the flat `key: value` frontmatter block at the top of a SKILL.md.
   * Only supports single-line scalar values, which is all SKILL.md skills use.
   * @param {string} content - Raw SKILL.md content.
   * @returns {{name: string|null, description: string|null, body: string}}
   */
  static parseFrontmatter(content = "") {
    const empty = { name: null, description: null, body: content };
    if (!content.startsWith("---")) return empty;

    const end = content.indexOf("\n---", 3);
    if (end === -1) return empty;

    const block = content.slice(4, end);
    const body = content
      .slice(end + 4)
      .replace(/^\r?\n/, "")
      .trim();
    const frontmatter = {};
    for (const line of block.split(/\r?\n/)) {
      const separator = line.indexOf(":");
      if (separator === -1) continue;
      const key = line.slice(0, separator).trim();
      const value = line
        .slice(separator + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (key) frontmatter[key] = value;
    }
    return {
      name: frontmatter.name || null,
      description: frontmatter.description || null,
      body,
    };
  }

  /**
   * The aibitat function name for a skill folder.
   * Function names must stay within [a-zA-Z0-9_-] and 64 chars for providers.
   * @param {string} folder - The skill's folder name.
   * @returns {string}
   */
  static toolNameForFolder(folder = "") {
    const sanitized = folder.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 58);
    return `skill_${sanitized || "unnamed"}`;
  }

  /**
   * The active set as persisted. When never configured, null is returned and
   * callers treat every discovered skill as active (default-on).
   * @returns {Promise<string[]|null>}
   */
  static async activeSet() {
    const raw = await SystemSettings.getValueOrFallback(
      { label: ACTIVE_SETTING },
      null
    );
    if (raw === null || raw === "") return null;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  /**
   * Scan the configured directory and return every skill with its metadata.
   * @returns {Promise<{directory: string|null, error: string|null, skills: {folder: string, toolName: string, name: string|null, description: string|null, active: boolean, files: string[]}[]}>}
   */
  static async listSkillFiles() {
    const directory = await this.skillsDirectory();
    if (!directory) return { directory: null, error: null, skills: [] };

    const activeSet = await this.activeSet();
    const skills = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.resolve(directory, entry.name);
      const entryFile = path.join(skillPath, SKILL_ENTRY_FILE);
      if (!fs.existsSync(entryFile)) continue;

      let parsed = { name: null, description: null, body: "" };
      try {
        parsed = this.parseFrontmatter(fs.readFileSync(entryFile, "utf8"));
      } catch {
        continue;
      }

      const files = fs
        .readdirSync(skillPath, { withFileTypes: true })
        .filter((f) => f.isFile() && f.name !== SKILL_ENTRY_FILE)
        .map((f) => f.name);

      skills.push({
        folder: entry.name,
        toolName: this.toolNameForFolder(entry.name),
        name: parsed.name || entry.name,
        description: parsed.description,
        active: activeSet === null ? true : activeSet.includes(entry.name),
        files,
      });
    }

    skills.sort((a, b) => a.folder.localeCompare(b.folder));
    return { directory, error: null, skills };
  }

  /**
   * Persist the full active/inactive state for the current skill set.
   * @param {string} folder - The skill folder to toggle.
   * @param {boolean} active - The new active state.
   * @returns {Promise<{success: boolean, error: string|null, active: string[]|null}>}
   */
  static async toggleSkillFile(folder, active) {
    const { skills } = await this.listSkillFiles();
    if (!skills.some((s) => s.folder === folder))
      return {
        success: false,
        error: `Skill "${folder}" not found.`,
        active: null,
      };

    const current = (await this.activeSet()) ?? skills.map((s) => s.folder);
    const next = active
      ? [...new Set([...current, folder])]
      : current.filter((f) => f !== folder);

    await SystemSettings.updateSettings({
      [ACTIVE_SETTING]: JSON.stringify(next),
    });
    return { success: true, error: null, active: next };
  }

  /**
   * Loadable plugin ids (`@@skill_<folder>`, plus the shared reader) for every
   * active skill. Consumed by WORKSPACE_AGENT.getDefinition.
   * @returns {Promise<string[]>}
   */
  static async activeSkillFilePlugins() {
    const { skills } = await this.listSkillFiles();
    const active = skills.filter((s) => s.active);
    if (active.length === 0) return [];
    return [...active.map((s) => `@@skill_${s.folder}`), READER_ID];
  }

  /**
   * Build the aibitat plugin for a loadable id produced by
   * activeSkillFilePlugins - either a skill (`@@skill_<folder>`) or the shared
   * reader (`@@skill_file_read`).
   * @param {string} id - `@@skill_<folder>` or `@@skill_file_read`.
   * @returns {Promise<{name: string, plugin: Function}|null>}
   */
  static async loadSkillFilePlugin(id = "") {
    const root = await this.skillsDirectory();
    if (!root) return null;

    if (id === READER_ID) return this.#fileReaderPlugin(root);

    const folder = id.replace("@@skill_", "");
    if (!isSafeSegment(folder)) return null;
    const skillPath = path.resolve(root, folder);
    if (!skillPath.startsWith(root + path.sep)) return null;
    const entryFile = path.join(skillPath, SKILL_ENTRY_FILE);
    if (!fs.existsSync(entryFile)) return null;

    let parsed;
    try {
      parsed = this.parseFrontmatter(fs.readFileSync(entryFile, "utf8"));
    } catch {
      return null;
    }

    const toolName = this.toolNameForFolder(folder);
    const description = (
      parsed.description ||
      `Load the ${parsed.name || folder} skill instructions.`
    ).slice(0, MAX_DESCRIPTION_LENGTH);

    return {
      name: toolName,
      plugin: function () {
        return {
          name: toolName,
          setup: (aibitat) => {
            aibitat.function({
              super: aibitat,
              name: toolName,
              controller: new AbortController(),
              description:
                `Load the full instructions for the "${parsed.name || folder}" skill. ${description}`.slice(
                  0,
                  MAX_DESCRIPTION_LENGTH
                ),
              examples: [],
              parameters: {
                $schema: "http://json-schema.org/draft-07/schema#",
                type: "object",
                properties: {},
                additionalProperties: false,
              },
              handler: async function () {
                aibitat.introspect(`Loading skill: ${folder}`);
                // Read fresh from disk so live edits to the skill are honored.
                const content = fs.readFileSync(entryFile, "utf8");
                const fresh = SkillFiles.parseFrontmatter(content);
                const supportFiles = fs
                  .readdirSync(skillPath, { withFileTypes: true })
                  .filter((f) => f.isFile() && f.name !== SKILL_ENTRY_FILE)
                  .map((f) => f.name);

                const manifest = supportFiles.length
                  ? `\n\n---\nThis skill has support files: ${supportFiles.join(", ")}. Use the skill-file-read tool with skill="${folder}" and file="<filename>" when the instructions reference them.`
                  : "";
                return `--- SKILL.md: ${folder} ---\n${fresh.body}${manifest}`;
              },
            });
          },
        };
      },
    };
  }

  /**
   * The shared `skill-file-read` tool. Reads a support file from any skill in
   * the configured directory. `skill` and `file` must each be a single plain
   * path segment and the resolved target must remain under the skills root,
   * so reads cannot escape the directory.
   * @param {string} root - The validated skills root.
   * @returns {{name: string, plugin: Function}}
   */
  static #fileReaderPlugin(root) {
    const rootWithSep = root + path.sep;
    return {
      name: READER_TOOL_NAME,
      plugin: function () {
        return {
          name: READER_TOOL_NAME,
          setup: (aibitat) => {
            aibitat.function({
              super: aibitat,
              name: READER_TOOL_NAME,
              controller: new AbortController(),
              description:
                "Read a support file (e.g. RECIPES.md) belonging to a skill loaded from the skills directory. Use after a skill_* tool lists support files.",
              examples: [],
              parameters: {
                $schema: "http://json-schema.org/draft-07/schema#",
                type: "object",
                properties: {
                  skill: {
                    type: "string",
                    description: "The skill's folder name.",
                  },
                  file: {
                    type: "string",
                    description: "The file name within the skill folder.",
                  },
                },
                required: ["skill", "file"],
                additionalProperties: false,
              },
              handler: async function ({ skill, file } = {}) {
                if (!isSafeSegment(skill) || !isSafeSegment(file))
                  return "Invalid skill or file name.";
                try {
                  const target = path.resolve(root, skill, file);
                  if (!target.startsWith(rootWithSep))
                    return "Invalid path - reads are limited to the skills directory.";
                  if (!fs.existsSync(target))
                    return `File "${file}" not found in skill "${skill}".`;

                  const stat = fs.statSync(target);
                  if (!stat.isFile())
                    return `"${file}" in skill "${skill}" is not a file.`;
                  if (stat.size > MAX_FILE_READ_BYTES)
                    return `File "${file}" is too large to read (${stat.size} bytes).`;

                  aibitat.introspect(`Reading skill file: ${skill}/${file}`);
                  return fs.readFileSync(target, "utf8");
                } catch (error) {
                  return `Failed to read skill file: ${error.message}`;
                }
              },
            });
          },
        };
      },
    };
  }
}

module.exports = SkillFiles;
