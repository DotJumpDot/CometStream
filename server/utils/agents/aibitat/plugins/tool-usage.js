/**
 * Tool I/O accounting for the agent run: per-call token estimates split by
 * tool kind (terminal / subagent / files / MCP / built-in) plus a running
 * total the ContextRing card and trajectory records read from.
 *
 * Estimates only - arg/result payloads are chars/4 like the rest of the
 * client-side accounting. Real provider token counts (prompt/completion)
 * stay in Provider.getCumulativeUsage(); this module covers what the
 * provider never sees: how much context each tool kind moved.
 *
 * Session-only and in-memory (like sessions.js / trajectory.js): nothing
 * here persists. Recording must never break the run it observes, so every
 * entry point is guarded and the accumulator is bounded.
 */

const TOKEN_CHARS = 4;

/** Tool kinds for the usage split. */
const TOOL_KINDS = Object.freeze({
  TERMINAL: "terminal",
  SUBAGENT: "subagent",
  FILES_WRITE: "files-write",
  FILES_READ: "files-read",
  MCP: "mcp",
  BUILTIN: "builtin",
});

/**
 * Tools whose streamed arguments are worth a live progress row in the chat.
 * Terminal heredocs are excluded on purpose: the command (payload included)
 * is known up front and executes atomically, so the running session row
 * already shows its size - there is nothing incremental to report.
 *
 * Covers both the built-in file skills (dash names) and the MCP filesystem
 * server (underscore names: `${server}_${tool}`). Classification still
 * reports MCP writes under the MCP kind (tool origin, like ZCode's
 * mcp_tool split) - this set only gates the progress row.
 */
const FILE_WRITE_TOOLS = new Set([
  "filesystem-write-text-file",
  "filesystem-edit-file",
  "filesystem-write_file",
  "filesystem-edit_file",
  "create-text-file",
  "create-excel-file",
  "create-pdf-file",
  "create-docx-file",
  "create-pptx-presentation",
  "create-chart",
]);

const TERMINAL_TOOLS = new Set([
  "terminal-agent",
  "terminal-task-start",
  "task-output",
  "task-stop",
]);

// Long-text tools whose streamed args deserve a live pending row like file
// writes: exit-plan-mode proposals arrive as one large JSON blob (plan doc +
// todos) and would otherwise pop in all at once after a silent token burn.
// The chat renders a "receiving plan" row ticking up in chars until the
// completion's planCard replaces it (see agent.js).
const PLAN_PROGRESS_TOOLS = new Set(["exit-plan-mode"]);

const SUBAGENT_TOOLS = new Set(["delegate-task", "submit-task-result"]);

const FILES_WRITE_NAMES = new Set([
  ...FILE_WRITE_TOOLS,
  "filesystem-create-directory",
  "filesystem-copy-file",
  "filesystem-move-file",
]);

const FILES_READ_PREFIX = "filesystem-";

/**
 * Best-effort file path guess from partially-streamed JSON args. Key order
 * is model-dependent, but path-ish keys conventionally come first, so a
 * regex over the raw prefix usually resolves long before args complete.
 * The closing quote is deliberately NOT required: mid-stream the value is
 * still open, and a prefix guess is enough for the chat to match the
 * pending row against the completion's fileChangeCard.
 * @param {string} argsSoFar - Raw (possibly partial) JSON argument string.
 * @returns {string|null} Guessed path (possibly a prefix) or null.
 */
function guessPathFromArgs(argsSoFar) {
  if (typeof argsSoFar !== "string" || !argsSoFar) return null;
  const match =
    /"(?:filePath|file_path|path|filename|file)"\s*:\s*"([^"]{1,300})/.exec(
      argsSoFar
    );
  return match ? match[1] : null;
}

/**
 * Best-effort content line guess from partially-streamed JSON args. Newlines
 * inside string values travel as literal `\n` escapes, so their count tracks
 * the payload's line count (off by one for a missing trailing newline -
 * fine for a live checkpoint). Used for the pending file row's `+N` label
 * so it reads like the completion's `+N -N` row.
 * @param {string} argsSoFar - Raw (possibly partial) JSON argument string.
 * @returns {number} Guessed line breaks (>= 0).
 */
function guessLinesFromArgs(argsSoFar) {
  if (typeof argsSoFar !== "string" || !argsSoFar) return 0;
  const matches = argsSoFar.match(/\\n/g);
  return matches ? matches.length : 0;
}

/**
 * Classifies one tool call for the usage split. Origin first: anything that
 * arrived through the MCP hypervisor (`isMCPTool` on the registry
 * definition) counts as MCP traffic, because runtime MCP names
 * (`${server}-${tool}`) may textually collide with built-in prefixes. Name
 * rules then cover built-ins (runtime names are stable: `terminal-agent`,
 * `filesystem-*`, `delegate-task`).
 * @param {string} name - Runtime tool name.
 * @param {object} [fnDef] - Function definition from the agent registry.
 * @returns {string} One of TOOL_KINDS.
 */
