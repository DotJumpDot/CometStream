/**
 * Agent run trace recorder. The live chat renders thoughts, tool statuses,
 * file cards, plans, and terminal/subagent sessions as socket events, but
 * only the final reply text (plus generated-file outputs) reaches the DB -
 * reopening a thread loses the whole run history. This module records the
 * persistable slice of that stream onto the aibitat instance so the
 * chat-history plugin can save it with the turn's response JSON.
 *
 * What is recorded (chronological, capped):
 * - `statusResponse` introspection lines (tool activity log)
 * - `fileChangeCard` payloads (filesystem edits with diffs)
 * - `todoListCard` plan snapshots
 * - `sessionCard` terminal/subagent rows
 * - `<think>` reasoning blocks, captured per LLM iteration in the execution
 *   loop (the only place intermediate thoughts exist - only the final text
 *   is ever added to chat history)
 * - `agentNote` visible progress notes: an iteration's non-think text when
 *   it also made tool calls (recorded directly, not via socket). These are
 *   the lead-in/result sentences the model narrates between tool batches -
 *   without them a reloaded thread loses all mid-run narration.
 *
 * Deliberately NOT recorded: reportStreamEvent chunks (high-volume text
 * streaming, already covered by the final reply), approval prompts
 * (interactive state, meaningless on reload), citations (own pipeline).
 */

const MAX_TRACE_EVENTS = 200;
const STATUS_MAX_CHARS = 2_000;
const THOUGHT_MAX_CHARS = 8_000;
const SESSION_DETAIL_MAX_CHARS = 2_000;
const TODO_MAX_ITEMS = 50;
// Approved design docs ride the same persisted slice as the todo list so a
// reload restores the WHAT alongside the WHERE-ARE-WE (see plan-mode.js).
const PLAN_MAX_CHARS = 20_000;

// Socket event types worth persisting. Everything else is either
// high-volume (reportStreamEvent), interactive (toolApprovalRequest,
// clarificationRequest), or covered elsewhere (citations).
// Note: fileDownloadCard duplicates the generated-file `outputs`, but the
// trace copy preserves chronological interleave - the outputs renderer
// skips download payloads once the trace covers them (see HistoricalOutputs).
const RECORDED_TYPES = new Set([
  "statusResponse",
  "fileChangeCard",
  "fileDownloadCard",
  "todoListCard",
  "sessionCard",
  "planCard",
]);

const THINK_BLOCK_REGEX = /<think>([\s\S]*?)<\/think>/gi;

/**
 * Ensures the instance carries a trace buffer (lazy so execution-loop hooks
 * never throw on child/test instances that skipped plugin setup).
 * @param {object} aibitat - aibitat instance
 * @returns {Array} The trace buffer.
 */
function ensureTrace(aibitat) {
  if (!aibitat) return [];
  if (!Array.isArray(aibitat._pendingTrace)) aibitat._pendingTrace = [];
  return aibitat._pendingTrace;
}

/**
 * Caps a string with a truncation marker instead of silently cutting it.
 * @param {any} value - candidate text
 * @param {number} max - max characters
 * @returns {string} Capped text ("" for non-strings).
 */
function capText(value, max) {
  if (typeof value !== "string") return "";
  if (value.length <= max) return value;
  return value.slice(0, max) + `\n…[${value.length - max} chars truncated]…`;
}

/**
 * Deep-clones a socket payload through JSON so later mutation of the live
 * object cannot corrupt the persisted copy.
 * @param {any} content - event payload
 * @returns {any} Clone, or null when uncloneable.
 */
function cloneContent(content) {
  try {
    const clone = JSON.parse(JSON.stringify(content ?? null));
    return clone ?? null;
  } catch {
    return null;
  }
}

/**
 * Records one socket event into the trace buffer when it is a persistable
 * type. Payloads are cloned and capped; recording stops past the event cap
 * so a marathon run cannot grow the response row without bound.
 * @param {object} aibitat - aibitat instance
 * @param {string} type - socket event type
 * @param {any} content - event payload
 * @returns {boolean} Whether the event was recorded.
 */
function recordTraceEvent(aibitat, type, content) {
  if (!aibitat || !RECORDED_TYPES.has(type)) return false;
  const trace = ensureTrace(aibitat);
  if (trace.length >= MAX_TRACE_EVENTS) return false;

  let recorded = cloneContent(content);
  if (recorded === null && type !== "statusResponse") return false;
  if (type === "statusResponse") recorded = capText(recorded, STATUS_MAX_CHARS);
  if (type === "sessionCard" && recorded && typeof recorded === "object") {
    recorded = {
      ...recorded,
      label: capText(recorded.label, 300),
      detail: capText(recorded.detail, SESSION_DETAIL_MAX_CHARS),
    };
  }
  if (type === "todoListCard" && recorded && typeof recorded === "object") {
    const items = Array.isArray(recorded.items)
      ? recorded.items.slice(0, TODO_MAX_ITEMS)
      : [];
    recorded = { ...recorded, items };
  }
  if (type === "planCard" && recorded && typeof recorded === "object") {
    recorded = {
      ...recorded,
      plan: capText(recorded.plan, PLAN_MAX_CHARS),
    };
  }
  trace.push({ type, content: recorded });
  return true;
}

