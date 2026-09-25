const { WorkspaceChats } = require("../../models/workspaceChats");
const { Workspace } = require("../../models/workspace");
const { safeJsonParse } = require("../http");
const { generatedImageAttachments } = require("../files");
const { USER_AGENT, WORKSPACE_AGENT } = require("./defaults");

// Heuristic token estimate (~4 chars/token for English + code) - good enough
// to decide *when* to compact; exact counts are not worth a tokenizer dep.
const CHARS_PER_TOKEN = 4;
// Headroom subtracted from the budget for the system prompt, tool schemas and
// response space that ride along with the history on every request.
const RESERVED_TOKENS = 4_000;
// Rows (user+assistant pairs) kept verbatim after a compaction so the model
// still sees the most recent exchanges in full detail.
const KEEP_TAIL_ROWS = 4;
// Minimum rows that must be compactable for a run to be worthwhile - otherwise
// the summary would replace almost nothing and cost a full LLM call.
const MIN_COMPACTABLE_ROWS = 2;
// Per-message character cap in the summarizer transcript. Long tool dumps and
// file contents are the main bloat being compacted away anyway; the cap keeps
// the summarize call itself bounded on huge turns.
const MAX_TRANSCRIPT_MESSAGE_CHARS = 20_000;

/** Default compaction trigger as a percent of the model context window. */
const DEFAULT_THRESHOLD_PCT = 75;

/**
 * Rough token estimate for a string.
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text = "") {
  return Math.ceil(String(text ?? "").length / CHARS_PER_TOKEN);
}

/**
 * Clamp a workspace threshold setting to a sane range.
 * @param {number|undefined|null} pct
 * @returns {number}
 */
function normalizeThresholdPct(pct) {
  const value = Number(pct);
  if (!Number.isFinite(value)) return DEFAULT_THRESHOLD_PCT;
  return Math.min(95, Math.max(30, Math.round(value)));
}

/**
 * Decide whether an estimated history size warrants compaction.
 * Pure so it can be unit tested without a DB or provider.
 * @param {{ estimatedTokens: number, contextWindow: number|null, thresholdPct: number, rowCount: number }} input
 * @returns {boolean}
 */
function shouldAutoCompact({
  estimatedTokens,
  contextWindow,
  thresholdPct,
  rowCount,
}) {
  if (!contextWindow || contextWindow <= 0) return false;
  if (rowCount <= KEEP_TAIL_ROWS + MIN_COMPACTABLE_ROWS) return false;
  const budget = contextWindow * (normalizeThresholdPct(thresholdPct) / 100);
  return estimatedTokens + RESERVED_TOKENS >= budget;
}

/**
 * Split persisted rows into { toCompact, toKeep } where toKeep holds the most
 * recent KEEP_TAIL_ROWS rows. Returns empty toCompact when there is too
 * little history to be worth summarizing.
 * @param {Array<{id: number}>} rows - include=true rows ordered ascending
 * @returns {{ toCompact: Array, toKeep: Array }}
 */
function splitForCompaction(rows = []) {
  if (rows.length <= KEEP_TAIL_ROWS + MIN_COMPACTABLE_ROWS)
    return { toCompact: [], toKeep: rows };
  return {
    toCompact: rows.slice(0, rows.length - KEEP_TAIL_ROWS),
    toKeep: rows.slice(rows.length - KEEP_TAIL_ROWS),
  };
}

/**
 * Build the role-labeled transcript handed to the summarizer model.
 * @param {Array<{prompt: string, response: string}>} rows
 * @returns {string}
 */
function buildSummaryTranscript(rows = []) {
  return rows
    .map((row, i) => {
      const response = safeJsonParse(row.response, {});
      const user = clampMessage(row.prompt, "user");
      const assistant = clampMessage(response?.text ?? "", "assistant");
      return `[${i + 1}] User: ${user}\n[${i + 1}] Assistant: ${assistant}`;
    })
    .join("\n\n");

  function clampMessage(text, role) {
    const value = String(text ?? "").trim();
    if (value.length <= MAX_TRANSCRIPT_MESSAGE_CHARS) return value || "(empty)";
    return (
      value.slice(0, MAX_TRANSCRIPT_MESSAGE_CHARS) +
      ` …[${role} message truncated at ${MAX_TRANSCRIPT_MESSAGE_CHARS} chars]`
    );
  }
}

const SUMMARY_SYSTEM_PROMPT = `You compress conversation history for an AI coding agent. Summarize the transcript so the agent can continue working with full understanding but far fewer tokens.

Capture, in compact bullet form:
- The user's goals, requirements and constraints (verbatim key phrases where they matter)
- Decisions made and their rationale
- Files read, created or edited (paths) and what was done to each
- Tool/skill calls that mattered and their outcomes
- Errors hit and how they were resolved
- Anything the user explicitly asked to remember or follow up on

Rules:
- Never invent facts; only what the transcript shows
- Keep paths, commands, URLs and code identifiers exact
- Drop small talk, restatements and failed dead-ends (one line if a lesson matters)
- Aim for under 800 words unless the transcript demands more
- Output only the summary - no preamble, no headers about the task itself`;

