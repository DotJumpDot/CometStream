/**
 * Terminal skill. Lets the agent run shell commands (build, install, serve,
 * curl self-tests) the same way a desktop coding agent would.
 *
 * SECURITY MODEL - read before changing anything:
 * This tool executes command strings produced by an LLM, so it stays
 * unavailable until the operator explicitly opts in - either with
 * AGENT_ENABLE_TERMINAL=1 in the server ENV or by switching on the in-app
 * `terminal_agent_enabled` system setting (Admin). It is intended for local,
 * single-user installs that accept the same trust model as any desktop agent
 * harness (Claude Code, ZCode, Cursor): an approved run may touch the machine.
 * Deployments that must not offer a shell simply never opt in and the skill
 * stays unavailable - both the loader and the handler itself re-check the
 * flag, so a stale system setting alone cannot resurrect the tool after a
 * restart... (restart clears nothing: the check runs on every call).
 *
 * Additional seatbelts (not a sandbox - the opt-in is the real gate):
 * - Commands run with cwd pinned to the terminal root: AGENT_TERMINAL_ROOT
 *   ENV wins, then the in-app `terminal_agent_root` setting, then the agent
 *   filesystem sandbox. The working directory is reported back to the model.
 * - Hard wall-clock timeout (AGENT_TERMINAL_TIMEOUT_MS, default 120s, max
 *   600s) so a hung server or watch-mode command cannot wedge the chat.
 * - stdout/stderr are capped before they reach the model's context window.
 * - A small denylist refuses commands whose only effect is wrecking the host
 *   (shutdown/format/diskpart/...); everything else is the user's call, made
 *   through the normal per-tool approval flow.
 */
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const MAX_OUTPUT_CHARS = 12_000;
const HEAD_CHARS = 2_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const MIN_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 600_000;

// Catastrophic host commands with no legitimate use in a workspace build
// task. Matched against the raw command string, case-insensitive. Kept to
// "wrecks the machine" class - bricking boot, wiping disks/raw devices,
// fork-bombing, deleting OS roots. Everything riskier-than-comfortable but
// recoverable (git reset, npm install, curl) stays allowed and rides the
// normal per-tool approval flow.
const DENIED_COMMAND_PATTERNS = [
  // Power/boot
  /\bshutdown\b/i,
  /\blogoff\b/i,
  /\bbcdedit\b/i,
  /\bbootcfg\b/i,
  // Disk/partition wipe
  /\bformat\s+[a-z]:/i,
  /\bdiskpart\b/i,
  /\bmkfs(\.\w+)?\b/i,
  /\bwipefs\b/i,
  /\bcipher\s+\/w/i,
  /\bdd\b[^\n]*\bof=\/dev\//i,
  />\s*\/dev\/(?:sd[a-z]|hd[a-z]|nvme\d+n\d+|mmcblk)/i,
  // Recursive delete of OS roots
  /\brm\s+-rf\s+\/(?:\s|$)/,
  /\brm\s[^|;&]*-[a-z]*r[a-z]*[^|;&]*--no-preserve-root/i,
  /\brm\s[^|;&]*-[a-z]*r[a-z]*[^|;&]*\s\/(?:etc|usr|var|boot|bin|sbin|lib|root|dev|proc|sys|home|Users)\b/i,
  /\brd\s+\/s\b/i,
  /\bdel\s+\/(?:f|s|q)\b/i,
  /\bdel\s+[^\n]*\bc:\\windows\b/i,
  /\bremove-item\b[^\n]*-recurse[^\n]*\bc:\\\s*$/i,
  // Resource exhaustion
  /:\(\)\s*\{\s*:\|\s*:?\s*&\s*\}\s*;?\s*:/,
];

/**
 * Whether the terminal skill is enabled for this server instance.
 * Sync ENV-only check kept for back-compat (loader fast-path, unit tests).
 * Prefer {@link isEnabled} for the real gate - it also honors in-app config.
 * @returns {boolean} True only when the operator opted in via env.
 */
function isToolAvailable() {
  return process.env.AGENT_ENABLE_TERMINAL === "1";
}

// In-app system-setting keys (set from CometStream itself, no ENV edit).
// ENV vars still work and win when set, so existing installs are unaffected.
const SETTING_ENABLED_KEY = "terminal_agent_enabled";
const SETTING_ROOT_KEY = "terminal_agent_root";

