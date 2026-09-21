/**
 * Live session registry for agent-spawned work: terminal executions and
 * subagent (delegate-task) runs. The chat activity chain shows one-line
 * summaries; this registry keeps the full picture (status, timing, output
 * excerpts) so the AgentSidePanel Sessions tab can list running/finished
 * sessions and expand any of them to full detail.
 *
 * Session-scoped like the chat itself: in-memory only (nothing persisted),
 * capped so a long run cannot grow it without bound. The frontend mirrors
 * entries via `sessionCard` socket events; this module is the server-side
 * source of truth for ids and status transitions.
 */

const MAX_SESSIONS = 100;
const MAX_DETAIL_CHARS = 8_000;

let nextId = 1;
const sessions = new Map();

/**
 * Status values for a session entry.
 * @typedef {"running"|"done"|"error"} SessionStatus
 */

/**
 * Starts a session entry.
 * @param {object} props
 * @param {"terminal"|"subagent"} props.kind - session kind
 * @param {string} props.label - one-line human label (already summarized)
 * @param {string} [props.detail] - fuller text shown on expand
 * @returns {{id: number, kind: string, label: string, status: SessionStatus, detail: string, startedAt: number, endedAt: number|null}} The new entry.
 */
function startSession({ kind, label, detail = "" }) {
  const entry = {
    id: nextId++,
    kind,
    label: String(label ?? "").slice(0, 300) || "(untitled)",
    status: "running",
    detail: capDetail(detail),
    startedAt: Date.now(),
    endedAt: null,
  };
  sessions.set(entry.id, entry);
  // Oldest-first eviction keeps memory bounded on marathon runs.
  while (sessions.size > MAX_SESSIONS) {
    const oldest = sessions.keys().next().value;
    sessions.delete(oldest);
  }
  return { ...entry };
}

/**
 * Patches a session entry (status/detail/end). Unknown ids are ignored so
 * a late finish after eviction cannot throw.
 * @param {number} id - session id from startSession
 * @param {object} patch - fields to merge (status, label, detail, endedAt)
 * @returns {object|null} Updated copy, or null for unknown ids.
 */
function updateSession(id, patch = {}) {
  const entry = sessions.get(id);
  if (!entry) return null;
  if (patch.status === "done" || patch.status === "error") {
    entry.status = patch.status;
    entry.endedAt = patch.endedAt ?? Date.now();
  }
  if (typeof patch.label === "string") entry.label = patch.label.slice(0, 300);
  if (patch.appendDetail)
    entry.detail = capDetail(entry.detail + patch.appendDetail);
  return { ...entry };
}

/**
 * Marks a session finished with an optional detail tail.
 * @param {number} id - session id
 * @param {SessionStatus} [status] - "done" or "error"
 * @param {string} [detail] - text appended to the detail log
 * @returns {object|null} Updated copy, or null for unknown ids.
 */
function finishSession(id, status = "done", detail = "") {
  const entry = sessions.get(id);
  if (!entry) return null;
  entry.status = status === "error" ? "error" : "done";
  entry.endedAt = Date.now();
  if (detail) entry.detail = capDetail(entry.detail + detail);
  return { ...entry };
}

/**
 * Lists sessions newest-first for panel rendering.
 * @returns {Array} Session entry copies.
 */
function listSessions() {
  return Array.from(sessions.values())
    .sort((a, b) => b.id - a.id)
    .map((entry) => ({ ...entry }));
}

/** Clears all sessions (tests + chat switches that reset panel state). */
function clearSessions() {
  sessions.clear();
}

/**
 * Caps detail text, keeping head + tail like terminal output caps.
 * @param {string} text - raw detail text
 * @returns {string} capped text
 */
function capDetail(text) {
  const str = String(text ?? "");
  if (str.length <= MAX_DETAIL_CHARS) return str;
  const keep = Math.floor((MAX_DETAIL_CHARS - 60) / 2);
  return (
    str.slice(0, keep) +
    `\n…[${str.length - MAX_DETAIL_CHARS} chars truncated]…\n` +
    str.slice(str.length - keep)
  );
}

module.exports = {
  startSession,
  updateSession,
  finishSession,
  listSessions,
  clearSessions,
  capDetail,
  MAX_SESSIONS,
  MAX_DETAIL_CHARS,
};
