/**
 * Module-level store for the current chat's citation sources, so surfaces
 * outside the message stream (the Agent side panel's Sources section) can
 * show them. Populated by the Sources action button on each assistant
 * message that carries citations — the most recently mounted one wins, which
 * for an in-order chat means the latest message with sources.
 *
 * Session-scoped like the agent activity store: nothing is persisted and the
 * Agent side panel resets it when the active chat changes.
 */

const listeners = new Set();
let sources = [];

function emit() {
  for (const listener of listeners) listener(sources);
}

/**
 * Subscribe to store updates. Returns an unsubscribe function.
 * @param {(sources: Array) => void} listener
 * @returns {() => void}
 */
export function subscribeLatestSources(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Current store snapshot. */
export function getLatestSources() {
  return sources;
}

/**
 * Replaces the tracked sources.
 * @param {Array} next
 */
export function setLatestSources(next) {
  const list = Array.isArray(next) ? next : [];
  if (list === sources) return;
  sources = list;
  emit();
}

/** Clears the store (chat switched or session reset). */
export function resetLatestSources() {
  setLatestSources([]);
}
