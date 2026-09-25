/**
 * Plan mode (ZCode-style): an approval-gated design phase before building.
 * `enter-plan-mode` locks the run to read-only exploration tools (the
 * execution loops in aibitat/index.js refuse mutating calls while the
 * per-run `_planMode` flag is set); `exit-plan-mode` submits the finished
 * design doc through a forced user approval, and the approval hands off to
 * todo-write for execution. Separate from the todo checklist the way ZCode
 * separates them: the plan is the WHAT decided before acting (human-gated),
 * the todo list is the WHERE-ARE-WE tracked while acting (agent-owned).
 */
const { isReadOnlyCommand } = require("./terminal.js");
const { sanitizeTodoItems } = require("./agent-todo.js");

// Single markdown design doc cap, matching ZCode's limit.
const PLAN_MAX_CHARS = 20_000;
// Thin submissions (a restated request, not a design) bounce with a repair
// message naming the required sections - small models otherwise submit one
// sentence and burn an approval round-trip on it.
const PLAN_MIN_CHARS = 200;

// In-app setting for plan auto-approval (default YES - unset means approved).
// PLAN_MODE_AUTO_APPROVE=0/false in ENV forces prompting regardless.
const SETTING_AUTO_APPROVE_KEY = "plan_mode_auto_approve";

/**
 * Whether a submitted plan auto-approves without a user prompt. Default is
 * YES (setting unset or unreadable) so long runs don't park waiting for a
 * click; turn it off in Agent Skill Settings (or PLAN_MODE_AUTO_APPROVE=0)
 * to gate every design.
 * @returns {Promise<boolean>}
 */
async function isPlanAutoApproved() {
  const env = String(process.env.PLAN_MODE_AUTO_APPROVE || "").toLowerCase();
  if (env === "0" || env === "false" || env === "no") return false;
  try {
    const { SystemSettings } = require("../../../../models/systemSettings");
    const value = await SystemSettings.getValueOrFallback(
      { label: SETTING_AUTO_APPROVE_KEY },
      "true"
    );
    return String(value).toLowerCase() !== "false" && value !== "0";
  } catch {
    return false;
  }
}

/**
 * Tools that may execute while plan mode is active. Everything else -
 * file writes, terminal mutations, subagent delegation, external side
 * effects (mail/calendar/SQL), image/chart generation, and all MCP/skill
 * imports (unknown side effects) - is refused by the execution gate.
 * terminal-agent is NOT on this list: it is allowed conditionally (read-only
 * commands only, same classifier as the approval skip) via
 * isToolAllowedInPlanMode below.
 */
const PLAN_READ_ONLY_TOOLS = new Set([
  "todo-write",
  "request-user-input",
  "filesystem-list-directory",
  "filesystem-read-text-file",
  "filesystem-read-multiple-files",
  "filesystem-search-files",
  "filesystem-get-file-info",
  "web-browsing",
  "web-scraping",
  "document-summarizer",
  "chat-history",
  "task-output",
  "enter-plan-mode",
  "exit-plan-mode",
]);

/**
 * Whether the run is currently inside plan mode.
 * @param {object} aibitat - aibitat instance (flag is per-run)
 * @returns {boolean}
 */
function isPlanMode(aibitat) {
  return !!aibitat?._planMode;
}

/**
 * Gate predicate used by both execution loops: read-only exploration runs,
 * everything mutating is refused with a message (never executed).
 * @param {string} name - requested function name
 * @param {object} args - call arguments (used for the terminal special case)
 * @returns {boolean} true when the call may execute in plan mode
 */
function isToolAllowedInPlanMode(name, args = {}) {
  // Terminal rides the read-only classifier: `ls`/`cat`/`git status` explore,
  // everything else mutates. The denylist + jail still apply at execution.
  if (name === "terminal-agent") {
    if (!args || typeof args.command !== "string") return false;
    try {
      return isReadOnlyCommand(args.command);
    } catch {
      return false;
    }
  }
  return PLAN_READ_ONLY_TOOLS.has(name);
}