/**
 * Extracts `<think>` reasoning blocks from text.
 * @param {any} text - completion text (any iteration's textResponse)
 * @returns {{thoughts: string[], cleanText: string}} Thoughts (capped) plus
 *   the text with think blocks removed (unclosed trailing tag included).
 */
function extractThoughts(text) {
  if (typeof text !== "string" || !text)
    return { thoughts: [], cleanText: text };
  const thoughts = [];
  let match;
  THINK_BLOCK_REGEX.lastIndex = 0;
  while ((match = THINK_BLOCK_REGEX.exec(text)) !== null) {
    const thought = (match[1] ?? "").trim();
    if (thought) thoughts.push(capText(thought, THOUGHT_MAX_CHARS));
    // Guard against a pathological run of empty blocks.
    if (thoughts.length >= MAX_TRACE_EVENTS) break;
  }
  // An unclosed tag means a truncated/in-flight thought - drop the fragment
  // from persisted text rather than saving half a reasoning block.
  const cleanText = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "");
  return { thoughts, cleanText };
}

/**
 * Records the reasoning blocks of one LLM iteration's text in
 * chronological order. Called from the execution loop after every provider
 * completion - the only place intermediate thoughts exist.
 * @param {object} aibitat - aibitat instance
 * @param {any} textResponse - the iteration's text (may be null/undefined)
 */
function recordThoughtText(aibitat, textResponse) {
  if (typeof textResponse !== "string" || !textResponse.includes("<think>"))
    return;
  const trace = ensureTrace(aibitat);
  const { thoughts } = extractThoughts(textResponse);
  for (const thought of thoughts) {
    if (trace.length >= MAX_TRACE_EVENTS) return;
    trace.push({ type: "thoughtChain", content: thought });
  }
}

/**
 * Wraps the raw websocket `send(string)` once so persistable card/status
 * events are recorded as they stream. This is the single capture point:
 * `aibitat.introspect` (statusResponse) and `aibitat.socket.send` (cards)
 * both funnel through here. Non-JSON and non-allowlisted frames are
 * ignored. Safe to call when there is no socket or twice - both no-op.
 * @param {object} aibitat - aibitat instance
 * @param {object} socket - raw websocket with a string send()
 */
function wrapRawSocketForTrace(aibitat, socket) {
  if (!socket || typeof socket.send !== "function") return;
  if (socket._traceWrapped) return;
  const originalSend = socket.send.bind(socket);
  socket.send = (message, ...rest) => {
    try {
      if (typeof message === "string") {
        const data = JSON.parse(message);
        if (data && typeof data.type === "string")
          recordTraceEvent(aibitat, data.type, data.content);
      }
    } catch {
      // Recording must never break live streaming.
    }
    return originalSend(message, ...rest);
  };
  socket._traceWrapped = true;
}

/**
 * Records one iteration's visible progress note: the non-think text of a
 * completion that also made tool calls. Callers must only invoke this on
 * tool-call iterations - the final text-only iteration is the saved reply,
 * and recording it too would render the answer twice on reload.
 * @param {object} aibitat - aibitat instance
 * @param {any} textResponse - the iteration's text (may be null/undefined)
 * @returns {string|null} The recorded note, or null when there was nothing
 * visible to record (think-only or empty iterations).
 */
function recordAgentNote(aibitat, textResponse) {
  if (typeof textResponse !== "string" || !textResponse) return null;
  const { cleanText } = extractThoughts(textResponse);
  const note = cleanText.trim();
  if (!note) return null;
  const trace = ensureTrace(aibitat);
  if (trace.length >= MAX_TRACE_EVENTS) return null;
  const recorded = capText(note, STATUS_MAX_CHARS);
  trace.push({ type: "agentNote", content: recorded });
  return recorded;
}

/**
 * Takes the recorded trace for persistence (defensive copy).
 * @param {object} aibitat - aibitat instance
 * @returns {Array<{type: string, content: any}>} Trace events in order.
 */
function takeTrace(aibitat) {
  if (!aibitat || !Array.isArray(aibitat._pendingTrace)) return [];
  return aibitat._pendingTrace.slice(0, MAX_TRACE_EVENTS);
}

/** Clears the trace buffer (called after the turn is persisted). */
function clearTrace(aibitat) {
  if (aibitat) aibitat._pendingTrace = [];
}

module.exports = {
  ensureTrace,
  recordTraceEvent,
  recordThoughtText,
  recordAgentNote,
  extractThoughts,
  wrapRawSocketForTrace,
  takeTrace,
  clearTrace,
  RECORDED_TYPES,
  MAX_TRACE_EVENTS,
  STATUS_MAX_CHARS,
  THOUGHT_MAX_CHARS,
};
