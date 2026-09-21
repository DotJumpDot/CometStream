/**
 * Delegate-task skill (subagents). Lets the workspace agent fan a bounded
 * piece of work out to a child agent that runs with a focused toolset and
 * reports back a result, instead of doing everything in one long turn.
 *
 * SECURITY MODEL - read before changing anything:
 * The child runs with the SAME trust as the parent (same model, same
 * machine). The containment here is about cost and loops, not privilege:
 * - MAX NESTING DEPTH 1: a child (handlerProps.isSubAgent) is refused a
 *   further delegate-task call, so models cannot fork-bomb the server.
 * - Bounded tools: the child gets terminal, a read/write file subset, and
 *   todo-write only. No delegate-task, no flows, no MCP, no exposures the
 *   admin did not already grant the parent workspace agent.
 * - Bounded cost: maxToolCalls 15 and a wall-clock timeout
 *   (AGENT_SUBAGENT_TIMEOUT_MS, default 120s, max 600s) per delegation.
 * - Results return as TEXT (plus an optional short excerpt the child
 *   submits structurally). The parent decides what to do with it.
 */
const AIbitat = require("../index.js");

const SUBAGENT_MAX_TOOL_CALLS = 15;
const DEFAULT_TIMEOUT_MS = 120_000;
const MIN_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 600_000;
const MAX_TASK_CHARS = 8_000;
const RESULT_EXCERPT_CHARS = 4_000;

// Focused toolset for the child, as plugin loader ids (`parent#child` for
// multi-stage children). Mirrors resolveAgentSkill conventions.
const CHILD_TOOL_IDS = [
  "terminal-agent",
  "filesystem-agent#filesystem-read-text-file",
  "filesystem-agent#filesystem-write-text-file",
  "filesystem-agent#filesystem-edit-file",
  "filesystem-agent#filesystem-list-directory",
  "filesystem-agent#filesystem-create-directory",
  "filesystem-agent#filesystem-search-files",
  "filesystem-agent#filesystem-get-file-info",
  "todo-write",
];

/**
 * Whether this handler runs inside a subagent (nested delegation refused).
 * @param {object} aibitat - aibitat instance (`this.super` in handlers)
 * @returns {boolean}
 */
function isNestedSubAgent(aibitat) {
  return (
    aibitat?.handlerProps?.isSubAgent === true ||
    Number(aibitat?.handlerProps?.subAgentDepth ?? 0) >= 1
  );
}

/**
 * Clamps the delegation wall-clock timeout to sane bounds.
 * @returns {number} Timeout in milliseconds.
 */
function subAgentTimeoutMs() {
  const raw = Number.parseInt(process.env.AGENT_SUBAGENT_TIMEOUT_MS || "", 10);
  if (!Number.isFinite(raw)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, raw));
}

/**
 * Builds the child system prompt: scoped worker, forced structured submit.
 * @param {string} label - short task label for logs
 * @returns {string}
 */
function subAgentSystemPrompt(label) {
  return [
    `You are a focused subagent ("${label}"). Do the delegated task with your tools, then call submit-task-result exactly once and stop.`,
    "Rules:",
    "- Work only on the delegated task; do not ask questions, do not chat.",
    "- Keep tool calls minimal; prefer reading before writing.",
    "- You cannot spawn further subagents.",
    "- When done (or blocked), submit a concise result: what was accomplished, file paths touched, and anything the parent must know (errors, follow-ups).",
  ].join("\n");
}

/**
 * Attaches the bounded child toolset, skipping tools whose own availability
 * gate is closed (e.g. terminal without opt-in) so the child never offers a
 * tool whose handler would just refuse.
 * @param {import("../index.js")} childAibitat - child instance
 */
function attachChildTools(childAibitat) {
  // Lazy require: plugins/index.js registers this file, so a top-level
  // require would create an import cycle.
  const AgentPlugins = require("./index.js");
  const attached = [];
  for (const id of CHILD_TOOL_IDS) {
    try {
      if (id.includes("#")) {
        const [parent, childName] = id.split("#");
        const parentPlugin = AgentPlugins[parent];
        if (!parentPlugin || !Array.isArray(parentPlugin.plugin)) continue;
        const child = parentPlugin.plugin.find((c) => c.name === childName);
        if (!child) continue;
        childAibitat.use(child.plugin());
        attached.push(id);
        continue;
      }
      const plugin = AgentPlugins[id];
      if (!plugin) continue;
      childAibitat.use(plugin.plugin());
      attached.push(id);
    } catch {
      // A tool that fails to attach is skipped; the child works with the rest.
    }
  }
  return attached;
}

