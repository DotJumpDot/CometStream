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
  sessions: [],
  trajectory: [],
};

function emit() {
  for (const listener of listeners) listener(state);
}

/**
 * Subscribe to store updates. Returns an unsubscribe function.
 * @param {(state: {todo: Array, fileChanges: Array, sessions: Array}) => void} listener
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

/**
 * Display grouping for marathon runs: consecutive sessions with the same
 * kind and command stem collapse into one expandable group row, so 50+
 * near-identical terminal runs read as a short list instead of a wall.
 * Pure (no store access) so it stays unit-testable outside React.
 */
export const SESSION_STEM_CHARS = 48;

/**
 * Normalizes a session into a grouping key: kind plus the command head
 * (cut at the first ellipsis, capped to a fixed width). Heredoc repeat
 * runs share a stem even when their line counts differ.
 * @param {Object} session - session row ({kind, label})
 * @returns {string} Grouping key.
 */
export function sessionStem(session = {}) {
  const label = String(session?.label ?? "");
  const cut = label.indexOf("…");
  const head = (cut >= 0 ? label.slice(0, cut) : label).slice(
    0,
    SESSION_STEM_CHARS
  );
  const kind = session?.kind === "subagent" ? "subagent" : "terminal";
  return `${kind}:${head.trim()}`;
}

/**
 * Folds consecutive same-stem sessions (newest-first order, as stored)
 * into groups. Singletons pass through as one-member groups so callers
 * render one code path.
 * @param {Array} sessions - session rows, newest first
 * @returns {Array<{key: string, kind: string, label: string, members: Array}>} Groups in order.
 */
export function groupSessions(sessions = []) {
  const groups = [];
  for (const session of sessions) {
    if (!session || session.id == null) continue;
    const stem = sessionStem(session);
    const last = groups[groups.length - 1];
    if (last && last.stem === stem) {
      last.members.push(session);
    } else {
      groups.push({
        key: `${stem}::${groups.length}`,
        kind: session.kind === "subagent" ? "subagent" : "terminal",
        stem,
        label: String(session.label ?? ""),
        members: [session],
      });
    }
  }
  return groups;
}

/**
 * Rolls a session group up for its collapsed row: member count, worst
 * status (error beats running beats done), and summed durations.
 * @param {{members: Array}} group - group from groupSessions
 * @returns {{count: number, status: string, ms: number|null}} Rollup.
 */
export function rollupSessionGroup(group) {
  const members = group?.members ?? [];
  let status = "done";
  let ms = 0;
  let timed = false;
  for (const m of members) {
    if (m?.status === "error") status = "error";
    else if (m?.status === "running" && status !== "error") status = "running";
    if (m?.endedAt != null && m?.startedAt != null) {
      const d = m.endedAt - m.startedAt;
      if (Number.isFinite(d) && d >= 0) {
        ms += d;
        timed = true;
      }
    }
  }
  return { count: members.length, status, ms: timed ? ms : null };
}

/**
 * Groups consecutive trajectory records with the same model and the same
 * requested tool set into range groups (#a–#b), so 100 near-identical
 * single-tool iterations read as a handful of rows instead of a wall.
 * Pure (no store access) so it stays unit-testable outside React.
 * @param {Array} records - trajectoryEvent payloads in order
 * @returns {Array<{key: string, stem: string, from: number, to: number, model: string, toolNames: Array<string>, members: Array}>} Groups in order.
 */
export function groupTrajectory(records = []) {
  const groups = [];
  for (const record of records) {
    if (!record || typeof record.seq !== "number") continue;
    const tools = Array.isArray(record.requestedTools)
      ? record.requestedTools
      : [];
    const stem = `${record.model || record.provider || "llm"}::${tools
      .map((t) => t?.name || "?")
      .join(",")}`;
    const last = groups[groups.length - 1];
    if (last && last.stem === stem) {
      last.members.push(record);
      last.to = record.seq;
    } else {
      groups.push({
        key: `${stem}::${groups.length}`,
        stem,
        from: record.seq,
        to: record.seq,
        model: record.model || record.provider || "llm",
        toolNames: tools.map((t) => t?.name || "?"),
        members: [record],
      });
    }
  }
  return groups;
}