/**
 * Lazy SystemSettings access. Required lazily (not at module top) because
 * the settings model pulls in half the server - eager import here would
 * create a require cycle through utils/agents/defaults.
 * @returns {{getValueOrFallback: Function}|null} Settings model or null.
 */
function settingsModel() {
  try {
    return require("../../../../models/systemSettings").SystemSettings;
  } catch {
    return null; // Fail closed when the model is unavailable.
  }
}

/**
 * Whether the terminal skill may run right now. The ENV opt-in wins;
 * otherwise the in-app `terminal_agent_enabled` system setting applies so
 * the skill can be switched on from CometStream itself.
 * Async because the setting lives in the DB - fail closed on any error.
 * @returns {Promise<boolean>} True when the skill is enabled.
 */
async function isEnabled() {
  if (isToolAvailable()) return true;
  const Settings = settingsModel();
  if (!Settings) return false;
  try {
    return (
      (await Settings.getValueOrFallback(
        { label: SETTING_ENABLED_KEY },
        "false"
      )) === "true"
    );
  } catch {
    return false;
  }
}

/**
 * Resolves the working directory every command runs in. Defaults to the agent
 * filesystem sandbox so an opted-in but unconfigured install stays inside the
 * app's own scratch space; AGENT_TERMINAL_ROOT points it elsewhere on purpose.
 * Sync ENV-only resolution - prefer {@link terminalRootAsync} so the in-app
 * `terminal_agent_root` setting applies too.
 * @returns {string} Absolute directory path.
 */
function terminalRoot() {
  if (process.env.AGENT_TERMINAL_ROOT?.trim()) {
    return path.resolve(process.env.AGENT_TERMINAL_ROOT.trim());
  }
  const storageRoot =
    process.env.STORAGE_DIR ||
    path.resolve(__dirname, "../../../../../storage");
  return path.join(storageRoot, "anythingllm-fs");
}

/**
 * Working directory with in-app override. ENV wins, then the
 * `terminal_agent_root` system setting, then the default sandbox.
 * @returns {Promise<string>} Absolute directory path.
 */
async function terminalRootAsync() {
  if (process.env.AGENT_TERMINAL_ROOT?.trim()) return terminalRoot();
  const Settings = settingsModel();
  if (Settings) {
    try {
      const configured = await Settings.getValueOrFallback(
        { label: SETTING_ROOT_KEY },
        ""
      );
      // Guard against sentinel strings ("false"/empty) being treated as a
      // path - only a real non-empty value pins the working directory.
      const candidate = configured?.trim();
      if (candidate && candidate !== "false") return path.resolve(candidate);
    } catch {
      // Fall through to the default sandbox below.
    }
  }
  return terminalRoot();
}

/**
 * Picks the shell used to run commands. Prefers bash (Git Bash on Windows)
 * because heredocs, `&&`, and `&` backgrounding work there, which is what
 * models reliably emit; falls back to cmd.exe. AGENT_TERMINAL_SHELL overrides
 * for exotic setups.
 * @returns {{command: string, preArgs: string[]}} Spawn target + fixed args.
 */
function resolveShell() {
  const override = process.env.AGENT_TERMINAL_SHELL?.trim();
  if (override) return { command: override, preArgs: ["-c"] };
  if (process.platform === "win32") {
    const candidates = [
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate))
        return { command: candidate, preArgs: ["-c"] };
    }
    return {
      command: process.env.ComSpec || "cmd.exe",
      preArgs: ["/c"],
    };
  }
  return { command: "/bin/bash", preArgs: ["-c"] };
}

/**
 * Clamps the configured per-command timeout to sane bounds.
 * @returns {number} Timeout in milliseconds.
 */
function commandTimeoutMs() {
  const raw = Number.parseInt(process.env.AGENT_TERMINAL_TIMEOUT_MS || "", 10);
  if (!Number.isFinite(raw)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, raw));
}

/**
 * Caps captured output so one chatty command cannot flood the model context.
 * Keeps the head and the tail (error summaries usually live at the end).
 * @param {string} text - Raw captured stdout/stderr.
 * @returns {string} Possibly truncated text with a visible marker.
 */
