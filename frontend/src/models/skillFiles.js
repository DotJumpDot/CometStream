import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

const SkillFiles = {
  /**
   * List all SKILL.md skills in the configured skills directory
   * @returns {Promise<{success: boolean, error: string|null, directory: string|null, skills: Array<{folder: string, toolName: string, name: string, description: string, active: boolean, files: string[]}>}>}
   */
  list: async () => {
    return await fetch(`${API_BASE}/skill-files/list`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => ({
        success: false,
        error: e.message,
        directory: null,
        skills: [],
      }));
  },

  /**
   * Set (or clear, when empty) the skills directory
   * @param {string} directory - Absolute path to a folder of skill subfolders
   * @returns {Promise<{success: boolean, error: string|null, directory: string|null, skills: Array}>}
   */
  setDirectory: async (directory) => {
    return await fetch(`${API_BASE}/skill-files/directory`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ directory }),
    })
      .then((res) => res.json())
      .catch((e) => ({
        success: false,
        error: e.message,
        directory: null,
        skills: [],
      }));
  },

  /**
   * Toggle a skill's active state
   * @param {string} name - The skill's folder name
   * @param {boolean} active - Whether the skill should be active
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  toggle: async (name, active) => {
    return await fetch(`${API_BASE}/skill-files/toggle`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ name, active }),
    })
      .then((res) => res.json())
      .catch((e) => ({
        success: false,
        error: e.message,
      }));
  },
};

export default SkillFiles;
