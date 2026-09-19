/**
 * Module-level store for live agent session artifacts (plan/todo list, file
 * changes) that surface in the chat side panel. The websocket/stream handlers
 * push into it as events arrive; the AgentSidePanel subscribes and renders.
 *
 * State is session-scoped like the chat activity chain itself: nothing here is
 * persisted, and the panel resets it when the active chat changes.
 */

const listeners = new Set();
let state = {
  todo: [],
  fileChanges: [],
};

function emit() {
  for (const listener of listeners) listener(state);
}

/**
 * Subscribe to store updates. Returns an unsubscribe function.
 * @param {(state: {todo: Array, fileChanges: Array}) => void} listener
 * @returns {() => void}
 */
export function subscribeAgentActivity(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Current store snapshot. */
export function getAgentActivity() {
  return state;
}

/**
 * Records a fileChangeCard payload. Reads are chat-stream-only rows and are
 * ignored here; for writes, the latest event per path replaces the previous
 * one while +/- counts accumulate, so the Changes tab reads like a working
 * tree summary rather than an event log.
 * @param {{action: string, path: string, added?: number, removed?: number, diff?: string, truncated?: boolean}} change
 */
export function addAgentFileChange(change) {
  if (!change?.path || change.action === "read") return;
  const prev = state.fileChanges.find((c) => c.path === change.path);
  const next = {
    path: change.path,
    action: change.action === "create" ? "create" : "edit",
    added: (prev?.added ?? 0) + (change.added ?? 0),
    removed: (prev?.removed ?? 0) + (change.removed ?? 0),
    diff: change.diff || "",
    diffTruncated: !!change.truncated,
    at: Date.now(),
  };
  state = {
    ...state,
    fileChanges: [
      ...state.fileChanges.filter((c) => c.path !== change.path),
      next,
    ],
  };
  emit();
}

/**
 * Replaces the plan list (the todo-write tool sends the complete list).
 * @param {Array<{content: string, status: string}>} items
 */
export function setAgentTodo(items) {
  state = {
    ...state,
    todo: Array.isArray(items)
      ? items
          .filter((i) => typeof i?.content === "string" && !!i.content.trim())
          .map((i) => ({
            content: i.content.slice(0, 300),
            status: ["pending", "in_progress", "done"].includes(i.status)
              ? i.status
              : "pending",
          }))
      : [],
  };
  emit();
}

/** Clears the store (chat switched or session reset). */
export function resetAgentActivity() {
  state = { todo: [], fileChanges: [] };
  emit();
}