/**
 * Drop reasoning-model <think> blocks from a completion. Reasoning models
 * (Apodex et al.) prepend their whole chain-of-thought; storing it would make
 * the "compact" summary as large as the history it replaced.
 * @param {string} text
 * @returns {string}
 */
function stripReasoning(text = "") {
  let out = String(text ?? "").replace(/<think>[\s\S]*?<\/think>/gi, "");
  // Stream cut before the closing tag: drop everything from a dangling opener.
  if (/<think>/i.test(out)) out = out.replace(/<think>[\s\S]*/i, "");
  return out.trim();
}

/**
 * Map persisted workspace_chats rows to AIbitat buffer messages - the same
 * shape AgentHandler.#chatHistory produces. Compact rows (from a previous
 * /compact run) inject a single summary message instead of a user/assistant
 * pair so the model sees one coherent "earlier context" block.
 * @param {Array} rows - chat rows ordered ascending
 * @returns {Array<{from: string, to: string, content: string, state: string}>}
 */
function agentHistoryFromRows(rows = []) {
  // The compact summary (if present) summarizes everything older than the
  // kept rows, so it leads the buffer - the model reads it as "earlier
  // context" before the recent verbatim exchanges.
  const summaryMessages = [];
  const agentHistory = [];
  for (const chatLog of rows) {
    const response = safeJsonParse(chatLog.response, {});
    if (response?.type === "compact") {
      summaryMessages.push({
        from: USER_AGENT.name,
        to: WORKSPACE_AGENT.name,
        content: `The earlier part of this conversation was compacted. Summary of everything before this point:\n\n${response.text || ""}`,
        state: "success",
      });
      continue;
    }

    // Re-read `/img` generated images off disk as attachments so they reach
    // the agent as vision context, the same way they do in normal chat.
    const attachments = generatedImageAttachments(response?.outputs);
    agentHistory.push(
      {
        from: USER_AGENT.name,
        to: WORKSPACE_AGENT.name,
        content: chatLog.prompt,
        state: "success",
        ...(attachments.length > 0 ? { attachments } : {}),
      },
      {
        from: WORKSPACE_AGENT.name,
        to: USER_AGENT.name,
        content: response?.text || "",
        state: "success",
      }
    );
  }
  return [...summaryMessages, ...agentHistory];
}

/**
 * Resolve the context window (tokens) for the provider/model the session will
 * use. Custom providers carry contextWindow in their model metadata; builtins
 * fall back to the per-provider promptWindowLimit tables.
 * @param {{provider: string, model: string|null}} config
 * @returns {Promise<number|null>}
 */
async function resolveContextWindow({ provider, model } = {}) {
  if (typeof provider === "string" && provider.startsWith("custom:")) {
    const { CustomLlmProviders } = require("../../models/customLlmProviders");
    const resolved = await CustomLlmProviders.resolveForChat(provider, model);
    const window = Number(resolved?.model?.contextWindow);
    return Number.isFinite(window) && window > 0 ? window : null;
  }
  try {
    const Provider = require("./aibitat/providers/ai-provider");
    return Provider.contextLimit(provider, model);
  } catch {
    return null;
  }
}

/**
 * Load the rows that make up this thread's live context (include=true, asc).
 * Mirrors the filters AgentHandler.#chatHistory uses.
 */
async function loadContextRows({
  workspaceId,
  threadId = null,
  userId = null,
}) {
  return await WorkspaceChats.where(
    {
      workspaceId,
      user_id: userId || null,
      thread_id: threadId || null,
      api_session_id: null,
      include: true,
    },
    null,
    { id: "asc" }
  );
}

/**
 * Detect the /compact slash command (optionally followed by trailing text).
 * @param {string} feedback
 * @returns {boolean}
 */
function isCompactCommand(feedback = "") {
  return /^\/compact(\s|$)/i.test(String(feedback).trim());
}

/**
 * Resolve a provider/model pair for the compaction summarizer without a live
 * session. Follows the same preference order agent sessions use (explicit
 * agent provider, then chat provider, then the system provider) but never
 * the model router - routing needs a live prompt, and a summarizer just
 * needs any working model. A null model is fine: custom providers resolve
 * their first enabled model and builtins fall back to env/defaults.
 * @param {object} [workspace] - workspace record
 * @returns {{provider: string, model: string|null}|null} Null when nothing is configured.
 */
