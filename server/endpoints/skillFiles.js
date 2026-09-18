/**
 * Admin API for SKILL.md skill files: list what the skills directory
 * contains, point the app at a directory, and toggle skills on/off.
 * All routes are admin-only. See server/utils/agents/skillFiles.js for the
 * loader itself.
 */
const { reqBody } = require("../utils/http");
const SkillFiles = require("../utils/agents/skillFiles");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { validatedRequest } = require("../utils/middleware/validatedRequest");

function skillFilesEndpoints(app) {
  if (!app) return;

  // Discover the skills in the currently configured directory.
  app.get(
    "/skill-files/list",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (_request, response) => {
      try {
        const result = await SkillFiles.listSkillFiles();
        return response.status(200).json({
          success: true,
          error: null,
          directory: result.directory,
          skills: result.skills,
        });
      } catch (error) {
        console.error("Error listing skill files:", error);
        return response.status(500).json({
          success: false,
          error: error.message,
          directory: null,
          skills: [],
        });
      }
    }
  );

  // Set (or clear, when the body's directory is empty) the skills root.
  // Responds with the re-scanned skill list so the UI updates in one call.
  app.post(
    "/skill-files/directory",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { directory } = reqBody(request);
        const result = await SkillFiles.setSkillsDirectory(directory);
        const list = await SkillFiles.listSkillFiles();
        return response.status(result.success ? 200 : 400).json({
          success: result.success,
          error: result.error,
          directory: result.directory,
          skills: result.success ? list.skills : [],
        });
      } catch (error) {
        console.error("Error setting skill files directory:", error);
        return response.status(500).json({
          success: false,
          error: error.message,
          directory: null,
          skills: [],
        });
      }
    }
  );

  // Toggle a single skill's active state by folder name.
  app.post(
    "/skill-files/toggle",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { name, active } = reqBody(request);
        const result = await SkillFiles.toggleSkillFile(name, active);
        return response.status(result.success ? 200 : 400).json({
          success: result.success,
          error: result.error,
        });
      } catch (error) {
        console.error("Error toggling skill file:", error);
        return response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );
}

module.exports = { skillFilesEndpoints };