function capOutput(text) {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  const omitted = text.length - HEAD_CHARS - (MAX_OUTPUT_CHARS - HEAD_CHARS);
  return (
    text.slice(0, HEAD_CHARS) +
    `\n...[${omitted} chars truncated]...\n` +
    text.slice(text.length - (MAX_OUTPUT_CHARS - HEAD_CHARS))
  );
}

/**
 * Maximum characters for a summarized command in the activity log.
 * @type {number}
 */
const SUMMARY_MAX_CHARS = 200;

/**
 * Summarizes a shell command for the activity log, desktop-harness style:
 * heredoc bodies collapse to `<< 'EOF' …(N lines)` and the whole thing
 * flattens to one capped line. The executed command itself is untouched -
 * this only affects what the model/user reads in the status feed, so a
 * `cat > file << 'EOF' <300 lines> EOF` call logs as one short row instead
 * of a wall of file content.
 * @param {string} command - Raw shell command line.
 * @param {number} [maxChars] - Cap for the flattened summary.
 * @returns {string} One-line human-readable summary.
 */
function summarizeCommand(command, maxChars = SUMMARY_MAX_CHARS) {
  const lines = String(command ?? "").split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    out.push(line);
    // Heredoc start: `<< EOF`, `<< 'EOF'`, `<<-"EOF"`...
    const opener = line.match(/<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_-]*)['"]?/);
    if (!opener) continue;
    const delim = opener[1];
    let end = -1;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === delim) {
        end = j;
        break;
      }
    }
    if (end === -1) continue; // Unterminated - leave the rest untouched.
    const bodyLines = end - i - 1;
    out.push(`…(${bodyLines} heredoc lines)`);
    out.push(lines[end]);
    i = end;
  }
  const flat = out.join("\n").replace(/\s+/g, " ").trim();
  if (flat.length <= maxChars) return flat;
  return `${flat.slice(0, maxChars - 1).trimEnd()}…`;
}

/**
 * Classifies a shell command for the session row chip so the chat reads at
 * a glance (`Search - $ grep …` vs a bare `$ …`). First match wins in
 * specificity order: heredoc/redirect writes before anything they chain
 * with, then installs, searches, fetches, and plain runs.
 * @param {string} command - Raw shell command line.
 * @returns {"Search"|"Run"|"Install"|"Write"|"Fetch"|null} Category or null
 * for anything unrecognized (the row renders chipless).
 */
function categorizeCommand(command) {
  const cmd = String(command ?? "");
  if (!cmd.trim()) return null;
  // Heredoc file writes (`cat > file << 'EOF'`) and in-place edits.
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
  // Shell-redirection writes (`> file`, `>> file`) - but not stderr
  // plumbing (`2>`, `&>`, `>/dev/null`) which accompanies any command.
  if (/(?<![\d&])>\s*(?!\/dev\/null\b|>)[\w.~/\\-][^|;&\n]*/.test(cmd))
    return "Write";
  if (
    /(^|[|;&\s])\s*(node|python3?|npm\s+(run|start)|yarn\s+(run|start|dev)|go\s+run|dotnet\s+run|uvicorn|gunicorn)\b/i.test(
      cmd
    )
  )
    return "Run";
  return null;
}

// Bounds for terminal workdir change detection (see snapshotWorkdir): the
// walk stays cheap on project dirs while node_modules-style trees never
// get scanned at all.
const WORKDIR_SNAPSHOT_MAX_FILES = 500;
const WORKDIR_CONTENT_MAX_BYTES = 128 * 1024;
const WORKDIR_IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
  "dist",
  "build",
  ".next",
  "target",
  "bin",
  "obj",
]);
const WORKDIR_MAX_CARDS = 20;

/**
 * Lists files under a root as forward-slash relative paths, deterministic
 * (sorted) and capped so a huge tree cannot stall a tool call. Ignored
 * dependency/build dirs are never descended into.
 * @param {string} root - Absolute directory to walk.
 * @returns {string[]} Relative file paths.
 */
function walkWorkdirFiles(root) {
  const found = [];
  const stack = [""];
  while (stack.length > 0 && found.length < WORKDIR_SNAPSHOT_MAX_FILES) {
    const rel = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(path.join(root, rel), {
        withFileTypes: true,
      });
    } catch {
      continue; // Raced deletion or unreadable dir - skip it.
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (found.length >= WORKDIR_SNAPSHOT_MAX_FILES) break;
      const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!WORKDIR_IGNORED_DIRS.has(entry.name)) stack.push(entryRel);
      } else if (entry.isFile()) {
        found.push(entryRel);
      }
    }
  }
  return found.sort();
}

