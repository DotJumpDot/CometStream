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
  // Latest cumulative tool-I/O snapshot from the server (usageMetrics
  // events). Null until the first run - the ContextRing live section hides
  // until trajectory records exist anyway.
  toolIo: null,
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
 * Display grouping for marathon runs: sessions with the same kind and
 * command verb collapse into one expandable group row, so 50
 * near-identical terminal runs read as a short list instead of a wall.
 * Grouping is by verb (not adjacency and not the full command): `cat a`
 * and `cat b` fold together even with other commands between them, because
 * the row answers "what have the cat calls done", with each member one
 * click away. Pure (no store access) so it stays unit-testable outside
 * React.
 */

/**
 * Extracts the grouping verb from a session label: the first command word
 * after `$`, `cd`-hop, and narration-echo stripping (same preamble rules
 * as shortCommand). `cat > f <<EOF` and `cat f` both group under `cat`.
 * @param {string} label - session label (often `$ cd <dir> && <cmd>`)
 * @returns {string} Lowercase verb, or "(else)" when none is readable.
 */
export function sessionVerb(label = "") {
  let text = String(label ?? "")
    .trim()
    .replace(/^\$\s+/, "");
  const parts = text
    .split(/\s+&&\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  while (parts.length > 1 && /^cd(\s|$)/.test(parts[0])) parts.shift();
  while (parts.length > 1 && /^echo\s+("[^"$`]*"|'[^'$`]*')\s*$/.test(parts[0]))
    parts.shift();
  text = parts.length ? parts[0] : "";
  const first = text.split(/\s+/).filter(Boolean)[0] ?? "";
  const base =
    first
      .replace(/^["']|["']$/g, "")
      .split(/[\\/]/)
      .filter(Boolean)
      .pop() ?? "";
  const verb = base.toLowerCase();
  return verb || "(else)";
}

/**
 * Folds same-verb sessions (in input order, newest first as stored) into
 * groups keyed by kind + verb. Singletons pass through as one-member
 * groups so callers render one code path.
 * @param {Array} sessions - session rows, newest first
 * @returns {Array<{key: string, kind: string, verb: string, label: string, members: Array}>} Groups in first-seen order.
 */
export function groupSessions(sessions = []) {
  const groups = [];
  const byKey = new Map();
  for (const session of sessions) {
    if (!session || session.id == null) continue;
    const kind = session.kind === "subagent" ? "subagent" : "terminal";
    const verb = sessionVerb(session.label);
    const key = `${kind}:${verb}`;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key: `${key}::${groups.length}`,
        kind,
        verb,
        label: String(session.label ?? ""),
        members: [session],
      };
      byKey.set(key, group);
      groups.push(group);
    } else {
      group.members.push(session);
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
 * Groups trajectory records with the same model and the same requested
 * tool set, so repeated single-tool iterations read as a handful of rows
 * instead of a wall. Grouping is by tool set, not adjacency: #32 and #38
 * calling the same tool fold together even with other work between them.
 * Groups keep first-seen order with chronological members; the header
 * range (#from–#to) may therefore span gaps. Pure (no store access) so it
 * stays unit-testable outside React.
 * @param {Array} records - trajectoryEvent payloads in order
 * @returns {Array<{key: string, stem: string, from: number, to: number, model: string, toolNames: Array<string>, members: Array}>} Groups in first-seen order.
 */
export function groupTrajectory(records = []) {
  const groups = [];
  const byStem = new Map();
  for (const record of records) {
    if (!record || typeof record.seq !== "number") continue;
    const tools = Array.isArray(record.requestedTools)
      ? record.requestedTools
      : [];
    const stem = `${record.model || record.provider || "llm"}::${tools
      .map((t) => t?.name || "?")
      .join(",")}`;
    let group = byStem.get(stem);
    if (!group) {
      group = {
        key: `${stem}::${groups.length}`,
        stem,
        from: record.seq,
        to: record.seq,
        model: record.model || record.provider || "llm",
        toolNames: tools.map((t) => t?.name || "?"),
        members: [record],
      };
      byStem.set(stem, group);
      groups.push(group);
    } else {
      group.members.push(record);
      group.to = record.seq;
    }
  }
  return groups;
}

/**
 * Rolls a trajectory group up for its collapsed row: member count, total
 * tool calls, and the tokens consumed inside the group. Members contribute
 * their own per-round usage (never the cumulative run totals, which would
 * multiply-count across members and swallow other groups' work in gaps).
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
    const r = m?.round || {};
    const rp = Number(r.prompt_tokens);
    const rc = Number(r.completion_tokens);
    if (Number.isFinite(rp)) prompt += Math.max(0, rp);
    if (Number.isFinite(rc)) completion += Math.max(0, rc);
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
  state = {
    todo: [],
    fileChanges: [],
    sessions: [],
    trajectory: [],
    toolIo: null,
  };
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
 * Stores the latest cumulative tool-I/O snapshot from a usageMetrics
 * event. This closes the trajectory lag: per-iteration records snapshot
 * the accumulator before the turn's tools execute, so the final turn's
 * bytes only arrive with the run-end usageMetrics event.
 * @param {Object} snapshot - {calls, tokensEst, byKind} from the server
 */
export function setRunToolIo(snapshot = null) {
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    !Number.isFinite(snapshot.calls)
  )
    return;
  state = { ...state, toolIo: snapshot };
  emit();
}

/**
 * Display kinds for the live usage split. Server `files-write` and
 * `files-read` merge into one Files row; unknown kinds fold into Built-in
 * so a future server kind cannot break the card.
 */
const RUNSTAT_KINDS = ["mcp", "terminal", "subagent", "files", "builtin"];

function runstatKind(raw) {
  if (raw === "mcp" || raw === "terminal" || raw === "subagent") return raw;
  if (raw === "files-write" || raw === "files-read" || raw === "files")
    return "files";
  return "builtin";
}

/**
 * Derives the live-run summary for the ContextRing card from accumulated
 * trajectory records plus the latest tool-I/O snapshot. Pure so it stays
 * unit-testable outside React.
 *
 * Token notes (shown in the card footer): model I/O (prompt/completion)
 * are REAL provider counts; cache hits come from the server when it
 * reports them (llama.cpp `cached_tokens`, OpenAI `prompt_tokens_details`);
 * tool payloads are chars/4 estimates of what each tool moved, and overlap
 * the model counts (results re-enter the context) - they split "where did
 * it go", they do not add to the total.
 * @param {Array} records - trajectoryEvent payloads in order
 * @param {Object|null} toolIo - cumulative {calls, tokensEst, byKind}
 * @returns {{rounds: number, prompt: number, completion: number, cached: number, cacheHit: number, tps: {last: number, avg: number, max: number, server: boolean}, toolCalls: number, toolTokensEst: number, byKind: Array<{kind: string, calls: number, tokensEst: number}>}}
 */
export function runStatsFromTrajectory(records = [], toolIo = null) {
  const rounds = (Array.isArray(records) ? records : []).filter(
    (r) => r && typeof r.seq === "number"
  );
  // Cumulative provider counts: the LAST record holds the run totals (every
  // record snapshots the accumulator, so summing would multiply-count).
  const lastUsage = rounds.length ? rounds[rounds.length - 1].usage || {} : {};
  // Per-round tok/s from each iteration's own usage only. Server-measured
  // speeds win when the backend reports them (no harness gaps in them);
  // otherwise the client-measured outputTps covers every provider.
  const serverSpeeds = rounds
    .map((r) => r?.round?.serverTps)
    .filter((v) => Number.isFinite(v) && v > 0);
  const clientSpeeds = rounds
    .map((r) => r?.round?.outputTps)
    .filter((v) => Number.isFinite(v) && v > 0);
  const speeds = serverSpeeds.length ? serverSpeeds : clientSpeeds;
  const lastSpeeds = rounds
    .map((r) =>
      serverSpeeds.length ? r?.round?.serverTps : r?.round?.outputTps
    )
    .filter((v) => Number.isFinite(v));
  // Tool call counts come from the request lists (exact, current-iteration).
  const kindCalls = {};
  let toolCalls = 0;
  for (const r of rounds) {
    const tools = Array.isArray(r?.requestedTools) ? r.requestedTools : [];
    toolCalls += tools.length;
    for (const t of tools) {
      const kind = runstatKind(t?.kind);
      kindCalls[kind] = (kindCalls[kind] ?? 0) + 1;
    }
  }
  // Tool token split comes from the cumulative server snapshot (exact at
  // run end via usageMetrics; lags the final turn mid-run - see setRunToolIo).
  const snapKinds =
    toolIo && typeof toolIo === "object" && toolIo.byKind
      ? toolIo.byKind
      : null;
  const byKind = RUNSTAT_KINDS.map((kind) => {
    let calls = kindCalls[kind] ?? 0;
    let tokensEst = 0;
    if (snapKinds) {
      // Snapshot keys are server kinds - fold write+read into files.
      for (const [raw, bucket] of Object.entries(snapKinds)) {
        if (runstatKind(raw) === kind)
          tokensEst += Number(bucket?.tokensEst) || 0;
      }
      // Prefer the snapshot's own call counts (they include executed calls
      // only, while requestedTools counts requests incl. repairs/skips).
      let snapCalls = 0;
      for (const [raw, bucket] of Object.entries(snapKinds)) {
        if (runstatKind(raw) === kind) snapCalls += Number(bucket?.calls) || 0;
      }
      if (snapCalls > 0) calls = snapCalls;
    }
    return { kind, calls, tokensEst };
  }).filter((row) => row.calls > 0 || row.tokensEst > 0);
  return {
    rounds: rounds.length,
    prompt: Number(lastUsage.prompt_tokens) || 0,
    completion: Number(lastUsage.completion_tokens) || 0,
    cached: Number(lastUsage.cached_tokens) || 0,
    cacheHit:
      Number(lastUsage.prompt_tokens) > 0
        ? Math.min(
            1,
            (Number(lastUsage.cached_tokens) || 0) /
              Number(lastUsage.prompt_tokens)
          )
        : 0,
    tps: {
      last: lastSpeeds.length ? lastSpeeds[lastSpeeds.length - 1] : 0,
      avg: speeds.length
        ? speeds.reduce((a, b) => a + b, 0) / speeds.length
        : 0,
      max: speeds.length ? Math.max(...speeds) : 0,
      server: serverSpeeds.length > 0,
    },
    toolCalls,
    toolTokensEst:
      snapKinds && Number.isFinite(toolIo.tokensEst) ? toolIo.tokensEst : 0,
    byKind,
  };
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