/**
 * Rolls a trajectory group up for its collapsed row: member count,
 * total tool calls, and summed token usage.
 * @param {{members: Array}} group - group from groupTrajectory
 * @returns {{count: number, tools: number, prompt: number, completion: number}} Rollup.
 */
export function rollupTrajectoryGroup(group) {
  const members = group?.members ?? [];
  let tools = 0;
  let prompt = 0;
  let completion = 0;
  for (const m of members) {
    tools += Array.isArray(m?.requestedTools) ? m.requestedTools.length : 0;
    const u = m?.usage || {};
    if (Number.isFinite(u.prompt_tokens)) prompt += u.prompt_tokens;
    if (Number.isFinite(u.completion_tokens)) completion += u.completion_tokens;
  }
  return { count: members.length, tools, prompt, completion };
}

/** Trajectory rows (or row groups) shown before the "show all" expander. */
export const TRAJECTORY_WINDOW = 25;

/** Display budget for a collapsed session row label. */
export const COMMAND_LABEL_CHARS = 140;

/**
 * Client-side mirror of the server's `categorizeCommand`
 * (`server/utils/agents/aibitat/plugins/terminal.js`) for the session row
 * chip. Historical runs replay their persisted trace, where rows stored
 * under the old 5-class table (or chipless) keep `category: null` - the
 * fallback derives the chip from the label so old threads read like new
 * ones. New sessions carry the server value; this only fills the gaps.
 * Keep the verb table in sync with the server copy.
 * Pure so it stays unit-testable outside React.
 * @param {string} label - session label (often `$ cd <dir> && <cmd>`)
 * @returns {string|null} Category or null for anything unrecognized.
 */