function resolveSummarizerConfig(workspace = {}) {
  const candidates = [
    { provider: workspace.agentProvider, model: workspace.agentModel },
    { provider: workspace.chatProvider, model: workspace.chatModel },
  ];
  for (const candidate of candidates) {
    if (
      typeof candidate.provider === "string" &&
      candidate.provider &&
      candidate.provider !== "anythingllm-router"
    )
      return { provider: candidate.provider, model: candidate.model || null };
  }
  const systemProvider = process.env.LLM_PROVIDER;
  if (typeof systemProvider === "string" && systemProvider)
    return { provider: systemProvider, model: null };
  return null;
}

/**
 * Summarize older thread history into a compact summary row, freeing context.
 *
 * What one run does:
 * 1. Loads the thread's include=true rows and estimates their token cost
 * 2. Manual trigger always runs (when there is enough history); auto trigger
 *    only when the estimate crosses workspace.compactThreshold% of the model's
 *    context window and workspace.autoCompact is enabled
 * 3. Asks the session's own provider to summarize everything but the last
 *    KEEP_TAIL_ROWS rows
 * 4. Rewrites history: compacted rows -> include=false, one summary row
 *    (type "compact") inserted after them
 * 5. Rebuilds the live aibitat buffer from the rewritten rows so the next
 *    turn - not the next session - already runs on the compacted context
 *
 * Emits `contextCompactStart` / `contextCompactEnd` over the socket so the UI
 * can show the "Compressing context" / "Context compressed" states.
 *
 * @param {Object} params
 * @param {import("./aibitat")} params.aibitat - live session ( supplies the provider factory + invocation )
 * @param {import("ws").WebSocket|null} [params.socket] - frontend socket for status events
 * @param {"manual"|"auto"} [params.trigger]
 * @returns {Promise<{compacted: boolean, reason?: string, summary?: string, compactedMessages?: number, tokensBefore?: number, tokensAfter?: number, keptChatIds?: number[]}>}
 */
async function maybeCompactAgentContext({
  aibitat,
  socket = null,
  trigger = "auto",
}) {
  const invocation = aibitat?.handlerProps?.invocation;
  if (!invocation?.workspace_id)
    return { compacted: false, reason: "no-invocation" };
  return runCompaction({
    invocation,
    defaultProvider: {
      provider: aibitat.defaultProvider?.provider,
      model: aibitat.defaultProvider?.model,
    },
    buildProvider: (config) => aibitat.getProviderForConfig(config),
    applyLiveBuffer: (rows) => {
      // Swap the live buffer to the rewritten history so the very next turn
      // runs on the compacted context (drops in-session tool-call bloat too).
      aibitat._chats = agentHistoryFromRows(rows);
    },
    socket,
    trigger,
  });
}

/**
 * Compacts a thread (or the workspace-level home thread) with no live agent
 * session - powers the REST endpoint behind manual /compact on an idle
 * thread. Same rewrite as the session path (rows -> include=false + one
 * summary row); there is no live buffer to rebuild, the next session loads
 * the rewritten rows itself.
 * @param {Object} params
 * @param {number} params.workspaceId
 * @param {number|null} [params.threadId]
 * @param {number|null} [params.userId]
 * @param {string} params.provider
 * @param {string|null} [params.model]
 * @returns {Promise<{compacted: boolean, reason?: string, summary?: string, compactedMessages?: number, tokensBefore?: number, tokensAfter?: number, keptChatIds?: number[]}>}
 */
async function compactThreadHistory({
  workspaceId,
  threadId = null,
  userId = null,
  provider,
  model = null,
}) {
  if (!workspaceId || !provider)
    return { compacted: false, reason: "no-invocation" };
  // Lazy require: this module loads under plugins/websocket.js, which loads
  // under aibitat/index.js - a top-level require would close a require cycle.
  const AIbitat = require("./aibitat");
  const shell = new AIbitat({
    provider,
    model,
    chats: [],
    handlerProps: {
      invocation: {
        workspace_id: workspaceId,
        thread_id: threadId,
        user_id: userId,
      },
    },
  });
  return runCompaction({
    invocation: shell.handlerProps.invocation,
    defaultProvider: { provider, model },
    buildProvider: (config) => shell.getProviderForConfig(config),
    applyLiveBuffer: null,
    socket: null,
    trigger: "manual",
  });
}

/**
 * Shared compaction core for the session path (live buffer + socket events)
 * and the sessionless REST path.
 * @param {Object} params
 * @param {Object} params.invocation - {workspace_id, thread_id, user_id}
 * @param {{provider: string, model: string|null}} params.defaultProvider - provider config the summarizer is built from
 * @param {Function} params.buildProvider - (config) => provider instance with .complete()
 * @param {Function|null} [params.applyLiveBuffer] - (rows) => void; skipped on the sessionless path
 * @param {import("ws").WebSocket|null} [params.socket] - frontend socket for status events
 * @param {"manual"|"auto"} [params.trigger]
 * @returns {Promise<{compacted: boolean, reason?: string, summary?: string, compactedMessages?: number, tokensBefore?: number, tokensAfter?: number, keptChatIds?: number[]}>}
 */