/**
 * Per-tool pivot hint appended to the plan-mode refusal so the model reaches
 * for the read-only alternative instead of retrying the blocked call. A bare
 * "blocked" message was measured to produce refuse-retry spam (dozens of
 * terminal-task-start re-calls in one turn) - the hint names the replacement.
 * @param {string} name - refused function name
 * @returns {string} concrete alternative, or "" when the generic message suffices
 */
function planModeDenialHint(name) {
  if (name === "terminal-task-start")
    return " Start nothing in the background during plan mode - run the read-only command with terminal-agent in the foreground instead, or explore with filesystem reads.";
  if (name === "terminal-agent")
    return " This command mutates - use a read-only command (ls, cat, git status) or filesystem-read/search tools instead.";
  if (
    name === "filesystem-write-text-file" ||
    name === "filesystem-edit-file" ||
    name === "filesystem-copy-file" ||
    name === "filesystem-move-file" ||
    name === "filesystem-create-directory"
  )
    return " Reads only in plan mode - use filesystem-read-text-file, filesystem-list-directory, or filesystem-search-files instead.";
  if (name === "delegate-task")
    return " No subagents in plan mode - explore directly with read tools instead.";
  if (name === "task-stop")
    return " Nothing should be running from plan mode - poll status with task-output if needed.";
  return "";
}

/**
 * Sanitizes a raw plan submission into a safe design doc.
 * @param {any} plan - raw tool argument
 * @returns {{plan: string, error: string|null}}
 */
function sanitizePlan(plan) {
  if (typeof plan !== "string" || !plan.trim()) {
    return { plan: "", error: "Error: A non-empty plan is required." };
  }
  const doc = plan.trim();
  if (doc.length < PLAN_MIN_CHARS) {
    return {
      plan: "",
      error:
        `Error: Plan too thin (${doc.length} chars) - write a real design doc ` +
        `with the required sections (Goal, Exploration findings, Changes, ` +
        `Approach decisions, Risks, Test steps), minimum ${PLAN_MIN_CHARS} characters.`,
    };
  }
  return { plan: doc.slice(0, PLAN_MAX_CHARS), error: null };
}

const EnterPlanMode = {
  name: "enter-plan-mode",
  plugin: function () {
    return {
      name: "enter-plan-mode",
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description:
            "Enter read-only planning mode BEFORE implementing a non-trivial task (new feature, multi-file change, architectural decision, unclear requirements). " +
            "While in plan mode only read-only exploration tools run - file writes, terminal mutations, subagents, and external actions are blocked - so explore first (read files, search, ask clarifying questions), then submit the design with exit-plan-mode for user approval. " +
            "One plan at a time: re-entering mid-plan is refused, so finish the current design first. " +
            "Do NOT use for trivial work (typos, single-function edits, explicit step-by-step instructions).",
          examples: [
            {
              prompt: "Plan a multi-file feature before coding it",
              call: JSON.stringify({}),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          handler: async function () {
            try {
              this.super.handlerProps.log(`Entering plan mode.`);
              // No stacked plans: entering mid-plan neither resets the
              // design nor opens a second cycle - revise and resubmit the
              // current one with exit-plan-mode. A fresh cycle starts by
              // entering AFTER an approved exit (flag is clear then).
              if (this.super._planMode) {
                return "Error: Already in plan mode - there is no second plan. Keep exploring with read tools, then submit or revise the current design with exit-plan-mode.";
              }
              this.super._planMode = true;
              this.super.introspect(
                `${this.caller}: Entered plan mode - read-only exploration only. File writes, terminal mutations, subagents, and external actions are blocked until an exit-plan-mode plan is approved.`
              );
              return "Plan mode active: explore with read tools (filesystem reads, search, web, read-only terminal), clarify with request-user-input, track with todo-write, then submit the design via exit-plan-mode.";
            } catch (e) {
              this.super.handlerProps.log(
                `enter-plan-mode error: ${e.message}`
              );
              return `Error entering plan mode: ${e.message}`;
            }
          },
        });
      },
    };
  },
};

