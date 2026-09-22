/**
 * Model trajectory recorder: one compact record per LLM iteration (every
 * provider completion in the execution loop), streamed to the frontend as
 * `trajectoryEvent` for the agent panel's Trajectory tab.
 *
 * Why this exists: local-harness debugging is blind without it. Every
 * reasoning_effort mystery, truncated thought, and malformed tool call was
 * diagnosed with throwaway scripts because no surface shows what each LLM
 * turn actually sent and received. The record carries per-iteration deltas
 * (only messages added since the previous turn, like ZCode's trajectory
 * timeline) with bounded previews - enough to see a bad tool call or a
 * reasoning budget blowout, never the full context dump.
 *
 * Session-only and in-memory (like sessions.js): trajectory data is large
 * and only meaningful live. Reloaded threads keep the run trace
 * (plugins/trace.js), not the per-call payloads.
 */

const MAX_TRAJECTORY_RECORDS = 100;
const TRAJ_CONTENT_CHARS = 1_500;
const TRAJ_ARGS_CHARS = 800;
const TRAJ_TOOL_PREVIEW = 12;

/**
 * Ensures the instance carries a trajectory buffer.
 * @param {object} aibitat - aibitat instance
 * @returns {Array} The trajectory buffer.
 */
function ensureTrajectory(aibitat) {
  if (!aibitat) return [];
  if (!Array.isArray(aibitat._pendingTrajectory))
    aibitat._pendingTrajectory = [];
  if (!Number.isInteger(aibitat._trajectoryMsgCount))
    aibitat._trajectoryMsgCount = 0;
  return aibitat._pendingTrajectory;
}

/**
 * Projects a message body to a bounded preview string.
 * @param {unknown} content
 * @returns {string} Preview ("" for non-strings).
 */
function previewContent(content) {
  const text =
    typeof content === "string" ? content : JSON.stringify(content ?? null);
  if (text.length <= TRAJ_CONTENT_CHARS) return text;
  return (
    text.slice(0, TRAJ_CONTENT_CHARS) +
    `…[+${text.length - TRAJ_CONTENT_CHARS} chars]`
  );
}

/**
 * Summarizes one message for the delta (role + preview; tool calls by name).
 * @param {object} message - Provider message.
 * @returns {{role: string, preview: string, toolCalls: string[]}}
 */
function summarizeMessage(message = {}) {
  const toolCalls = [];
  const content = message.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block?.type === "text" && typeof block.text === "string")
        toolCalls.push(`text:${block.text.slice(0, 80)}`);
    }
  }
  return {
    role: message.role || "unknown",
    preview: previewContent(typeof content === "string" ? content : content),
    toolCalls,
  };
}

/**
 * Summarizes requested tool calls (name + bounded args preview).
 * @param {Array} functionCalls - Parsed calls from the completion.
 * @returns {Array<{name: string, args: string}>}
 */
function summarizeToolCalls(functionCalls = []) {
  return functionCalls.slice(0, TRAJ_TOOL_PREVIEW).map((call) => {
    let args = "";
    try {
      args = JSON.stringify(call?.arguments ?? {});
    } catch {
      args = "[unserializable]";
    }
    if (args.length > TRAJ_ARGS_CHARS)
      args =
        args.slice(0, TRAJ_ARGS_CHARS) +
        `…[+${args.length - TRAJ_ARGS_CHARS} chars]`;
    return { name: call?.name || "(unnamed)", args };
  });
}

/**
 * Records one LLM iteration and streams it to the frontend panel.
 * Never throws - recording must not break the run it observes.
 * @param {object} aibitat - aibitat instance
 * @param {object} input
 * @param {Array} [input.messages] - Full message list sent this iteration.
 * @param {Array} [input.functions] - Tool definitions offered.
 * @param {object} [input.result] - Provider completion (textResponse/functionCalls/usage).
 * @param {string} [input.error] - Iteration error text, if it failed.
 * @param {number} [input.depth] - Tool-budget depth of this iteration.
 */
function recordTrajectoryIteration(aibitat, input = {}) {
  try {
    const trajectory = ensureTrajectory(aibitat);
    const messages = Array.isArray(input.messages) ? input.messages : [];
    const functions = Array.isArray(input.functions) ? input.functions : [];
    const result = input.result || {};

    const prevCount = aibitat._trajectoryMsgCount || 0;
    const deltas = messages.slice(prevCount).map(summarizeMessage);
    aibitat._trajectoryMsgCount = messages.length;

    const calls = Array.isArray(result.functionCalls)
      ? result.functionCalls
      : result.functionCall
        ? [result.functionCall]
        : [];

    let usage = null;
    try {
      usage = aibitat?.providerInstance?.getCumulativeUsage?.() ?? null;
    } catch {
      usage = null;
    }

    const record = {
      seq: trajectory.length + 1,
      at: new Date().toISOString(),
      provider: aibitat?.provider ?? null,
      model: aibitat?.model ?? null,
      depth: Number.isInteger(input.depth) ? input.depth : 0,
      offeredTools: functions.length,
      newMessages: deltas,
      requestedTools: summarizeToolCalls(calls),
      textChars:
        typeof result.textResponse === "string"
          ? result.textResponse.length
          : 0,
      usage,
      ...(input.error ? { error: String(input.error).slice(0, 500) } : {}),
    };
    trajectory.push(record);
    if (trajectory.length > MAX_TRAJECTORY_RECORDS) trajectory.shift();
    try {
      aibitat?.socket?.send?.("trajectoryEvent", record);
    } catch {
      // No live socket (subagents, tests) - the buffer still accumulates.
    }
    return record;
  } catch {
    return null;
  }
}

module.exports = {
  ensureTrajectory,
  recordTrajectoryIteration,
  previewContent,
  summarizeMessage,
  summarizeToolCalls,
  MAX_TRAJECTORY_RECORDS,
  TRAJ_CONTENT_CHARS,
  TRAJ_ARGS_CHARS,
};