export function categorizeLabel(label = "") {
  const cmd = String(label ?? "")
    .trim()
    .replace(/^\$\s+/, "");
  if (!cmd) return null;
  if (/<<-?\s*['"]?[A-Za-z_]/.test(cmd)) return "Write";
  if (/\bsed\b[^\n]*\s-i\b/.test(cmd)) return "Write";
  if (
    /(^|[|;&\s])\s*(grep|rg|find|findstr|locate|where|which|Select-String)\b/i.test(
      cmd
    )
  )
    return "Search";
  if (
    /\b((npm|yarn|pnpm|bun)\s+(install|i|add|dlx)|pip3?\s+install)\b/i.test(cmd)
  )
    return "Install";
  if (/(^|[|;&\s])\s*(curl|wget|Invoke-WebRequest|\birm\b)\b/i.test(cmd))
    return "Fetch";
  if (/(^|[|;&\s])\s*(kill|pkill|killall|taskkill|Stop-Process)\b/i.test(cmd))
    return "Kill";
  if (/(^|[|;&\s])\s*(sleep|timeout|Start-Sleep|\bwait\b)\b/i.test(cmd))
    return "Sleep";
  if (/(^|[|;&\s])\s*(git|gh)\b/i.test(cmd)) return "Git";
  if (
    /(^|[|;&\s])\s*(pytest|jest|vitest|phpunit|rspec|ctest|go\s+test|run_tests)\b/i.test(
      cmd
    )
  )
    return "Test";
  if (
    /(^|[|;&\s])\s*(cp|mv|rm|mkdir|rmdir|touch|chmod|chown|ln|del|erase|copy|xcopy|move|robocopy|ren|rename)\b/i.test(
      cmd
    )
  )
    return "Files";
  if (/(?<![\d&])>\s*(?!\/dev\/null\b|>)[\w.~/\\-][^|;&\n]*/.test(cmd))
    return "Write";
  if (
    /(^|[|;&\s])\s*(cat|head|tail|less|more|Get-Content|\bbat\b|\btype\b)\b/i.test(
      cmd
    )
  )
    return "Cat";
  if (/(^|[|;&\s])\s*(ls|dir|tree|vdir|exa|eza|\bll\b|\bla\b)\b/i.test(cmd))
    return "List";
  if (/(^|[|;&\s])\s*pwd\b/i.test(cmd)) return "Pwd";
  if (
    /(^|[|;&\s])\s*(bash|zsh|fish|pwsh|powershell|\bsh\b|\bcmd\b)\b/i.test(cmd)
  )
    return "Bash";
  if (
    /(^|[|;&\s])\s*(node|python3?|npm\s+(run|start)|yarn\s+(run|start|dev)|go\s+run|dotnet\s+run|uvicorn|gunicorn)\b/i.test(
      cmd
    )
  )
    return "Run";
  return null;
}

/**
 * Shortens a terminal command for collapsed row display. Working-directory
 * preambles (`cd ... &&`) and narration echoes (`echo "..." &&`) are
 * stripped - every jailed command starts with them, so they eat the whole
 * row without saying anything - and the remainder is middle-truncated so
 * both the binary and the tail arguments stay visible. The full command
 * always remains in the row tooltip and the expanded output.
 * Pure so it stays unit-testable outside React.
 * @param {string} label - raw session label (often `$ cd <dir> && <cmd>`)
 * @param {number} [budget] - max chars before middle-truncation (main-chat
 * rows pass a smaller budget so the label reads cut at ~60% of the row)
 * @returns {string} Display label.
 */
export function shortCommand(label = "", budget = COMMAND_LABEL_CHARS) {
  let text = String(label ?? "")
    .trim()
    .replace(/^\$\s+/, "");
  const parts = text
    .split(/\s+&&\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  // Drop leading `cd` hops (cwd noise - the project folder is implied).
  while (parts.length > 1 && /^cd(\s|$)/.test(parts[0])) parts.shift();
  // Drop a leading static echo (narration preamble like `echo "--- Step:"`).
  // Keeps echoes that interpolate (`$`, backticks) since those ARE the work.
  while (parts.length > 1 && /^echo\s+("[^"$`]*"|'[^'$`]*')\s*$/.test(parts[0]))
    parts.shift();
  text = parts.join(" && ");
  const limit =
    Number.isFinite(budget) && budget > 20 ? budget : COMMAND_LABEL_CHARS;
  if (text.length <= limit) return text;
  const tail = limit >= COMMAND_LABEL_CHARS ? 40 : 30;
  const head = limit - tail - 3;
  return `${text.slice(0, head)} … ${text.slice(-tail)}`;
}

/**
 * Windows trajectory records for display: the most recent window unless
 * the user expanded to all. Pure so it stays unit-testable outside React.
 * @param {Array} records - trajectoryEvent payloads in order
 * @param {boolean} showAll - expander state
 * @returns {Array} Visible records.
 */
export function windowTrajectory(records = [], showAll = false) {
  if (!Array.isArray(records)) return [];
  if (showAll || records.length <= TRAJECTORY_WINDOW) return records;
  return records.slice(-TRAJECTORY_WINDOW);
}

/** Clears the store (chat switched or session reset). */
export function resetAgentActivity() {
  state = { todo: [], fileChanges: [], sessions: [], trajectory: [] };
  emit();
}

/**
 * Appends one model trajectory record (per-LLM-iteration debug view).
 * Newest last (chronological), capped so a marathon run cannot grow the
 * panel without bound. Session-scoped like everything else here.
 * @param {Object} record - trajectoryEvent payload from the server
 */
export function addTrajectoryRecord(record = {}) {
  if (!record || typeof record.seq !== "number") return;
  state = {
    ...state,
    trajectory: [...state.trajectory, record].slice(-100),
  };
  emit();
}

/**
 * Inserts or replaces a terminal/subagent session row by id. Newest first,
 * capped so a marathon run cannot grow the panel without bound.
 * @param {{id: number|string, kind?: string, label?: string, status?: string, detail?: string, startedAt?: number, endedAt?: number|null}} session
 */
export function upsertAgentSession(session = {}) {
  if (session?.id == null) return;
  const entry = {
    id: session.id,
    kind: session.kind === "subagent" ? "subagent" : "terminal",
    label: String(session.label ?? "").slice(0, 300) || "(untitled)",
    status: ["running", "done", "error"].includes(session.status)
      ? session.status
      : "running",
    detail: String(session.detail ?? "").slice(-8000),
    startedAt: Number(session.startedAt) || Date.now(),
    endedAt: session.endedAt ?? null,
  };
  state = {
    ...state,
    sessions: [entry, ...state.sessions.filter((s) => s.id !== entry.id)].slice(
      0,
      50
    ),
  };
  emit();
}
