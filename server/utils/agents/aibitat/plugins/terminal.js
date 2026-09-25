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
 * - Commands run with cwd pinned to the project folder when the chat's
 *   workspace is folder-bound (`projectPath`, always re-validated inside
 *   the jail below), otherwise the terminal root: AGENT_TERMINAL_ROOT
 *   ENV wins, then the in-app `terminal_agent_root` setting, then the agent
 *   filesystem sandbox. The working directory is reported back to the model.
 * - Hard wall-clock timeout (AGENT_TERMINAL_TIMEOUT_MS, default 120s, max
 *   600s) so a hung server or watch-mode command cannot wedge the chat.
 * - stdout/stderr are capped before they reach the model's context window.
 * - A small denylist refuses commands whose only effect is wrecking the host
 *   (shutdown/format/diskpart/...); everything else is the user's call, made
 *   through the normal per-tool approval flow.
 */
const { execFile, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { projectText, spillText } = require("./result-budget");

const MAX_STDOUT_CHARS = 8_000;
const MAX_STDERR_CHARS = 4_000;
const HEAD_CHARS = 2_000;
const STDERR_HEAD_CHARS = 1_000;
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
 * Binaries that only inspect (never mutate) when their arguments are clean.
 * Interpreters and anything that executes code (node/python/npm run), anything
 * that touches the network (curl/wget), and pagers that block on stdin
 * (less/more) are deliberately absent - those keep the approval prompt.
 */
const READONLY_BINARIES = new Set([
  "ls",
  "dir",
  "cat",
  "type",
  "head",
  "tail",
  "echo",
  "printf",
  "pwd",
  "cd",
  "whoami",
  "hostname",
  "uname",
  "ver",
  "wc",
  "sort",
  "uniq",
  "tree",
  "stat",
  "file",
  "diff",
  "cmp",
  "od",
  "xxd",
  "strings",
  "grep",
  "rg",
  "find",
  "findstr",
  "locate",
  "where",
  "which",
  "whereis",
  "test",
  "[",
  "true",
  "false",
  "jq",
  "yq",
  "ps",
  "tasklist",
  "df",
  "du",
  "tr",
  "cut",
]);

/**
 * Per-binary argument vetoes: tokens that turn an inspection binary into a
 * writer (or a hang). Matched case-sensitively against whitespace-split args.
 */
const READONLY_ARG_VETOES = {
  find: ["-delete", "-exec", "-execdir", "-ok", "-fls", "-fprint", "-fprintf"],
  yq: ["-i", "--inplace"],
  tail: ["-f", "--follow", "-F"],
  tee: null, // tee always writes - rejected wholesale below.
};

/** git subcommands with no destructive mode regardless of later args. */
const READONLY_GIT_SUBCOMMANDS = new Set([
  "status",
  "log",
  "diff",
  "show",
  "rev-parse",
  "ls-files",
  "grep",
]);

/** Args that are inspection-only for any binary (`node --version` etc). */
const READONLY_VERSION_ARGS = new Set([
  "--version",
  "-v",
  "-V",
  "version",
  "--help",
  "-h",
  "-?",
]);

/**
 * Splits a command line on shell chaining/piping operators, quote-aware so
 * `&&` inside quotes does not split. Every returned segment still needs its
 * own head-binary check - this only finds the boundaries.
 * @param {string} command - Raw shell command line.
 * @returns {string[]|null} Segments, or null when quotes are unbalanced.
 */
function splitChainSegments(command) {
  const segments = [];
  let current = "";
  let quote = null;
  let escaped = false;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      current += ch;
      escaped = true;
      continue;
    }
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      current += ch;
      quote = ch;
      continue;
    }
    // `2>&1` / `&>` are redirections, not background chaining - keep them
    // literal or `ls 2>&1 | head` would split into a bogus "1" stage.
    if (ch === "&" && (command[i + 1] === ">" || command[i - 1] === ">")) {
      current += ch;
      if (command[i + 1] === ">") {
        current += ">";
        i++;
      }
      continue;
    }
    if (
      ch === "&" ||
      ch === "|" ||
      ch === ";" ||
      (ch === "&" && command[i + 1] === "&") ||
      (ch === "|" && command[i + 1] === "|")
    ) {
      segments.push(current);
      current = "";
      if (
        (ch === "&" && command[i + 1] === "&") ||
        (ch === "|" && command[i + 1] === "|")
      )
        i++;
      continue;
    }
    current += ch;
  }
  if (quote) return null; // Unbalanced quotes - refuse to classify.
  segments.push(current);
  return segments;
}

/**
 * Whether a `>` in the command is a real file redirect (veto) as opposed to
 * stderr plumbing (`2>`, `&>`) or the null sink (`>/dev/null`), which ride
 * along with any inspection command.
 * @param {string} command - Raw shell command line (quotes already vetted).
 * @returns {boolean} True when a file-writing redirect is present.
 */