/**
 * Reads a file as UTF-8 text when it is small enough to diff, else null.
 * Binary (NUL byte) and oversized files never become cards.
 * @param {string} absPath - Absolute file path.
 * @returns {string|null} Text content or null.
 */
function readSmallTextFile(absPath) {
  try {
    const stat = fs.statSync(absPath);
    if (!stat.isFile() || stat.size > WORKDIR_CONTENT_MAX_BYTES) return null;
    const buf = fs.readFileSync(absPath);
    if (buf.includes(0)) return null;
    return buf.toString("utf-8");
  } catch {
    return null; // Raced deletion - treated as no content.
  }
}

/**
 * Snapshots a workdir: stat map for every file plus text content for small
 * text files (needed as the "before" side of edit diffs).
 * @param {string} root - Absolute terminal working directory.
 * @returns {{files: Map<string, {size: number, mtimeMs: number}>, contents: Map<string, string>}}
 */
function snapshotWorkdir(root) {
  const files = new Map();
  const contents = new Map();
  for (const rel of walkWorkdirFiles(root)) {
    const abs = path.join(root, rel);
    try {
      const stat = fs.statSync(abs);
      if (!stat.isFile()) continue;
      files.set(rel, { size: stat.size, mtimeMs: stat.mtimeMs });
      const text = readSmallTextFile(abs);
      if (text !== null) contents.set(rel, text);
    } catch {
      continue; // Raced deletion - skip it.
    }
  }
  return { files, contents };
}

/**
 * Diffs two workdir snapshots: added files plus files whose size/mtime
 * changed. Deletions intentionally produce nothing (no delete card exists).
 * @param {{files: Map}} before - snapshotWorkdir result from before the run
 * @param {{files: Map}} after - snapshotWorkdir result from after the run
 * @returns {{added: string[], modified: string[]}} Relative paths.
 */
function detectWorkdirChanges(before, after) {
  const added = [];
  const modified = [];
  for (const [rel, a] of after.files) {
    const b = before.files.get(rel);
    if (!b) added.push(rel);
    else if (a.size !== b.size || a.mtimeMs !== b.mtimeMs) modified.push(rel);
  }
  return { added, modified };
}

/**
 * Counts added/removed lines in a unified diff string, ignoring the
 * `+++`/`---` file headers. Mirrors countUnifiedDiffLines in the
 * filesystem lib (kept local: that helper is module-private there).
 * @param {string} diffText - unified diff
 * @returns {{added: number, removed: number}}
 */
function countWorkdirDiffLines(diffText) {
  let added = 0;
  let removed = 0;
  for (const line of diffText.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) added++;
    else if (line.startsWith("-")) removed++;
  }
  return { added, removed };
}

/**
 * Caps a unified diff like capUnifiedDiffLines in the filesystem lib.
 * @param {string} diffText - unified diff
 * @param {number} [maxLines] - max lines to keep
 * @returns {{diff: string, truncated: boolean}}
 */
function capWorkdirDiff(diffText, maxLines = 500) {
  const lines = diffText.split("\n");
  if (lines.length <= maxLines) return { diff: diffText, truncated: false };
  return {
    diff: lines.slice(0, maxLines).join("\n"),
    truncated: true,
  };
}

/**
 * Emits one fileChangeCard per file a terminal command created or modified
 * so shell writes (`cat > file <<'EOF'`, `sed -i`, scaffolds) show up in
 * the chat like file-skill writes do. New files become `create` rows with
 * a line count; edits become `edit` rows with a real unified diff (same
 * expandable rendering). Binary, oversized, and mtime-only touches emit
 * nothing; output is capped so a dependency install cannot spam the chat.
 * Card emission must never break the tool result - callers wrap in try.
 * @param {(payload: object) => void} send - fileChangeCard sender
 * @param {{files: Map, contents: Map}} before - pre-run snapshot
 * @param {{files: Map, contents: Map}} after - post-run snapshot
 */
