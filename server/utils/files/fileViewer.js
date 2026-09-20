const fs = require("fs/promises");
const path = require("path");
const filesystemManager = require("../agents/aibitat/plugins/filesystem/lib");

// The viewer is a chat-side reader, not a data pipeline - cap what one
// response may carry so a huge file cannot balloon the panel payload.
const MAX_TEXT_BYTES = 512 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Heuristic binary check: text files do not contain NUL bytes and rarely
 * lead with a high ratio of non-printable characters.
 * @param {Buffer} buffer - first bytes of the file
 * @returns {boolean} true when the content looks binary
 */
function looksBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  if (sample.includes(0)) return true;
  let control = 0;
  for (const byte of sample) {
    if (byte < 9 || (byte > 13 && byte < 32)) control++;
  }
  return sample.length > 0 && control / sample.length > 0.1;
}

/**
 * House path rule (see AGENTS.md): reject user-supplied path segments
 * before any resolution - no NUL, no absolute paths (POSIX, Windows drive,
 * UNC), no `..` or malformed segments. The filesystem manager's
 * validatePath still runs afterwards as the authoritative boundary check;
 * this guard stops tainted input at the entry point.
 * @param {string} candidate - raw path from the request
 * @returns {boolean} true when the path cannot be a safe relative path
 */
function hasUnsafeSegments(candidate) {
  if (candidate.includes("\x00")) return true;
  if (/^[a-zA-Z]:/.test(candidate) || candidate.startsWith("/")) return true;
  return candidate
    .split(/[\\/]+/)
    .some((seg) => seg === ".." || (seg !== "." && path.basename(seg) !== seg));
}

/**
 * Reads a file from the agent filesystem sandbox for the chat file viewer.
 * All resolution and traversal/symlink rejection is delegated to the
 * filesystem manager's validatePath - the sandbox root is the only
 * reachable directory, and every returned path is shown relative to it.
 *
 * @param {string} rawPath - path as written in the chat message (relative
 *   to the sandbox root, e.g. "hello.html" or "src/index.js")
 * @returns {Promise<{
 *   ok: boolean,
 *   reason?: string,
 *   path?: string,
 *   basename?: string,
 *   kind?: "text"|"image"|"binary"|"missing"|"too-large",
 *   content?: string,
 *   mime?: string,
 *   size?: number,
 *   truncated?: boolean
 * }>}
 */
async function readFileForViewer(rawPath) {
  if (typeof rawPath !== "string" || !rawPath.trim()) {
    return { ok: false, reason: "A file path is required." };
  }

  const trimmed = rawPath.trim();
  if (hasUnsafeSegments(trimmed)) {
    return { ok: false, reason: "Could not open path in the agent workspace." };
  }

  let absolutePath;
  try {
    absolutePath = await filesystemManager.validatePath(trimmed);
  } catch {
    // validatePath throws for traversal/symlink escapes and for paths
    // whose parent directories do not exist - both are unopenable here.
    return { ok: false, reason: "Could not open path in the agent workspace." };
  }

  let stats;
  try {
    stats = await fs.stat(absolutePath);
  } catch {
    return {
      ok: true,
      path: filesystemManager.relativeDisplayPath(absolutePath),
      basename: path.basename(absolutePath),
      kind: "missing",
    };
  }

  const displayPath = filesystemManager.relativeDisplayPath(absolutePath);
  const basename = path.basename(absolutePath);

  if (stats.isDirectory()) {
    return { ok: false, reason: "Path is a directory, not a file." };
  }

  if (filesystemManager.isImageFile(absolutePath)) {
    if (stats.size > MAX_IMAGE_BYTES) {
      return {
        ok: true,
        path: displayPath,
        basename,
        kind: "too-large",
        size: stats.size,
      };
    }
    const buffer = await fs.readFile(absolutePath);
    const mime = filesystemManager.getImageMimeType(absolutePath);
    return {
      ok: true,
      path: displayPath,
      basename,
      kind: "image",
      mime,
      size: stats.size,
      content: `data:${mime};base64,${buffer.toString("base64")}`,
    };
  }

  // Read a capped prefix for binary detection + text content; reading the
  // whole file first would defeat the size cap for very large files.
  const readLimit = MAX_TEXT_BYTES + 1;
  const handle = await fs.open(absolutePath, "r");
  let head;
  try {
    const buffer = Buffer.alloc(Math.min(readLimit, stats.size));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    head = buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }

  if (looksBinary(head)) {
    return {
      ok: true,
      path: displayPath,
      basename,
      kind: "binary",
      size: stats.size,
    };
  }

  const truncated = stats.size > head.length;
  // Cut the decoded text on a character boundary so multi-byte UTF-8 does
  // not end in a replacement character when the read was capped.
  let content = head.toString("utf-8");
  if (truncated) content = content.slice(0, content.length - 1);

  return {
    ok: true,
    path: displayPath,
    basename,
    kind: "text",
    content,
    size: stats.size,
    truncated,
  };
}

module.exports = {
  readFileForViewer,
  looksBinary,
  hasUnsafeSegments,
  MAX_TEXT_BYTES,
};