function hasFileRedirect(command) {
  for (let i = 0; i < command.length; i++) {
    if (command[i] !== ">") continue;
    const prev = command[i - 1];
    if (prev === ">" || prev === "&" || /\d/.test(prev ?? "")) continue;
    const rest = command.slice(i + 1).trimStart();
    if (rest.startsWith("/dev/null")) continue;
    return true;
  }
  return false;
}

/**
 * Whether one chain segment is a provably read-only invocation: its head
 * binary is in the inspection set (or runs with version/help-only args), git
 * stays within read-only subcommands, and per-binary write flags are absent.
 * @param {string} segment - One operator-split command segment.
 * @returns {boolean}
 */
function isReadOnlySegment(segment) {
  const tokens = segment.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true; // Empty stage (e.g. trailing &).
  if (/^\w+=/.test(tokens[0])) return false; // Env-prefix can alter behavior.
  const binary = tokens[0]
    .toLowerCase()
    .split(/[\\/]/)
    .pop()
    .replace(/\.(exe|cmd|bat|com)$/, "");
  const args = tokens.slice(1);

  // `X --version` / `X --help` is inspection for any binary.
  if (args.length > 0 && args.every((arg) => READONLY_VERSION_ARGS.has(arg)))
    return true;

  // tee always writes stdout to a file.
  if (binary === "tee") return false;

  // git needs subcommand-level gating (`git branch -d` deletes).
  if (binary === "git") {
    const sub = (args[0] || "").toLowerCase();
    if (READONLY_GIT_SUBCOMMANDS.has(sub)) return true;
    if (sub === "stash" && args[1]?.toLowerCase() === "list") return true;
    if (sub === "remote" && (args.length === 1 || args[1] === "-v"))
      return true;
    return false;
  }

  if (!READONLY_BINARIES.has(binary)) return false;
  const vetoes = READONLY_ARG_VETOES[binary];
  if (vetoes && args.some((arg) => vetoes.includes(arg))) return false;
  return true;
}

/**
 * Whether a whole command line is provably read-only: every chained/piped
 * stage inspects only, with no file redirects, heredocs, or command
 * substitution. Conservative by design - anything unrecognized returns false
 * and keeps the normal approval prompt.
 *
 * This only ever SKIPS the approval UI. runCommand still enforces the
 * denylist and the root jail on every call, so a misclassification cannot
 * execute anything the denylist forbids.
 * @param {string} command - Raw shell command line.
 * @returns {boolean} True only when read-only is proven.
 */