function emitWorkdirFileCards(send, before, after) {
  const { createTwoFilesPatch } = require("diff");
  const { added, modified } = detectWorkdirChanges(before, after);
  let emitted = 0;
  for (const rel of added) {
    if (emitted >= WORKDIR_MAX_CARDS) return;
    const content = after.contents.get(rel);
    if (content == null) continue;
    send({
      action: "create",
      path: rel,
      added: content.split("\n").length,
    });
    emitted++;
  }
  for (const rel of modified) {
    if (emitted >= WORKDIR_MAX_CARDS) return;
    const beforeText = before.contents.get(rel);
    const afterText = after.contents.get(rel);
    if (beforeText == null || afterText == null) continue;
    if (beforeText === afterText) continue; // mtime-only touch, no row.
    const rawDiff = createTwoFilesPatch(
      `a/${rel}`,
      `b/${rel}`,
      beforeText,
      afterText,
      "",
      ""
    );
    const { added: addedLines, removed } = countWorkdirDiffLines(rawDiff);
    const { diff, truncated } = capWorkdirDiff(rawDiff);
    send({
      action: "edit",
      path: rel,
      added: addedLines,
      removed,
      diff,
      truncated,
    });
    emitted++;
  }
}

/**
 * Runs a command inside the terminal root with timeout + output caps.
 * @param {string} command - Shell command line to execute.
 * @param {object} [opts] - Optional overrides.
 * @param {string|null} [opts.cwd] - Explicit working directory ( resolved
 * in-app root). Defaults to the ENV/sandbox resolution.
 * @returns {Promise<object>} Result envelope for the model.
 */
async function runCommand(command, { cwd = null } = {}) {
  const trimmed = String(command ?? "").trim();
  if (!trimmed) return { ok: false, error: "No command provided." };

  for (const pattern of DENIED_COMMAND_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        ok: false,
        error: `Command blocked by the terminal safety filter (matched ${pattern}).`,
      };
    }
  }

  const root = cwd ?? terminalRoot();
  fs.mkdirSync(root, { recursive: true });
  const { command: shell, preArgs } = resolveShell();
  const timeout = commandTimeoutMs();
  const started = Date.now();

  return new Promise((resolve) => {
    execFile(
      shell,
      [...preArgs, trimmed],
      {
        cwd: root,
        timeout,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
        killSignal: "SIGKILL",
      },
      (error, stdout, stderr) => {
        // execFile reports a non-zero exit as an Error object; that is a
        // normal command failure the model should see, not a tool failure.
        const exitCode = error?.code ?? 0;
        resolve({
          ok: typeof exitCode === "number",
          exitCode,
          signal: error?.signal ?? null,
          timedOut: error?.killed === true,
          stdout: capOutput(String(stdout ?? "")),
          stderr: capOutput(String(stderr ?? "")),
          durationMs: Date.now() - started,
          cwd: root,
        });
      }
    );
  });
}