const delegateAgent = {
  // Plugin name doubles as the aibitat function name.
  name: "delegate-task",
  startupConfig: {
    params: {},
  },
  plugin: function () {
    return {
      name: this.name,
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description:
            "Delegate a focused, self-contained task to a subagent that runs with terminal, file read/write, and todo tools, then reports back. " +
            "Use it to parallelize independent work (e.g. 'research X while I do Y', 'scaffold the backend') or to isolate a long multi-step job. " +
            "The subagent cannot spawn further subagents. Returns the subagent's result text.",
          examples: [
            {
              prompt: "Scaffold the backend while I design the frontend",
              call: JSON.stringify({
                task: "Create backend/main.py with a FastAPI app exposing GET /api/health",
                context: "Project root is the terminal working directory.",
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              task: {
                type: "string",
                description:
                  "The self-contained task for the subagent, with done-criteria.",
              },
              context: {
                type: "string",
                description:
                  "Optional background the subagent needs (paths, conventions, constraints).",
              },
            },
            required: ["task"],
            additionalProperties: false,
          },
          handler: async function ({ task = "", context = "" }) {
            const trimmedTask = String(task ?? "").trim();
            if (!trimmedTask)
              return "Error: no task provided for the subagent.";
            if (trimmedTask.length > MAX_TASK_CHARS)
              return `Error: task too long (${trimmedTask.length} chars, max ${MAX_TASK_CHARS}). Split it and delegate in pieces.`;

            // Depth guard: subagents cannot spawn subagents.
            if (isNestedSubAgent(this.super)) {
              return "Error: nested delegation refused - subagents cannot spawn further subagents. Do the work with your own tools.";
            }

            if (this.super.requestToolApproval) {
              const approval = await this.super.requestToolApproval({
                skillName: this.name,
                payload: { task: trimmedTask.slice(0, 500) },
                description: "Delegate task to subagent",
              });
              if (!approval.approved) {
                this.super.introspect(
                  `${this.caller}: User rejected the ${this.name} request.`
                );
                return approval.message;
              }
            }

            const sessions = require("./sessions.js");
            const label =
              trimmedTask.split("\n")[0].slice(0, 120) || "subagent task";
            const session = sessions.startSession({
              kind: "subagent",
              label,
              detail: `Task:\n${trimmedTask}\n${
                context ? `\nContext:\n${context}` : ""
              }\n`,
            });
            const socket = this.super.socket;
            socket?.send?.("sessionCard", { ...session });
            this.super.handlerProps.log(`Delegating subagent task: ${label}`);
            this.super.introspect(
              `${this.caller}: Delegated subagent: ${label}`
            );

            const started = Date.now();
            try {
              const result = await runSubAgent({
                parentAibitat: this.super,
                task: trimmedTask,
                context: String(context ?? ""),
                label,
                log: this.super.handlerProps.log,
              });
              const excerpt = result.slice(0, RESULT_EXCERPT_CHARS);
              sessions.finishSession(
                session.id,
                "done",
                `\n--- result (${Date.now() - started}ms) ---\n${excerpt}`
              );
              emitSessionCard(socket, sessions, session.id);
              this.super.introspect(
                `${this.caller}: Subagent finished in ${Date.now() - started}ms`
              );
              return result;
            } catch (e) {
              const message = e?.message || "Unknown subagent error";
              sessions.finishSession(
                session.id,
                "error",
                `\n--- failed (${Date.now() - started}ms): ${message} ---`
              );
              emitSessionCard(socket, sessions, session.id);
              this.super.handlerProps.log(`delegate-task error: ${message}`);
              return `Subagent failed: ${message}`;
            }
          },
        });
      },
    };
  },
};

/**
 * Re-reads a session entry and mirrors it to the frontend panel.
 * @param {object} socket - aibitat socket for sessionCard events
 * @param {object} sessions - sessions registry module
 * @param {number} id - session id
 */
function emitSessionCard(socket, sessions, id) {
  const current = sessions.listSessions().find((entry) => entry.id === id);
  if (current) socket?.send?.("sessionCard", { ...current });
}

/**
 * Builds the bounded child agent: same provider/model as the parent,
 * focused toolset, depth tracking so nesting stays at one level.
 * handleAsyncExecution/handleExecution read the provider from
 * `child.providerInstance` (not from arguments) - it is assigned here, or
 * every child call fails.
 * @param {import("../index.js")} parentAibitat - parent instance
 * @returns {{child: import("../index.js"), attached: string[]}} Child + tool ids.
 */