function isReadOnlyCommand(command) {
  const trimmed = String(command ?? "").trim();
  if (!trimmed) return false;
  // Heredocs and command substitution can smuggle arbitrary writes.
  if (/<<|\$\(|`/.test(trimmed)) return false;
  if (/\bsudo\b|\bsu\b|\brunas\b|\bdoas\b/i.test(trimmed)) return false;
  for (const pattern of DENIED_COMMAND_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }
  if (hasFileRedirect(trimmed)) return false;
  const segments = splitChainSegments(trimmed);
  if (!segments) return false;
  return segments.every(isReadOnlySegment);
}
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
    // Dev fallback: server/storage (four levels up from this file's
    // plugins/ dir). Five levels lands on the repo root, which has never
    // held storage - anythingllm-fs and the DB live under server/storage.
    path.resolve(__dirname, "../../../../storage");
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
 * Per-project working directory (ZCode-style folder-bound projects). When
 * the current chat's workspace carries a `projectPath`, commands run inside
 * that folder so each project's first chat is already separated by folder.
 * Falls back to the global root for unbound (legacy) workspaces.
 *
 * The stored path is re-validated against the jail on every call: a root
 * change after the binding was saved must degrade to the global root, never
 * execute outside the jail.
 * @param {object} handlerProps - aibitat handler props (invocation.workspace).
 * @returns {Promise<string>} Absolute working directory for this call.
 */
async function workdirForInvocation(handlerProps = {}) {
  const root = await terminalRootAsync();
  const stored = handlerProps?.invocation?.workspace?.projectPath;
  if (!stored || typeof stored !== "string" || !stored.trim()) return root;
  const { resolveProjectPath } = require("../../../projectPath");
  const resolved = resolveProjectPath(stored.trim(), root);
  if (!resolved.ok) return root;
  try {
    fs.mkdirSync(resolved.dir, { recursive: true });
  } catch {
    return root;
  }
  return resolved.dir;
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
 * Shape shared with result-budget projectText; inline budget only - callers
 * that truncate spill the full text separately (see runCommand).
 * @param {string} text - Raw captured stdout/stderr.
 * @param {number} [maxChars] - Total budget including the marker.
 * @param {number} [headChars] - Head window; the rest is tail.
 * @returns {string} Possibly truncated text with a visible marker.
 */
function capOutput(text, maxChars = MAX_STDOUT_CHARS, headChars = HEAD_CHARS) {
  return projectText(text, maxChars, headChars).text;
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
 * a glance (`Search - $ grep …` vs a bare `$ …`). Only the first pipeline
 * stage is classified (a trailing `| head` is a consumer, not the class);
 * first match wins in specificity order: heredoc/redirect writes before
 * anything they chain with, then installs, searches, fetches,
 * destructive/process control (kill/sleep), VCS, tests, file ops, viewers,
 * listers, and plain runs.
 * @param {string} command - Raw shell command line.
 * @returns {"Search"|"Run"|"Install"|"Write"|"Fetch"|"Kill"|"Sleep"|"Git"|"Test"|"Files"|"Cat"|"List"|"Pwd"|"Bash"|null} Category or null
 * for anything unrecognized (the row renders chipless).
 */
function categorizeCommand(command) {
  const cmd = String(command ?? "");
  if (!cmd.trim()) return null;
  // Classify the FIRST pipeline stage: a trailing `| head`/`| tail` is a
  // pager consumer, not the command's class (`node server.js | head` is a
  // Run, not a Cat). Only `|` is stripped - `;`/`&&` chains keep their
  // leftmost-command precedence naturally since the first-match order
  // already prefers the leading class.
  const stage = cmd.split("|")[0];
  // Heredoc file writes (`cat > file << 'EOF'`) and in-place edits.
  if (/<<-?\s*['"]?[A-Za-z_]/.test(stage)) return "Write";
  if (/\bsed\b[^\n]*\s-i\b/.test(stage)) return "Write";
  if (
    /(^|[|;&\s])\s*(grep|rg|find|findstr|locate|where|which|Select-String)\b/i.test(
      stage
    )
  )
    return "Search";
  if (
    /\b((npm|yarn|pnpm|bun)\s+(install|i|add|dlx)|pip3?\s+install)\b/i.test(
      stage
    )
  )
    return "Install";
  if (/(^|[|;&\s])\s*(curl|wget|Invoke-WebRequest|\birm\b)\b/i.test(stage))
    return "Fetch";
  if (/(^|[|;&\s])\s*(kill|pkill|killall|taskkill|Stop-Process)\b/i.test(stage))
    return "Kill";
  if (/(^|[|;&\s])\s*(sleep|timeout|Start-Sleep|\bwait\b)\b/i.test(stage))
    return "Sleep";
  if (/(^|[|;&\s])\s*(git|gh)\b/i.test(stage)) return "Git";
  if (
    /(^|[|;&\s])\s*(pytest|jest|vitest|phpunit|rspec|ctest|go\s+test|run_tests)\b/i.test(
      stage
    )
  )
    return "Test";
  if (
    /(^|[|;&\s])\s*(cp|mv|rm|mkdir|rmdir|touch|chmod|chown|ln|del|erase|copy|xcopy|move|robocopy|ren|rename)\b/i.test(
      stage
    )
  )
    return "Files";
  // Shell-redirection writes (`> file`, `>> file`) - but not stderr
  // plumbing (`2>`, `&>`, `>/dev/null`) which accompanies any command.
  if (/(?<![\d&])>\s*(?!\/dev\/null\b|>)[\w.~/\\-][^|;&\n]*/.test(stage))
    return "Write";
  if (
    /(^|[|;&\s])\s*(cat|head|tail|less|more|Get-Content|\bbat\b|\btype\b)\b/i.test(
      stage
    )
  )
    return "Cat";
  if (/(^|[|;&\s])\s*(ls|dir|tree|vdir|exa|eza|\bll\b|\bla\b)\b/i.test(stage))
    return "List";
  if (/(^|[|;&\s])\s*pwd\b/i.test(stage)) return "Pwd";
  if (
    /(^|[|;&\s])\s*(bash|zsh|fish|pwsh|powershell|\bsh\b|\bcmd\b)\b/i.test(
      stage
    )
  )
    return "Bash";
  if (
    /(^|[|;&\s])\s*(node|python3?|npm\s+(run|start)|yarn\s+(run|start|dev)|go\s+run|dotnet\s+run|uvicorn|gunicorn)\b/i.test(
      stage
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
  ".terminal-outputs",
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
 * Directory for spilled full outputs, hidden inside the workdir root so the
 * model can page them back in with the file tools. Skipped by workdir
 * snapshots (see WORKDIR_IGNORED_DIRS) so spills never become file cards.
 * @param {string} root - Absolute terminal working directory.
 * @returns {string} Absolute spill directory.
 */
function spillDirForRoot(root) {
  return path.join(root, ".terminal-outputs");
}

/**
 * In-memory background task registry. Like sessions.js this is intentionally
 * not persisted: tasks belong to the live run (a server restart orphans the
 * OS child, and polling a stale id reports that honestly).
 */
const backgroundTasks = new Map();
let backgroundTaskSeq = 0;

// Output kept per stream per task - polling reads the tail, the full text
// is what a finished task reports. Finished tasks stay pollable until
// evicted by the registry cap.
const BG_STREAM_MAX_CHARS = 32_000;
const BG_MAX_TASKS = 20;
const BG_DEFAULT_TAIL_CHARS = 6_000;

/**
 * Refuses catastrophic host commands, shared by foreground and background
 * runs (the background path must never be a denylist bypass).
 * @param {string} trimmed - Trimmed command line.
 * @returns {string|null} Block reason, or null when allowed.
 */
function deniedReason(trimmed) {
  for (const pattern of DENIED_COMMAND_PATTERNS) {
    if (pattern.test(trimmed)) {
      return `Command blocked by the terminal safety filter (matched ${pattern}).`;
    }
  }
  const rootAccess = rootAccessReason(trimmed);
  if (rootAccess) return rootAccess;
  return null;
}

// Whole-disk access guardrail. The terminal jail pins only the STARTING
// directory - `cd / && find …` walks straight out of it, and a stray
// root-level scan burned the host disk for half an hour in the wild.
// Blocked: cd to a filesystem/drive root or home, and recursive scanning
// binaries invoked with absolute-path targets (a recursive scan of even
// `C:\Users` pegs the disk for minutes). Relative paths and cd-then-scan
// stay allowed - the goal is no whole-disk churn, not a full path sandbox.
//
// Two scanner shapes, because flags differ: unix-style tools flag with `-`,
// so ANY absolute-ish token in their command is suspect; `dir`/`tree` flag
// with `/x` (would collide), so they get a recursive-flag + absolute-target
// pattern instead.
const CD_ROOT_PATTERN =
  /(^|[;&|(]\s*|\bthen\s+)cd\s+["']?(\/{1,2}|\/[a-z]\/?|[a-z]:[/\\]?|~|%USERPROFILE%|\$HOME)["']?(?=\s|$)/i;
const ROOT_SCAN_BINARIES =
  /(^|[|;&\s])\s*(find|grep|rg|du|fd|locate|whereis|gci|get-childitem|get-child-item)\b/i;
const ABSOLUTE_TOKEN =
  /(^|[\s=])["']?(\/[^\s"'|;&)]*|[a-z]:[^\s"'|;&)]*|\\[^\s"'|;&)]*|~|\$HOME|%USERPROFILE%)["']?(?=$|[\s)&|;])/i;
const WINDOWS_RECURSIVE_SCAN =
  /(^|[|;&\s])\s*(dir|tree)\b[^|;&\n]*\/[srf]\b[^|;&\n]*["']?([a-z]:|\\\\|~)/i;

/**
 * Whole-disk access check (see the guardrail comment above).
 * @param {string} trimmed - Trimmed command line.
 * @returns {string|null} Block reason, or null when allowed.
 */
function rootAccessReason(trimmed) {
  if (CD_ROOT_PATTERN.test(trimmed)) {
    return "Command blocked: cd to a filesystem root, drive root, or home directory is not allowed. Stay in the current working folder and use relative or project-scoped paths.";
  }
  // Judge scanners on the command MINUS any cd segments: a scoped cd
  // (`cd /c/Code/my-app && find .`) is the sanctioned way to point a scan at
  // a project, and its absolute argument is not a scan target.
  const withoutCd = trimmed.replace(
    /(^|[;&|(]\s*|\bthen\s+)cd\s+("[^"]*"|'[^']*'|[^;&|]+)/gi,
    " "
  );
  if (
    (ROOT_SCAN_BINARIES.test(withoutCd) && ABSOLUTE_TOKEN.test(withoutCd)) ||
    WINDOWS_RECURSIVE_SCAN.test(withoutCd)
  ) {
    return "Command blocked: recursive scans from absolute paths are not allowed (whole-disk scans peg the host for minutes). cd into the target folder and scan relatively, or scan the current folder.";
  }
  return null;
}

/**
 * Server storage root (STORAGE_DIR-aware) for the persisted task registry.
 * The registry is server-owned state, not model-readable files, so it lives
 * next to the DB rather than in the agent sandbox.
 * @returns {string} Absolute storage path.
 */
function serverStorageRoot() {
  // Four levels up from this file's plugins/ dir (see terminalRoot) -
  // five lands on the repo root, which has never held storage.
  const devFallback = path.resolve(__dirname, "../../../../storage");
  if (process.env.NODE_ENV === "development") return devFallback;
  return path.resolve(process.env.STORAGE_DIR ?? devFallback, ".");
}

/**
 * Path of the persisted background-task registry file.
 * @returns {string} Absolute JSON path.
 */
function tasksStateFile() {
  return path.join(serverStorageRoot(), "terminal-tasks.json");
}

// Output snapshot kept per persisted task - bounded so the state file
// cannot grow without bound.
const PERSISTED_TAIL_CHARS = 4_000;
const PERSISTED_MAX_TASKS = 20;

/**
 * Loads persisted task snapshots from a previous process into the registry
 * as STALE entries (no live child handle). A poll after a restart then
 * reports the last-known snapshot honestly instead of "unknown task".
 * Corrupt/missing files start empty - never throw at require time.
 */
function loadPersistedTasks() {
  let raw;
  try {
    raw = fs.readFileSync(tasksStateFile(), "utf-8");
  } catch {
    return;
  }
  let entries;
  try {
    entries = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(entries)) return;
  for (const entry of entries.slice(-PERSISTED_MAX_TASKS)) {
    if (!entry || typeof entry.id !== "number") continue;
    if (backgroundTasks.has(entry.id)) continue;
    backgroundTasks.set(entry.id, {
      id: entry.id,
      label: String(entry.label ?? "task"),
      command: String(entry.command ?? ""),
      cwd: String(entry.cwd ?? ""),
      running: false,
      stale: true,
      exitCode: entry.exitCode ?? null,
      signal: entry.signal ?? null,
      timedOut: !!entry.timedOut,
      stopped: !!entry.stopped,
      stdout: String(entry.stdoutTail ?? ""),
      stderr: String(entry.stderrTail ?? ""),
      startedAt: Number(entry.startedAt) || Date.now(),
      endedAt: Number(entry.endedAt) || Date.now(),
      proc: null,
      timeoutId: null,
    });
    if (entry.id > backgroundTaskSeq) backgroundTaskSeq = entry.id;
  }
}

/**
 * Persists the registry (bounded snapshots) so a restart degrades to
 * last-known state instead of amnesia. Best-effort - never throws.
 */
function savePersistedTasks() {
  try {
    const entries = [...backgroundTasks.values()]
      .slice(-PERSISTED_MAX_TASKS)
      .map((task) => ({
        id: task.id,
        label: task.label,
        command: task.command,
        cwd: task.cwd,
        running: task.running,
        exitCode: task.exitCode,
        signal: task.signal,
        timedOut: task.timedOut,
        stopped: !!task.stopped,
        startedAt: task.startedAt,
        endedAt: task.endedAt,
        stdoutTail: task.stdout.slice(-PERSISTED_TAIL_CHARS),
        stderrTail: task.stderr.slice(-PERSISTED_TAIL_CHARS),
      }));
    fs.mkdirSync(path.dirname(tasksStateFile()), { recursive: true });
    fs.writeFileSync(tasksStateFile(), JSON.stringify(entries));
  } catch {
    // Registry persistence is best-effort - the live map stands either way.
  }
}

// Hydrate stale snapshots from a previous process (if any) so a poll after
// a server restart reports last-known state instead of "unknown task".
loadPersistedTasks();
/**
 * Starts a shell command in the background: returns immediately with a task
 * id the model polls via `task-output` and ends via `task-stop`. Long builds,
 * dev servers, and test suites run while the model does other steps instead
 * of blocking the turn - the main wall-clock win on slow local inference.
 * @param {string} command - Shell command line to execute.
 * @param {object} [opts]
 * @param {string} opts.cwd - Working directory (resolved caller-side).
 * @param {string} [opts.label] - Short label override.
 * @returns {{ok: boolean, taskId?: number, error?: string}} Start result.
 */
function startBackgroundTask(command, { cwd, label } = {}) {
  const trimmed = String(command ?? "").trim();
  if (!trimmed) return { ok: false, error: "No command provided." };
  const blocked = deniedReason(trimmed);
  if (blocked) return { ok: false, error: blocked };
  if (!cwd) return { ok: false, error: "No working directory provided." };

  const { command: shell, preArgs } = resolveShell();
  const timeout = commandTimeoutMs();
  let proc;
  try {
    proc = spawn(shell, [...preArgs, trimmed], {
      cwd,
      windowsHide: true,
    });
  } catch (error) {
    return { ok: false, error: `Failed to spawn: ${error?.message}` };
  }

  // Evict finished tasks past the cap so the registry cannot grow without
  // bound across a long session. Evicts repeatedly (not just one) so a burst
  // of quick starts settles back under the cap on the next start.
  while (backgroundTasks.size >= BG_MAX_TASKS) {
    const evictable = [...backgroundTasks.values()].find((t) => !t.running);
    if (!evictable) break;
    backgroundTasks.delete(evictable.id);
  }

  const id = ++backgroundTaskSeq;
  const task = {
    id,
    label: label || summarizeCommand(trimmed),
    command: trimmed,
    cwd,
    running: true,
    exitCode: null,
    signal: null,
    timedOut: false,
    stdout: "",
    stderr: "",
    startedAt: Date.now(),
    endedAt: null,
    proc,
    timeoutId: null,
  };
  const append = (stream, chunk) => {
    task[stream] += chunk.toString();
    if (task[stream].length > BG_STREAM_MAX_CHARS)
      task[stream] = task[stream].slice(-BG_STREAM_MAX_CHARS);
  };
  proc.stdout?.on("data", (chunk) => append("stdout", chunk));
  proc.stderr?.on("data", (chunk) => append("stderr", chunk));
  const finish = (code, signal, timedOut) => {
    if (!task.running) return;
    task.running = false;
    task.exitCode = code;
    task.signal = signal ?? null;
    task.timedOut = !!timedOut;
    task.endedAt = Date.now();
    if (task.timeoutId) clearTimeout(task.timeoutId);
    savePersistedTasks();
  };
  proc.on("error", () => finish(null, null, false));
  proc.on("close", (code, signal) => finish(code, signal, false));
  task.timeoutId = setTimeout(() => {
    if (!task.running) return;
    try {
      proc.kill("SIGKILL");
    } catch {
      // Already exited between the check and the kill.
    }
    finish(null, "SIGKILL", true);
  }, timeout);
  task.timeoutId.unref?.();

  backgroundTasks.set(id, task);
  savePersistedTasks();
  return { ok: true, taskId: id };
}

/**
 * Polls a background task: current status plus the output tail. Detecting a
 * finished task here is also what closes its session row (see handler).
 * @param {number|string} id - Task id from startBackgroundTask.
 * @param {object} [opts]
 * @param {number} [opts.tailChars] - Tail window per stream.
 * @returns {object} Status envelope (ok:false when unknown).
 */
function pollBackgroundTask(id, { tailChars = BG_DEFAULT_TAIL_CHARS } = {}) {
  const task = backgroundTasks.get(Number(id));
  if (!task) {
    const known = [...backgroundTasks.keys()];
    return {
      ok: false,
      error: `Unknown background task ${id}. Known tasks: ${known.length > 0 ? known.join(", ") : "(none - the registry restarts from persisted snapshots, older tasks are forgotten)"}.`,
    };
  }
  const tail = Math.max(
    500,
    Math.min(20_000, Number(tailChars) || BG_DEFAULT_TAIL_CHARS)
  );
  return {
    ok: true,
    taskId: task.id,
    label: task.label,
    running: task.running,
    ...(task.stale
      ? {
          stale: true,
          note: "The server restarted since this task ran, so the live process handle is gone. This is the last persisted snapshot, not live state - re-run the command if you need a live result.",
        }
      : {}),
    exitCode: task.exitCode,
    signal: task.signal,
    timedOut: task.timedOut,
    durationMs: (task.endedAt ?? Date.now()) - task.startedAt,
    stdoutTail: task.stdout.slice(-tail),
    stderrTail: task.stderr.slice(-tail),
    stdoutChars: task.stdout.length,
    stderrChars: task.stderr.length,
  };
}

/**
 * Stops a running background task (SIGKILL) and returns its final status.
 * Stopping a finished task is a no-op that re-reports the final state.
 *
 * Finalizes synchronously instead of waiting for the child's `close` event:
 * forked grandchildren (npm/sleep/servers) inherit the stdio pipes, so
 * `close` may not fire until they exit on their own. The kill targets the
 * task's shell; grandchildren may outlive it (OS-dependent) - documented,
 * not waited on, or a stop could hang as long as the run it ends.
 * @param {number|string} id - Task id.
 * @returns {object} Final status envelope (ok:false when unknown).
 */
function stopBackgroundTask(id) {
  const task = backgroundTasks.get(Number(id));
  if (!task) return pollBackgroundTask(id);
  if (task.running) {
    try {
      task.proc.kill("SIGKILL");
    } catch {
      // Exited between lookup and kill - finalized below regardless.
    }
    // Release our pipe ends so a lingering grandchild cannot hold the
    // task's streams (and the test sandbox dir) open.
    try {
      task.proc.stdout?.destroy();
    } catch {}
    try {
      task.proc.stderr?.destroy();
    } catch {}
    task.running = false;
    task.exitCode = null;
    task.signal = "SIGKILL";
    task.stopped = true;
    task.endedAt = Date.now();
    if (task.timeoutId) clearTimeout(task.timeoutId);
    savePersistedTasks();
  }
  return pollBackgroundTask(id);
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

  const blocked = deniedReason(trimmed);
  if (blocked) return { ok: false, error: blocked };

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
        const rawOut = String(stdout ?? "");
        const rawErr = String(stderr ?? "");
        const out = projectText(rawOut, MAX_STDOUT_CHARS, HEAD_CHARS);
        const err = projectText(rawErr, MAX_STDERR_CHARS, STDERR_HEAD_CHARS);
        // Truncated output is spilled to disk with a pointer instead of being
        // lost: the model sees a bounded window inline and can read more with
        // the file tools only when it needs to. Without the spill the choice
        // would be "truncate blind" vs "dump 24k chars into context".
        let outputFile = null;
        let stdoutText = out.text;
        let stderrText = err.text;
        if (out.truncated || err.truncated) {
          outputFile = spillText(
            spillDirForRoot(root),
            `exit-${typeof exitCode === "number" ? exitCode : "err"}`,
            `--- stdout ---\n${rawOut}\n--- stderr ---\n${rawErr}`
          );
          if (outputFile) {
            const pointer = `\n[Full output spilled to ${outputFile} - read it with the file tools if you need more than this window.]`;
            if (out.truncated) stdoutText += pointer;
            else stderrText += pointer;
          }
        }
        resolve({
          ok: typeof exitCode === "number",
          exitCode,
          signal: error?.signal ?? null,
          timedOut: error?.killed === true,
          stdout: stdoutText,
          stderr: stderrText,
          truncated: out.truncated || err.truncated,
          outputFile,
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
            "chain commands with && (e.g. 'cd backend && ls') instead of relying on cd persisting. " +
            "Servers need wall-clock seconds to bind: after starting one, wait (sleep) before curling it, " +
            "and retry the same curl before assuming it failed.",
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
              // ZCode-style projects: a folder-bound workspace runs inside
              // its own folder; unbound workspaces use the global root.
              const workdirRoot = await workdirForInvocation(
                this.super.handlerProps
              );
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

        // Background tasks: start a command without blocking the turn, poll
        // its output with task-output, end it with task-stop. Sessions reuse
        // the same sessionCard rows/panel as foreground runs, so no frontend
        // change is needed - a background row simply stays `running` across
        // polls until it finishes or is stopped.
        const bgGate = async (handler) => {
          if (!(await isEnabled())) {
            return "Error: the terminal skill is disabled on this server. Enable it via AGENT_ENABLE_TERMINAL=1 or the in-app terminal_agent_enabled setting.";
          }
          return handler();
        };
        const finishBgSession = (sessionId, socket, poll) =>
          finishBackgroundSession(sessionId, socket, poll);

        aibitat.function({
          super: aibitat,
          name: "terminal-task-start",
          description:
            "Start a shell command in the BACKGROUND and return immediately with a task id - it does NOT block your turn. " +
            "Use it for long builds, installs, dev servers, and test suites, then do other steps and poll with task-output. " +
            "Start ONE task per call. Same working directory and safety filter as terminal-agent. " +
            "Background tasks need wall-clock time: do other steps (or sleep) before polling - polling faster changes nothing.",
          examples: [
            {
              prompt:
                "Install dependencies in the background while I review the code",
              call: JSON.stringify({ command: "npm install" }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              command: {
                type: "string",
                description: "The shell command to run in the background.",
              },
            },
            required: ["command"],
            additionalProperties: false,
          },
          handler: async function ({ command = "" }) {
            return bgGate(async () => {
              if (this.super.requestToolApproval) {
                const approval = await this.super.requestToolApproval({
                  skillName: "terminal-agent",
                  payload: { command, background: true },
                  description: "Start a background shell task",
                });
                if (!approval.approved) {
                  this.super.introspect(
                    `${this.caller}: User rejected the background task request.`
                  );
                  return approval.message;
                }
              }
              const workdirRoot = await workdirForInvocation(
                this.super.handlerProps
              );
              const started = startBackgroundTask(command, {
                cwd: workdirRoot,
              });
              if (!started.ok) return `Error: ${started.error}`;
              const sessions = require("./sessions.js");
              const session = sessions.startSession({
                kind: "terminal",
                label: `& ${summarizeCommand(command)}`,
                detail: `$ ${String(command ?? "").trim()}\n(background task ${started.taskId})\n`,
                category: categorizeCommand(command),
              });
              this.super.socket?.send?.("sessionCard", { ...session });
              this.super.handlerProps.log(
                `Started background task ${started.taskId}: ${summarizeCommand(command)}`
              );
              this.super.introspect(
                `${this.caller}: Started background task ${started.taskId}.`
              );
              // Stash the session id on the task for completion updates.
              const task = backgroundTasks.get(started.taskId);
              if (task) task.sessionId = session.id;
              // Stamp the owning run so the run-end sweep can close this
              // row if the model never polls (settleFinishedBackgroundTasks).
              if (task)
                task.runKey =
                  this.super.handlerProps?.invocation?.workspace_id ?? null;
              return JSON.stringify({
                ok: true,
                taskId: started.taskId,
                hint: `Poll progress with task-output (taskId ${started.taskId}); end it with task-stop. The task keeps running while you do other steps.`,
              });
            });
          },
        });

        aibitat.function({
          super: aibitat,
          name: "task-output",
          description:
            "Poll a background task started by terminal-task-start: status plus the output tail. " +
            "Call it after doing other work, or to check whether a build/server is ready. No approval needed. " +
            "Call this TOOL with the numeric taskId - never run `task-output <id>` as a shell command. " +
            "A starting/running task needs more wall-clock time: sleep or do other steps before polling again.",
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              taskId: {
                type: "number",
                description: "The task id returned by terminal-task-start.",
              },
              tailChars: {
                type: "number",
                description:
                  "Output tail window per stream (default 6000, max 20000).",
              },
            },
            required: ["taskId"],
            additionalProperties: false,
          },
          handler: async function ({ taskId, tailChars } = {}) {
            return bgGate(async () => {
              const poll = pollBackgroundTask(taskId, { tailChars });
              if (!poll.ok) return `Error: ${poll.error}`;
              // Still-running polls carry a backoff hint: fast models poll
              // faster than servers boot and misread "not yet up" as
              // failure, so the result itself says to wait.
              if (poll.running)
                poll.hint =
                  "Still running - sleep or do other steps before polling again; polling faster changes nothing.";
              const task = backgroundTasks.get(Number(taskId));
              // First poll that observes completion closes the session row.
              if (!poll.running && task && !task.sessionClosed) {
                task.sessionClosed = true;
                if (task.sessionId != null)
                  finishBgSession(task.sessionId, this.super.socket, poll);
                this.super.introspect(
                  `${this.caller}: Background task ${poll.taskId} finished (exit ${poll.exitCode ?? "?"}).`
                );
              }
              return JSON.stringify(poll);
            });
          },
        });

        aibitat.function({
          super: aibitat,
          name: "task-stop",
          description:
            "Stop a running background task started by terminal-task-start and report its final status. " +
            "Stopping an already-finished task just re-reports the final state. No approval needed.",
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              taskId: {
                type: "number",
                description: "The task id returned by terminal-task-start.",
              },
            },
            required: ["taskId"],
            additionalProperties: false,
          },
          handler: async function ({ taskId } = {}) {
            return bgGate(async () => {
              const poll = stopBackgroundTask(taskId);
              if (!poll.ok) return `Error: ${poll.error}`;
              const task = backgroundTasks.get(Number(taskId));
              if (task && !task.sessionClosed) {
                task.sessionClosed = true;
                if (task.sessionId != null)
                  finishBgSession(task.sessionId, this.super.socket, poll);
              }
              this.super.introspect(
                `${this.caller}: Background task ${poll.taskId} stopped (exit ${poll.exitCode ?? "?"}).`
              );
              return JSON.stringify(poll);
            });
          },
        });
      },
    };
  },
};

/**
 * Finishes a background task's session entry and mirrors it to the frontend
 * panel. Module-level so both the task-output/task-stop handlers and the
 * run-end sweep (settleFinishedBackgroundTasks) close rows through one path -
 * a row otherwise stays `running` forever when the model never polls.
 * @param {number|null} sessionId - registry id from startSession (null skips)
 * @param {object} socket - aibitat socket for sessionCard events
 * @param {object} poll - pollBackgroundTask envelope for the finished task
 */
function finishBackgroundSession(sessionId, socket, poll = {}) {
  if (sessionId == null) return;
  const sessions = require("./sessions.js");
  const tail = [
    poll.stdoutTail ? `--- stdout (tail) ---\n${poll.stdoutTail}` : "",
    poll.stderrTail ? `--- stderr (tail) ---\n${poll.stderrTail}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(-4000);
  const status = poll.timedOut ? "error" : "done";
  sessions.finishSession(
    sessionId,
    status,
    `\n--- background task ${poll.taskId} ${poll.timedOut ? "timed out" : `exit ${poll.exitCode ?? "?"}`} in ${poll.durationMs ?? 0}ms ---\n${tail}`
  );
  const current = sessions
    .listSessions()
    .find((entry) => entry.id === sessionId);
  if (current) socket?.send?.("sessionCard", { ...current });
}

/**
 * Run-end sweep for background tasks. A model that starts tasks but never
 * polls them (common for instant commands run in the background) leaves
 * their Sessions rows `running` forever - including in the persisted trace,
 * where reload replays the stale state. This closes rows for tasks that
 * already finished; still-running tasks (servers, watchers) are untouched
 * so long-lived work survives the run that spawned it.
 * @param {any} runKey - stamp matching the run's tasks (workspace_id; null
 *   when the invocation carries none). Tasks stamped for another run are
 *   never touched - only their own run's sweep may close them.
 * @param {object|null} socket - aibitat socket for the closing sessionCards
 * @returns {number} Count of rows settled.
 */
function settleFinishedBackgroundTasks(runKey, socket = null) {
  let settled = 0;
  for (const [taskId, task] of backgroundTasks) {
    if (!task || task.sessionClosed || task.stale) continue;
    // Unstamped tasks predate the runKey stamp or belong to another run.
    if (task.runKey !== runKey) continue;
    let poll;
    try {
      poll = pollBackgroundTask(taskId);
    } catch {
      continue;
    }
    if (!poll.ok || poll.running) continue;
    task.sessionClosed = true;
    if (task.sessionId != null) {
      try {
        finishBackgroundSession(task.sessionId, socket, poll);
        settled++;
      } catch {
        // Best-effort UI - a stuck row must never break run teardown.
      }
    }
  }
  return settled;
}

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
  workdirForInvocation,
  capOutput,
  commandTimeoutMs,
  summarizeCommand,
  categorizeCommand,
  isReadOnlyCommand,
  deniedReason,
  rootAccessReason,
  snapshotWorkdir,
  detectWorkdirChanges,
  emitWorkdirFileCards,
  finishTerminalSession,
  SUMMARY_MAX_CHARS,
  DENIED_COMMAND_PATTERNS,
  MAX_STDOUT_CHARS,
  MAX_STDERR_CHARS,
  SETTING_ENABLED_KEY,
  SETTING_ROOT_KEY,
  startBackgroundTask,
  pollBackgroundTask,
  stopBackgroundTask,
  backgroundTasks,
  finishBackgroundSession,
  settleFinishedBackgroundTasks,
  loadPersistedTasks,
  savePersistedTasks,
  tasksStateFile,
  BG_MAX_TASKS,
};
