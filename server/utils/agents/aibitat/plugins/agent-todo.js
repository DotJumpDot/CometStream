/**
 * Session plan/todo skill. Gives the agent a structured checklist the user
 * can watch in the chat side panel while the agent works - the tool replaces
 * the whole list on every call (same contract as Claude's todo-write), which
 * keeps it idempotent and easy for models to drive.
 */
const MAX_ITEMS = 30;
const MAX_CONTENT_LENGTH = 200;
const VALID_STATUSES = new Set(["pending", "in_progress", "done"]);

/**
 * Normalizes a raw items array into a safe plan list.
 * @param {any} items - raw tool arguments
 * @returns {{items: Array<{content: string, status: string}>, error: string|null}}
 */
function sanitizeTodoItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      items: [],
      error: "Error: At least one todo item must be provided.",
    };
  }
  const cleaned = [];
  for (const raw of items.slice(0, MAX_ITEMS)) {
    const content = typeof raw?.content === "string" ? raw.content.trim() : "";
    if (!content) continue;
    const status = VALID_STATUSES.has(raw?.status) ? raw.status : "pending";
    cleaned.push({
      content: content.slice(0, MAX_CONTENT_LENGTH),
      status,
    });
  }
  if (cleaned.length === 0)
    return { items: [], error: "Error: No valid todo items were provided." };
  return { items: cleaned, error: null };
}

const agentTodo = {
  // Plugin name doubles as the aibitat function name - the agent's function
  // list is keyed by plugin name for single-stage plugins, so the two must
  // match or the tool never reaches the model.
  name: "todo-write",
  startupConfig: {
    params: {},
  },
  plugin: function () {
    return {
      name: "todo-write",
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: "todo-write",
          description:
            "Create or update the session plan shown to the user in the side panel. " +
            "Call this BEFORE starting a multi-step task with the full list of steps, " +
            "and again after completing each step to mark it done and start the next. " +
            "Every call replaces the entire list, so always send the complete set of items.",
          examples: [
            {
              prompt: "Track progress across several steps",
              call: JSON.stringify({
                items: [
                  { content: "Locate the config file", status: "done" },
                  {
                    content: "Update the theme palette",
                    status: "in_progress",
                  },
                  {
                    content: "Verify the build still passes",
                    status: "pending",
                  },
                ],
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              items: {
                type: "array",
                description: "The complete todo list for this task.",
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
            required: ["items"],
            additionalProperties: false,
          },
          handler: async function ({ items = [] }) {
            try {
              this.super.handlerProps.log(`Using the todo-write tool.`);

              const { items: plan, error } = sanitizeTodoItems(items);
              if (error) {
                this.super.introspect(`${this.caller}: ${error}`);
                return error;
              }

              const done = plan.filter((i) => i.status === "done").length;
              this.super.introspect(
                `${this.caller}: Updated plan - ${done}/${plan.length} steps done`
              );
              // Drives the Plan tab in the chat side panel, when one is open.
              this.super.socket?.send?.("todoListCard", { items: plan });

              return `Plan updated: ${plan.length} items (${done} done). The user can follow along in the plan panel.`;
            } catch (e) {
              this.super.handlerProps.log(`todo-write error: ${e.message}`);
              this.super.introspect(`Error: ${e.message}`);
              return `Error updating plan: ${e.message}`;
            }
          },
        });
      },
    };
  },
};

module.exports = {
  agentTodo,
  sanitizeTodoItems,
};
