/**
 * Project-folder helpers (ZCode-style folder-bound projects).
 *
 * A CometStream workspace can bind to one folder on the agent machine via its
 * `projectPath` column. The folder is always resolved inside the terminal
 * jail root (AGENT_TERMINAL_ROOT / in-app `terminal_agent_root` / sandbox),
 * never an arbitrary absolute path - the opt-in terminal skill is the real
 * gate, but a stored path must still not escape the jail on its own.
 *
 * Path input from the user or the model may be a plain folder name
 * ("my-app"), a relative path ("apps/my-app"), or an absolute path that
 * already sits inside the jail. Anything resolving outside the jail is
 * rejected. Each segment is validated first (no `/`, `\`, `..`, NUL) so a
 * malicious segment never reaches `path.resolve`.
 * @module utils/projectPath
 */
const fs = require("fs");
const path = require("path");

/**
 * Whether one path segment is safe to join into a project path.
 * Mirrors the `isSafeSegment` pattern in skillFiles.js: no separators,
 * no parent refs, no NUL bytes, and basename-stable.
 * @param {string} seg - Single path segment to check.
 * @returns {boolean} True when the segment is safe.
 */
function isSafeSegment(seg) {
  if (typeof seg !== "string") return false;
  if (seg.length === 0 || seg.length > 255) return false;
  if (seg === "." || seg === "..") return false;
  if (seg.includes("/") || seg.includes("\\") || seg.includes("\0"))
    return false;
  if (path.basename(seg) !== seg) return false;
  return true;
}

/**
 * Derives a display/project name from a folder path the way ZCode labels a
 * project tab: the folder's basename. Falls back to "My Project".
 * @param {string|null|undefined} projectPath - Folder path or name.
 * @returns {string} Basename (max 255 chars) or "My Project".
 */
function projectNameFromPath(projectPath) {
  if (!projectPath || typeof projectPath !== "string") return "My Project";
  const cleaned = projectPath.replace(/[/\\]+$/, "").trim();
  if (!cleaned) return "My Project";
  const base = path.basename(cleaned);
  if (!base || base === "." || base === "..") return "My Project";
  return base.slice(0, 255);
}

/**
 * Resolves user-supplied project-folder input against the jail root.
 * Accepts a plain name, a relative path, or an absolute path already inside
 * the jail. Returns the absolute jailed directory (not created).
 * @param {string} input - Raw folder input from the user/model.
 * @param {string} jailRoot - Absolute terminal root acting as the jail.
 * @returns {{ok: boolean, dir?: string, error?: string}} Resolution result.
 */
function resolveProjectPath(input, jailRoot) {
  if (!input || typeof input !== "string" || !input.trim())
    return { ok: false, error: "Project folder cannot be empty." };
  if (!jailRoot || typeof jailRoot !== "string")
    return { ok: false, error: "Terminal root is not configured." };

  const root = path.resolve(jailRoot);
  const trimmed = input.trim().replace(/[/\\]+$/, "");
  if (!trimmed) return { ok: false, error: "Project folder cannot be empty." };

  let candidate;
  if (path.isAbsolute(trimmed)) {
    candidate = path.resolve(trimmed);
  } else {
    const segments = trimmed.split(/[/\\]+/);
    for (const seg of segments) {
      // Each segment is validated before resolve so `..` can never climb
      // out - the startsWith check below is the second layer.
      if (!isSafeSegment(seg))
        return { ok: false, error: `Unsafe path segment: "${seg}".` };
    }
    candidate = path.resolve(root, ...segments);
  }

  // Jail check after resolve: the folder must be the root itself or below it.
  if (candidate !== root && !candidate.startsWith(root + path.sep))
    return {
      ok: false,
      error: "Project folder must stay inside the terminal root.",
    };
  return { ok: true, dir: candidate };
}

/**
 * Resolves and creates (mkdir -p) the project folder. Used at workspace
 * creation so the agent's first chat already has a directory to work in.
 * @param {string} input - Raw folder input from the user/model.
 * @param {string} jailRoot - Absolute terminal root acting as the jail.
 * @returns {{ok: boolean, dir?: string, error?: string}} Resolution result.
 */
function ensureProjectDir(input, jailRoot) {
  const resolved = resolveProjectPath(input, jailRoot);
  if (!resolved.ok) return resolved;
  try {
    fs.mkdirSync(resolved.dir, { recursive: true });
  } catch (e) {
    return {
      ok: false,
      error: `Could not create project folder: ${e.message}`,
    };
  }
  return resolved;
}

/**
 * Lists the immediate subfolders of a jailed directory for the folder
 * picker. The picker is click-to-select (like an upload dialog), so the
 * user never has to type a path: navigate in, select, done.
 * @param {string} jailRoot - Absolute terminal root acting as the jail.
 * @param {string} [rel] - Relative path inside the jail ("" = root).
 * @returns {{ok: boolean, dir?: string, rel?: string, folders?: Array<{name: string, hasSubdirs: boolean}>, error?: string}} Listing result.
 */
function listProjectFolders(jailRoot, rel = "") {
  if (!jailRoot || typeof jailRoot !== "string")
    return { ok: false, error: "Terminal root is not configured." };
  const root = path.resolve(jailRoot);
  const trimmed = String(rel ?? "")
    .trim()
    .replace(/[/\\]+$/, "");
  const resolved = trimmed
    ? resolveProjectPath(trimmed, root)
    : { ok: true, dir: root };
  if (!resolved.ok) return resolved;
  let entries;
  try {
    entries = fs.readdirSync(resolved.dir, { withFileTypes: true });
  } catch (e) {
    return { ok: false, error: `Cannot list folder: ${e.message}` };
  }
  const folders = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => {
      // hasSubdirs is best-effort for the picker's expand affordance - a
      // failure here never fails the listing itself.
      let hasSubdirs = false;
      try {
        hasSubdirs = fs
          .readdirSync(path.join(resolved.dir, entry.name), {
            withFileTypes: true,
          })
          .some((child) => child.isDirectory() && !child.name.startsWith("."));
      } catch {
        hasSubdirs = false;
      }
      return { name: entry.name, hasSubdirs };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    ok: true,
    dir: resolved.dir,
    rel: path.relative(root, resolved.dir) || "",
    folders,
  };
}

module.exports = {
  isSafeSegment,
  projectNameFromPath,
  resolveProjectPath,
  ensureProjectDir,
  listProjectFolders,
};