async function runCompaction({
  invocation,
  defaultProvider,
  buildProvider,
  applyLiveBuffer = null,
  socket = null,
  trigger = "auto",
}) {
  const send = (type, content) =>
    socket?.send?.(JSON.stringify({ type, content }));

  try {
    const workspace = await Workspace.get({ id: invocation.workspace_id });
    if (!workspace) return { compacted: false, reason: "no-workspace" };
    if (trigger === "auto" && workspace.autoCompact === false)
      return { compacted: false, reason: "disabled" };

    const rows = await loadContextRows({
      workspaceId: invocation.workspace_id,
      threadId: invocation.thread_id || null,
      userId: invocation.user_id || null,
    });
    const { toCompact } = splitForCompaction(rows);
    if (toCompact.length === 0) {
      // A manual run leaves a pending "Compressing context" card on the
      // client - close it out. Auto runs are silent by design.
      if (trigger === "manual")
        send("contextCompactEnd", {
          ok: false,
          trigger,
          reason: "nothing-to-compact",
        });
      return { compacted: false, reason: "nothing-to-compact" };
    }

    const estimatedTokens = rows.reduce(
      (sum, row) =>
        sum + estimateTokens(row.prompt) + estimateTokens(row.response ?? ""),
      0
    );
    if (trigger === "auto") {
      const contextWindow = await resolveContextWindow({
        provider: defaultProvider?.provider,
        model: defaultProvider?.model,
      });
      if (
        !shouldAutoCompact({
          estimatedTokens,
          contextWindow,
          thresholdPct: workspace.compactThreshold,
          rowCount: rows.length,
        })
      )
        return { compacted: false, reason: "under-threshold" };
    }

    send("contextCompactStart", { trigger });

    // Build the summarizer from the same provider config the session uses.
    const provider = buildProvider({
      ...defaultProvider,
    });
    const completion = await provider.complete(
      [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Summarize this conversation history for continuation purposes:\n\n${buildSummaryTranscript(toCompact)}`,
        },
      ],
      []
    );
    const summary = stripReasoning(completion?.textResponse ?? "");
    if (!summary) throw new Error("Summarizer returned an empty summary.");

    const tokensBefore = estimatedTokens;
    const tokensAfter = estimateTokens(summary);
    await WorkspaceChats.markThreadHistoryInvalidV2({
      id: { in: toCompact.map((row) => row.id) },
    });
    const { chat: summaryRow } = await WorkspaceChats.new({
      workspaceId: invocation.workspace_id,
      user: { id: invocation.user_id || null },
      threadId: invocation.thread_id || null,
      include: true,
      prompt: "/compact",
      response: {
        text: summary,
        type: "compact",
        sources: [],
        metrics: {
          compactedMessages: toCompact.length,
          tokensBefore,
          tokensAfter,
          trigger,
        },
      },
    });
    if (!summaryRow)
      throw new Error("Failed to persist the compact summary row.");

    // Reload the rewritten history for the live buffer (session path) and
    // the surviving-row ids the client trims to.
    const remainingRows = await loadContextRows({
      workspaceId: invocation.workspace_id,
      threadId: invocation.thread_id || null,
      userId: invocation.user_id || null,
    });
    if (typeof applyLiveBuffer === "function") applyLiveBuffer(remainingRows);

    // The client trims its rendered history to these surviving rows so the
    // live view (and the context ring) matches the reloaded thread.
    const keptChatIds = remainingRows.map((row) => row.id);
    send("contextCompactEnd", {
      ok: true,
      trigger,
      summary,
      compactedMessages: toCompact.length,
      tokensBefore,
      tokensAfter,
      keptChatIds,
    });
    return {
      compacted: true,
      summary,
      compactedMessages: toCompact.length,
      tokensBefore,
      tokensAfter,
      keptChatIds,
    };
  } catch (error) {
    console.error("contextCompaction:", error.message);
    send("contextCompactEnd", { ok: false, trigger, error: error.message });
    return { compacted: false, reason: "error" };
  }
}

module.exports = {
  CHARS_PER_TOKEN,
  RESERVED_TOKENS,
  KEEP_TAIL_ROWS,
  MIN_COMPACTABLE_ROWS,
  DEFAULT_THRESHOLD_PCT,
  estimateTokens,
  normalizeThresholdPct,
  shouldAutoCompact,
  splitForCompaction,
  buildSummaryTranscript,
  agentHistoryFromRows,
  resolveContextWindow,
  resolveSummarizerConfig,
  isCompactCommand,
  stripReasoning,
  maybeCompactAgentContext,
  compactThreadHistory,
};
