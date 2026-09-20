/**
 * Module-level store for the chat's tool permission mode (the pill next to
 * the mode selector in the chat bar):
 *   "ask"           - every gated tool call shows an approval card (default)
 *   "auto"          - tool calls auto-approve for the current agent session
 *   "auto-remember" - auto-approve and persist each tool to the whitelist
 *
 * Persisted in localStorage so the choice survives reloads; the ChatContainer
 * pushes the current mode to the agent socket on connect and on change, so
 * it can be flipped mid-session.
 */

const STORAGE_KEY = "agent-permission-mode";
const MODES = ["ask", "auto", "auto-remember"];

const listeners = new Set();
let mode = readStoredMode();

function readStoredMode() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return MODES.includes(stored) ? stored : "ask";
  } catch {
    return "ask";
  }
}

function persist(next) {
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {}
}

function emit() {
  for (const listener of listeners) listener(mode);
}

/**
 * Subscribe to mode changes. Returns an unsubscribe function.
 * @param {(mode: string) => void} listener
 * @returns {() => void}
 */
export function subscribePermissionMode(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Current mode snapshot. */
export function getPermissionMode() {
  return mode;
}

/**
 * @param {string} next - one of "ask" | "auto" | "auto-remember"
 */
export function setPermissionMode(next) {
  if (!MODES.includes(next) || next === mode) return;
  mode = next;
  persist(next);
  emit();
}