const terminalAgent = {
  // Plugin name doubles as the aibitat function name - the agent's function
  // list is keyed by plugin name for single-stage plugins, so the two must
  // match or the tool never reaches the model.
  name: "terminal-agent",
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
            "Run a shell command in the project working directory and return stdout/stderr with the exit code. " +
            "Use it to scaffold projects, install dependencies, start dev servers in the background (&), " +
            "and self-test with curl. Long output is truncated. The working directory stays fixed per call - " +
            "chain commands with && (e.g. 'cd backend && ls') instead of relying on cd persisting.",
          examples: [
            {
              prompt: "Check the toolchain and list the project files",
              call: JSON.stringify({ command: "python --version && ls -la" }),
            },
            {
              prompt: "Start a dev server in the background",
              call: JSON.stringify({
                command:
                  "cd backend && nohup python -m uvicorn main:app --host 127.0.0.1 --port 8000 > server.log 2>&1 & sleep 2 && curl -s http://127.0.0.1:8000/api/health",
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              command: {
                type: "string",
                description:
                  "The shell command to run. Multiple steps can be chained with && or ;.",
              },
            },
            required: ["command"],
            additionalProperties: false,
          },
          handler: async function ({ command = "" }) {
            try {
              // Defense in depth: the loader filters on availability, but
              // the handler re-checks on every call so a misconfigured skill
              // list can never execute commands on an install that never
              // opted in (via ENV or the in-app setting).
              if (!(await isEnabled())) {
                return "Error: the terminal skill is disabled on this server. Enable it via AGENT_ENABLE_TERMINAL=1 or the in-app terminal_agent_enabled setting.";
              }

              this.super.handlerProps.log(`Using the terminal tool.`);
              // Log the compact summary, not the raw command: heredoc file
              // writes would otherwise dump whole file contents into the
              // activity feed. The approval card still carries the full
              // command, and the model gets full stdout/stderr back.
              this.super.introspect(
                `${this.caller}: $ ${summarizeCommand(command)}`
              );

              if (this.super.requestToolApproval) {
                const approval = await this.super.requestToolApproval({
                  skillName: this.name,
                  payload: { command },
                  description: "Run a shell command",
                });
                if (!approval.approved) {
                  this.super.introspect(
                    `${this.caller}: User rejected the ${this.name} request.`
                  );
                  return approval.message;
                }
              }

              // Session log for the side panel: one row per execution with
              // the full command + output tail on expand.
              const workdirRoot = await terminalRootAsync();
              // Snapshot before the run so files the shell creates or edits
              // can be reported as file cards afterwards.
              const workdirBefore = snapshotWorkdir(workdirRoot);
              const sessions = require("./sessions.js");
              const session = sessions.startSession({
                kind: "terminal",
                label: `$ ${summarizeCommand(command)}`,
                detail: `$ ${String(command ?? "").trim()}\n`,
                category: categorizeCommand(command),
              });
              const sessionId = session.id;
              this.super.socket?.send?.("sessionCard", { ...session });

              const result = await runCommand(command, {
                cwd: workdirRoot,
              });
              this.super.introspect(
                `${this.caller}: exit ${result.exitCode ?? "?"} in ${result.durationMs}ms`
              );
              finishTerminalSession(sessionId, this.super.socket, result);
              // Shell writes (`cat > file <<'EOF'`, `sed -i`, scaffolds)
              // show up in the chat like file-skill writes. Card emission
              // must never break the tool result, so it is guarded.
              try {
                emitWorkdirFileCards(
                  (payload) =>
                    this.super.socket?.send?.("fileChangeCard", payload),
                  workdirBefore,
                  snapshotWorkdir(workdirRoot)
                );
              } catch {
                // File rows are best-effort UI - the result stands either way.
              }
              return JSON.stringify(result);
            } catch (e) {
              this.super.handlerProps.log(`terminal-agent error: ${e.message}`);
              this.super.introspect(`Error: ${e.message}`);
              return JSON.stringify({ ok: false, error: e.message });
            }
          },
        });
      },
    };
  },
};

/**
 * Finishes a terminal session entry and mirrors it to the frontend panel.
 * Non-zero exits are normal command failures the model handles, so only
 * timeouts/kills mark the session errored.
 * @param {number|null} sessionId - registry id (null skips silently)
 * @param {object} socket - aibitat socket for sessionCard events
 * @param {object} result - runCommand result envelope
 */
function finishTerminalSession(sessionId, socket, result = {}) {
  if (sessionId == null) return;
  const sessions = require("./sessions.js");
  const tail = [
    result.stdout ? `--- stdout ---\n${result.stdout}` : "",
    result.stderr ? `--- stderr ---\n${result.stderr}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(-4000);
  const status = result.timedOut ? "error" : "done";
  sessions.finishSession(
    sessionId,
    status,
    `\n--- exit ${result.exitCode ?? "?"} in ${result.durationMs ?? 0}ms ---\n${tail}`
  );
  const current = sessions
    .listSessions()
    .find((entry) => entry.id === sessionId);
  if (current) socket?.send?.("sessionCard", { ...current });
}

module.exports = {
  terminalAgent,
  isToolAvailable,
  isEnabled,
  runCommand,
  resolveShell,
  terminalRoot,
  terminalRootAsync,
  capOutput,
  commandTimeoutMs,
  summarizeCommand,
  categorizeCommand,
  snapshotWorkdir,
  detectWorkdirChanges,
  emitWorkdirFileCards,
  finishTerminalSession,
  SUMMARY_MAX_CHARS,
  DENIED_COMMAND_PATTERNS,
  SETTING_ENABLED_KEY,
  SETTING_ROOT_KEY,
};