const ExitPlanMode = {
  name: "exit-plan-mode",
  plugin: function () {
    return {
      name: "exit-plan-mode",
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description:
            "Submit the finished design and request user approval to start building. " +
            "Takes the complete plan (what to build, file-by-file changes, approach decisions, open questions resolved) - the user reads it in the approval card. " +
            "Write a REAL design doc with these sections (a one-paragraph restatement of the request will be sent back - minimum 200 characters): " +
            "## Goal (one paragraph); ## Exploration findings (what you read and checked); " +
            "## Changes (file-by-file: path plus what changes in each); ## Approach decisions (choices made and why); " +
            "## Risks / open questions; ## Test steps (how you will verify). " +
            "Approval exits plan mode; rejection or timeout keeps plan mode active so you can revise and resubmit. " +
            "Do NOT ask 'is my plan ready?' with any other tool - this call IS the approval request. " +
            "Include the execution checklist in `todos` (same shape as todo-write) whenever the plan implies 2+ steps - approval seeds the side-panel Plan tab directly. " +
            "After approval, keep the seeded list updated with todo-write (or start with a todo-write call when you sent no todos).",
          examples: [
            {
              prompt: "Submit the explored design for approval",
              call: JSON.stringify({
                plan: "## Goal\nAdd login rate-limiting.\n## Changes\n- backend/app/middleware/rate_limit.py (new): sliding window ...",
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              plan: {
                type: "string",
                description:
                  "The complete implementation plan as markdown (max 20000 chars).",
              },
              todos: {
                type: "array",
                description:
                  "The execution checklist derived from the plan - same items you would send to todo-write (each with content + status). On approval the list seeds the side-panel Plan tab directly, so include it whenever the plan implies 2+ steps.",
                items: {
                  type: "object",
                  properties: {
                    content: {
                      type: "string",
                      description: "Short imperative description of the step.",
                    },
                    status: {
                      type: "string",
                      enum: ["pending", "in_progress", "done"],
                      description: "Current state of the step.",
                    },
                  },
                  required: ["content", "status"],
                  additionalProperties: false,
                },
              },
            },
            required: ["plan"],
            additionalProperties: false,
          },
          handler: async function ({ plan = "", todos = null }) {
            try {
              this.super.handlerProps.log(`Submitting plan for approval.`);
              if (!this.super._planMode) {
                return "Error: You are not in plan mode. Call enter-plan-mode first, explore, then submit the design with this tool.";
              }
              const { plan: doc, error } = sanitizePlan(plan);
              // Every submission settles visibly: failures record a rejected
              // card carrying the attempted doc, so the streaming
              // planWriteProgress row never freezes mid-chat (measured live:
              // two orphan "Receiving" rows after a failed proposal + stop).
              const sendCard = (status, text) => {
                if (typeof text === "string" && text.trim())
                  this.super.socket?.send?.("planCard", {
                    plan: text.trim().slice(0, PLAN_MAX_CHARS),
                    status,
                  });
              };
              if (error) {
                this.super.introspect(`${this.caller}: ${error}`);
                sendCard("rejected", plan);
                return error;
              }
              // Optional execution checklist riding the proposal: validated
              // with the same rules as todo-write, seeded on approval.
              // Must be the UPCOMING build steps (all pending): in plan mode
              // nothing builds, so done/in_progress items are exploration
              // bookkeeping miscopied - bounce them with a repair message
              // instead of seeding a finished list (measured live: a seeded
              // 5/5 "plan" that immediately un-did itself to 4/5).
              let seedTodos = null;
              if (todos !== null && todos !== undefined) {
                const { items, error: todoError } = sanitizeTodoItems(todos);
                if (todoError) {
                  this.super.introspect(`${this.caller}: ${todoError}`);
                  sendCard("rejected", doc);
                  return `${todoError} Fix the todos and resubmit - still in plan mode.`;
                }
                const unfinished = items.filter((i) => i.status !== "pending");
                if (unfinished.length > 0) {
                  const msg =
                    "Error: plan todos must list the upcoming build steps (all pending) - done/in_progress items are exploration progress, not the plan. Rewrite the list as the remaining work and resubmit.";
                  this.super.introspect(`${this.caller}: ${msg}`);
                  sendCard("rejected", doc);
                  return `${msg} Still in plan mode.`;
                }
                seedTodos = items;
              }
              // The proposal persists in the run trace (planCard) so the doc
              // survives reload; the approval card is the live surface.
              this.super.socket?.send?.("planCard", {
                plan: doc,
                status: "proposed",
              });
              if (!this.super.requestToolApproval) {
                sendCard("rejected", doc);
                return "Error: Plan approval is not available in this context. Stay in plan mode and keep exploring.";
              }
              let approved = false;
              let approvalNote = "";
              if (await isPlanAutoApproved()) {
                approved = true;
                approvalNote =
                  "auto-approved by the plan_mode_auto_approve setting";
              } else {
                // Forced prompt: a plan gate that auto-passes on auto-approve
                // or whitelist would approve unseen designs. Timeout/deny keeps
                // plan mode active - revise and resubmit.
                const approval = await this.super.requestToolApproval({
                  skillName: "exit-plan-mode",
                  payload: { plan: doc },
                  description:
                    "Review this implementation plan. Approve to start building.",
                  forcePrompt: true,
                });
                approved = approval.approved;
                approvalNote = approval.message;
              }
              if (!approved) {
                this.super.socket?.send?.("planCard", {
                  plan: doc,
                  status: "rejected",
                });
                this.super.introspect(
                  `${this.caller}: Plan not approved (${approvalNote}). Still in plan mode - revise the design or ask the user what to change, then resubmit.`
                );
                return `Plan not approved: ${approvalNote} You are still in plan mode - revise and resubmit with exit-plan-mode.`;
              }
              this.super._planMode = false;
              this.super.socket?.send?.("planCard", {
                plan: doc,
                status: "approved",
              });
              this.super.introspect(
                `${this.caller}: Plan approved (${approvalNote}) - plan mode exited.`
              );
              let seeded = "";
              if (seedTodos && seedTodos.length > 0) {
                const done = seedTodos.filter(
                  (i) => i.status === "done"
                ).length;
                this.super.socket?.send?.("todoListCard", { items: seedTodos });
                this.super.introspect(
                  `${this.caller}: Seeded plan - ${done}/${seedTodos.length} steps done`
                );
                seeded =
                  ` Your plan's todo list is already seeded in the side panel ` +
                  `(${seedTodos.length} items, ${done} done) - keep it updated with todo-write after each step.`;
              }
              return (
                `User has approved your plan (${approvalNote}). You can now start implementing. ` +
                (seedTodos
                  ? seeded
                  : " Start with updating your todo list (todo-write) to match the approved plan.") +
                "\n\n## Approved Plan:\n" +
                doc
              );
            } catch (e) {
              this.super.handlerProps.log(`exit-plan-mode error: ${e.message}`);
              return `Error submitting plan: ${e.message}`;
            }
          },
        });
      },
    };
  },
};

const planMode = {
  name: "plan-mode-agent",
  startupConfig: {
    params: {},
  },
  plugin: [EnterPlanMode, ExitPlanMode],
};

module.exports = {
  planMode,
  EnterPlanMode,
  ExitPlanMode,
  isPlanMode,
  isPlanAutoApproved,
  isToolAllowedInPlanMode,
  planModeDenialHint,
  sanitizePlan,
  PLAN_READ_ONLY_TOOLS,
  PLAN_MAX_CHARS,
  PLAN_MIN_CHARS,
  SETTING_AUTO_APPROVE_KEY,
};