function classifyToolKind(name, fnDef = null) {
  if (typeof name !== "string" || !name) return TOOL_KINDS.BUILTIN;
  if (fnDef?.isMCPTool) return TOOL_KINDS.MCP;
  if (TERMINAL_TOOLS.has(name)) return TOOL_KINDS.TERMINAL;
  if (SUBAGENT_TOOLS.has(name)) return TOOL_KINDS.SUBAGENT;
  if (FILES_WRITE_NAMES.has(name)) return TOOL_KINDS.FILES_WRITE;
  if (name === "todo-write" || name === "chat-history")
    return TOOL_KINDS.BUILTIN;
  // Plan-mode tools are session-state calls like todo-write, not file work.
  if (name === "enter-plan-mode" || name === "exit-plan-mode")
    return TOOL_KINDS.BUILTIN;
  if (name.startsWith(FILES_READ_PREFIX)) return TOOL_KINDS.FILES_READ;
  if (fnDef?.isMCPTool) return TOOL_KINDS.MCP;
  return TOOL_KINDS.BUILTIN;
}

/**
 * Cheap character count for token estimation. Strings measured directly;
 * anything else JSON-encoded once (failures count 0 - estimation must not
 * throw on exotic payloads).
 * @param {*} value - Args or result payload.
 * @returns {number} Character count (>= 0).
 */
function estimateChars(value) {
  try {
    if (typeof value === "string") return value.length;
    if (value == null) return 0;
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

/** @returns {number} Estimated tokens for a character count. */
function estimateTokens(chars) {
  return Math.ceil(Math.max(0, chars) / TOKEN_CHARS);
}

function emptyToolIo() {
  return { calls: 0, tokensEst: 0, byKind: {} };
}

function ensureToolIo(aibitat) {
  if (!aibitat) return emptyToolIo();
  if (!aibitat._toolIo || typeof aibitat._toolIo !== "object")
    aibitat._toolIo = emptyToolIo();
  if (!aibitat._toolIo.byKind || typeof aibitat._toolIo.byKind !== "object")
    aibitat._toolIo.byKind = {};
  if (!Array.isArray(aibitat._toolIoPending)) aibitat._toolIoPending = [];
  return aibitat._toolIo;
}

/**
 * Records one executed tool call into the run accumulator. Called from the
 * execution loop right after `fn.handler(args)` resolves (both async and
 * sync loops) - never from the streaming path, so sizes are final.
 * @param {object} aibitat - aibitat instance
 * @param {object} input
 * @param {string} input.name - Runtime tool name.
 * @param {object} [input.fnDef] - Registry definition (for the MCP flag).
 * @param {*} [input.args] - Parsed arguments passed to the handler.
 * @param {*} [input.result] - Raw handler result.
 * @returns {{kind: string, tokensEst: number}|null} The recorded entry.
 */
function accumulateToolIo(aibitat, input = {}) {
  try {
    const totals = ensureToolIo(aibitat);
    const name = typeof input.name === "string" ? input.name : "(unnamed)";
    const kind = classifyToolKind(name, input.fnDef ?? null);
    const tokensEst = estimateTokens(
      estimateChars(input.args) + estimateChars(input.result)
    );
    totals.calls += 1;
    totals.tokensEst += tokensEst;
    const bucket = totals.byKind[kind] ?? { calls: 0, tokensEst: 0 };
    bucket.calls += 1;
    bucket.tokensEst += tokensEst;
    totals.byKind[kind] = bucket;
    // Pending list drains into the next trajectory record so per-iteration
    // rows can name the calls the *previous* turn executed (results only
    // exist after the completion that requested them). Bounded: a stuck
    // drain cannot grow the run without limit.
    aibitat._toolIoPending.push({ name, kind, tokensEst });
    if (aibitat._toolIoPending.length > 200)
      aibitat._toolIoPending.splice(0, aibitat._toolIoPending.length - 200);
    return { name, kind, tokensEst };
  } catch {
    return null;
  }
}

/**
 * Drains the pending per-call list (see accumulateToolIo). The trajectory
 * recorder calls this once per iteration.
 * @param {object} aibitat - aibitat instance
 * @returns {Array<{name: string, kind: string, tokensEst: number}>} Drained entries.
 */
function drainPendingToolIo(aibitat) {
  try {
    ensureToolIo(aibitat);
    const pending = aibitat._toolIoPending;
    aibitat._toolIoPending = [];
    return pending;
  } catch {
    return [];
  }
}

/**
 * Snapshot of the run accumulator for trajectory records and usageMetrics
 * events. Copies so later mutations cannot rewrite already-sent payloads.
 * @param {object} aibitat - aibitat instance
 * @returns {{calls: number, tokensEst: number, byKind: object}} Snapshot.
 */
function toolIoSnapshot(aibitat) {
  try {
    const totals = ensureToolIo(aibitat);
    const byKind = {};
    for (const [kind, bucket] of Object.entries(totals.byKind ?? {}))
      byKind[kind] = {
        calls: bucket?.calls ?? 0,
        tokensEst: bucket?.tokensEst ?? 0,
      };
    return {
      calls: totals.calls ?? 0,
      tokensEst: totals.tokensEst ?? 0,
      byKind,
    };
  } catch {
    return emptyToolIo();
  }
}

module.exports = {
  TOOL_KINDS,
  FILE_WRITE_TOOLS,
  PLAN_PROGRESS_TOOLS,
  classifyToolKind,
  guessPathFromArgs,
  guessLinesFromArgs,
  estimateChars,
  estimateTokens,
  accumulateToolIo,
  drainPendingToolIo,
  toolIoSnapshot,
};
