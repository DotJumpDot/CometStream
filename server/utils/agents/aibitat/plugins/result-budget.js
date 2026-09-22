/**
 * Shared result-budget helper for agent tools. Long model outputs are the
 * main context-window bloat on local harnesses: one chatty command can eat
 * thousands of tokens on every subsequent turn of a 50-call run.
 *
 * The policy here mirrors production harnesses (ZCode's per-tool
 * resultBudget): the model gets a bounded head+tail projection inline, and
 * when anything was cut the FULL text is spilled to a file under storage so
 * the model can page back in more with the file tools instead of the caller
 * having to choose between "truncate blind" and "dump everything".
 *
 * Callers keep their own per-tool budgets; this module owns the projection
 * shape, the marker wording, and spill-file retention so every tool reports
 * truncation the same way.
 */
const fs = require("fs");
const path = require("path");

// Spilled outputs older than this are deleted opportunistically on the next
// spill (best-effort; a failed cleanup must never break a tool result).
const SPILL_RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * Projects text to a bounded head+tail window.
 * @param {string} text - Raw text.
 * @param {number} [maxChars=8000] - Total budget including the marker.
 * @param {number} [headChars=2000] - Head window; the rest is tail.
 * @returns {{text: string, truncated: boolean, omittedChars: number}}
 */
function projectText(text, maxChars = 8000, headChars = 2000) {
  const raw = String(text ?? "");
  if (raw.length <= maxChars)
    return { text: raw, truncated: false, omittedChars: 0 };
  const tailChars = Math.max(0, maxChars - headChars);
  const omitted = raw.length - headChars - tailChars;
  return {
    text:
      raw.slice(0, headChars) +
      `\n...[${omitted} chars truncated]...\n` +
      raw.slice(raw.length - tailChars),
    truncated: true,
    omittedChars: omitted,
  };
}

/**
 * Writes full text to a spill file so the model can read more on demand.
 * Retention sweep is opportunistic and failure-silent.
 * @param {string} dir - Absolute spill directory (created when needed).
 * @param {string} label - Short label used in the file name.
 * @param {string} content - Full text to persist.
 * @returns {string|null} Absolute path of the spill file, or null on failure.
 */
function spillText(dir, label, content) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    sweepSpills(dir);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rand = Math.random().toString(36).slice(2, 8);
    const safeLabel = String(label ?? "output")
      .replace(/[^a-z0-9-_]+/gi, "-")
      .slice(0, 40);
    const filePath = path.join(dir, `${stamp}-${safeLabel}-${rand}.log`);
    fs.writeFileSync(filePath, String(content ?? ""));
    return filePath;
  } catch {
    return null; // Spill is best-effort UI for the model - never throw.
  }
}

/**
 * Deletes spill files older than SPILL_RETENTION_MS. Never throws: on
 * readdir errors it returns immediately (iterating undefined would crash).
 * @param {string} dir - Spill directory.
 */
function sweepSpills(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  if (!Array.isArray(entries)) return;
  const cutoff = Date.now() - SPILL_RETENTION_MS;
  for (const entry of entries) {
    if (!entry.endsWith(".log")) continue;
    try {
      const abs = path.join(dir, entry);
      const stat = fs.statSync(abs);
      if (stat.isFile() && stat.mtimeMs < cutoff)
        fs.rmSync(abs, { force: true });
    } catch {
      continue; // Raced deletion - skip it.
    }
  }
}

module.exports = { projectText, spillText, sweepSpills, SPILL_RETENTION_MS };