function buildChildAibitat(parentAibitat) {
  const childAibitat = new AIbitat({
    provider: parentAibitat.provider,
    model: parentAibitat.model,
    chats: [],
    handlerProps: {
      ...parentAibitat.handlerProps,
      isSubAgent: true,
      subAgentDepth: Number(parentAibitat.handlerProps?.subAgentDepth ?? 0) + 1,
    },
    maxToolCalls: SUBAGENT_MAX_TOOL_CALLS,
  });

  // Share introspection so child tool activity streams to the frontend log.
  childAibitat.introspect = parentAibitat.introspect;
  // Filtered socket: pass session/introspect events through, but suppress
  // reportStreamEvent so child chatter never renders as chat messages.
  childAibitat.socket = {
    send: (type, content) => {
      if (type === "reportStreamEvent") return;
      parentAibitat.socket?.send(type, content);
    },
  };

  const attached = attachChildTools(childAibitat);

  const provider = childAibitat.getProviderForConfig(
    childAibitat.defaultProvider
  );
  provider.attachHandlerProps(childAibitat.handlerProps);
  childAibitat.providerInstance = provider;

  return { child: childAibitat, attached };
}

/**
 * Strips <think> reasoning blocks, returning "" for non-text input.
 * @param {any} text - candidate text
 * @returns {string} Cleaned text (may be empty).
 */
function stripThinkText(text) {
  if (typeof text !== "string") return "";
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

/**
 * Runs the bounded child agent and returns its result text.
 * @param {object} props
 * @param {import("../index.js")} props.parentAibitat - parent instance
 * @param {string} props.task - delegated task
 * @param {string} props.context - background context
 * @param {string} props.label - short label
 * @param {Function} props.log - logger
 * @returns {Promise<string>} Result text.
 */
async function runSubAgent({ parentAibitat, task, context, label, log }) {
  const { child: childAibitat, attached } = buildChildAibitat(parentAibitat);
  const provider = childAibitat.providerInstance;

  // Structured submit so results arrive verbatim instead of parsed prose.
  childAibitat.function({
    super: childAibitat,
    name: "submit-task-result",
    description:
      "Submit the completed task result. Call exactly once when done or blocked.",
    parameters: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {
        result: {
          type: "string",
          description: "Concise result: accomplishments, paths, errors.",
        },
      },
      required: ["result"],
      additionalProperties: false,
    },
    handler: function ({ result = "" }) {
      this.super._submittedTaskResult = String(result);
      return "Result submitted. Task complete.";
    },
  });

  const functions = Array.from(childAibitat.functions.values());
  const messages = [
    { role: "system", content: subAgentSystemPrompt(label) },
    {
      role: "user",
      content: `Task:\n${task}${context ? `\n\nContext:\n${context}` : ""}`,
    },
  ];

  (log || console.log)(
    `[delegate-task] Running subagent "${label}" with tools: ${attached.join(", ") || "(none)"}`
  );

  const timeoutMs = subAgentTimeoutMs();
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`Subagent timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });

  try {
    // handleAsyncExecution/handleExecution resolve with the final assistant
    // text (they only record it into chats when driven via reply()).
    const run = (async () => {
      if (provider.supportsAgentStreaming) {
        return await childAibitat.handleAsyncExecution(
          messages,
          functions,
          "@subagent"
        );
      }
      return await childAibitat.handleExecution(
        messages,
        functions,
        "@subagent"
      );
    })();
    const finalText = await Promise.race([run, timeout]);

    const submitted = childAibitat._submittedTaskResult;
    if (submitted && submitted.trim()) return submitted.trim();
    const fallback = stripThinkText(finalText);
    if (fallback) return fallback.slice(0, RESULT_EXCERPT_CHARS);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  // Last resort: scan the child chat history.
  const chats = childAibitat.chats || [];
  for (let i = chats.length - 1; i >= 0; i--) {
    const text =
      chats[i]?.content || chats[i]?.message?.content || chats[i]?.text;
    const cleaned = stripThinkText(text);
    if (cleaned) return cleaned.slice(0, RESULT_EXCERPT_CHARS);
  }
  return "(subagent produced no result text)";
}

module.exports = {
  delegateAgent,
  isNestedSubAgent,
  subAgentTimeoutMs,
  subAgentSystemPrompt,
  attachChildTools,
  buildChildAibitat,
  runSubAgent,
  SUBAGENT_MAX_TOOL_CALLS,
  MAX_TASK_CHARS,
};
