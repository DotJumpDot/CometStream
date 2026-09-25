/**
 * Tests for the terminal agent skill: env gating, command execution,
 * safety denylist, output capping, timeout clamping, and root resolution.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
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
  startBackgroundTask,
  pollBackgroundTask,
  stopBackgroundTask,
  backgroundTasks,
  settleFinishedBackgroundTasks,
  snapshotWorkdir,
  detectWorkdirChanges,
  emitWorkdirFileCards,
  MAX_STDOUT_CHARS,
  MAX_STDERR_CHARS,
  DENIED_COMMAND_PATTERNS,
} = require("../../../../../utils/agents/aibitat/plugins/terminal");

jest.mock("../../../../../models/systemSettings", () => ({
  SystemSettings: {
    getValueOrFallback: jest.fn(async () => "false"),
  },
}));
const {
  SystemSettings,
} = require("../../../../../models/systemSettings");

describe("terminal agent skill", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.AGENT_ENABLE_TERMINAL;
    delete process.env.AGENT_TERMINAL_ROOT;
    delete process.env.AGENT_TERMINAL_TIMEOUT_MS;
    delete process.env.AGENT_TERMINAL_SHELL;
    jest.clearAllMocks();
    SystemSettings.getValueOrFallback.mockResolvedValue("false");
  });

  afterAll(() => {
    process.env = originalEnv;
    // Belt-and-braces orphan sweep: stop every task still in the registry so
    // a failing test cannot leave spawned shells alive. Tests that spawn
    // long-running commands use finite sleeps (see those tests) so even a
    // SIGKILLed jest leaves only idle, self-expiring children behind - never
    // a `while true` spin burning a core.
    for (const id of [...backgroundTasks.keys()]) {
      try {
        stopBackgroundTask(id);
      } catch {}
    }
  });

  describe("isToolAvailable", () => {
    it("is disabled unless the operator opted in via env", () => {
      expect(isToolAvailable()).toBe(false);
      process.env.AGENT_ENABLE_TERMINAL = "1";
      expect(isToolAvailable()).toBe(true);
      process.env.AGENT_ENABLE_TERMINAL = "0";
      expect(isToolAvailable()).toBe(false);
    });
  });

  describe("terminalRoot", () => {
    it("prefers AGENT_TERMINAL_ROOT when set", () => {
      process.env.AGENT_TERMINAL_ROOT = path.join(os.tmpdir(), "cs-term-root");
      expect(terminalRoot()).toBe(path.resolve(process.env.AGENT_TERMINAL_ROOT));
    });

    it("falls back to the agent filesystem sandbox", () => {
      const root = terminalRoot();
      expect(root).toBe(path.resolve(root));
      expect(path.basename(root)).toBe("anythingllm-fs");
    });
  });

  describe("isEnabled (env or in-app setting)", () => {
    it("is true via ENV without touching the DB", async () => {
      process.env.AGENT_ENABLE_TERMINAL = "1";
      expect(await isEnabled()).toBe(true);
      expect(SystemSettings.getValueOrFallback).not.toHaveBeenCalled();
    });

    it("falls back to the terminal_agent_enabled system setting", async () => {
      SystemSettings.getValueOrFallback.mockResolvedValue("true");
      expect(await isEnabled()).toBe(true);
      expect(SystemSettings.getValueOrFallback).toHaveBeenCalledWith(
        { label: "terminal_agent_enabled" },
        "false"
      );
    });

    it("stays disabled when neither ENV nor setting opts in", async () => {
      expect(await isEnabled()).toBe(false);
    });

    it("fails closed when the settings lookup throws", async () => {
      SystemSettings.getValueOrFallback.mockRejectedValue(
        new Error("db down")
      );
      expect(await isEnabled()).toBe(false);
    });
  });

  describe("terminalRootAsync", () => {
    it("prefers AGENT_TERMINAL_ROOT over the in-app setting", async () => {
      const envRoot = path.join(os.tmpdir(), "cs-term-env");
      process.env.AGENT_TERMINAL_ROOT = envRoot;
      SystemSettings.getValueOrFallback.mockResolvedValue("C:\\other");
      expect(await terminalRootAsync()).toBe(path.resolve(envRoot));
      expect(SystemSettings.getValueOrFallback).not.toHaveBeenCalled();
    });

    it("uses the terminal_agent_root setting when ENV is unset", async () => {
      const settingRoot = path.join(os.tmpdir(), "cs-term-setting");
      SystemSettings.getValueOrFallback.mockResolvedValue(settingRoot);
      expect(await terminalRootAsync()).toBe(path.resolve(settingRoot));
    });

    it("falls back to the sandbox when nothing is configured", async () => {
      const root = await terminalRootAsync();
      expect(path.basename(root)).toBe("anythingllm-fs");
    });
  });

  describe("workdirForInvocation (folder-bound projects)", () => {
    it("uses the global root for unbound (legacy) workspaces", async () => {
      const root = await terminalRootAsync();
      expect(await workdirForInvocation({})).toBe(root);
      expect(
        await workdirForInvocation({ invocation: { workspace: {} } })
      ).toBe(root);
      expect(
        await workdirForInvocation({
          invocation: { workspace: { projectPath: null } },
        })
      ).toBe(root);
    });

    it("runs inside the bound project folder and creates it", async () => {
      process.env.AGENT_TERMINAL_ROOT = fs.mkdtempSync(
        path.join(os.tmpdir(), "cs-term-proj-")
      );
      const root = await terminalRootAsync();
      const dir = await workdirForInvocation({
        invocation: { workspace: { projectPath: path.join(root, "site") } },
      });
      expect(dir).toBe(path.join(root, "site"));
      expect(fs.statSync(dir).isDirectory()).toBe(true);
    });

    it("degrades to the global root when the binding escapes the jail", async () => {
      process.env.AGENT_TERMINAL_ROOT = fs.mkdtempSync(
        path.join(os.tmpdir(), "cs-term-jail-")
      );
      const root = await terminalRootAsync();
      const outside = path.join(os.tmpdir(), "cs-term-evil");
      const dir = await workdirForInvocation({
        invocation: { workspace: { projectPath: outside } },
      });
      expect(dir).toBe(root);
      expect(fs.existsSync(outside)).toBe(false);
    });
  });
  describe("commandTimeoutMs", () => {
    it("defaults to 120s and clamps to [5s, 600s]", () => {
      expect(commandTimeoutMs()).toBe(120_000);
      process.env.AGENT_TERMINAL_TIMEOUT_MS = "1000";
      expect(commandTimeoutMs()).toBe(5_000);
      process.env.AGENT_TERMINAL_TIMEOUT_MS = "999999";
      expect(commandTimeoutMs()).toBe(600_000);
      process.env.AGENT_TERMINAL_TIMEOUT_MS = "30000";
      expect(commandTimeoutMs()).toBe(30_000);
    });
  });

  describe("capOutput", () => {
    it("returns short text unchanged", () => {
      expect(capOutput("hello")).toBe("hello");
    });

    it("truncates long text with a marker, keeping head and tail", () => {
      const text = "a".repeat(50_000);
      const capped = capOutput(text);
      expect(capped.length).toBeLessThan(20_000);
      expect(capped).toContain("chars truncated]");
      expect(capped.startsWith("a")).toBe(true);
      expect(capped.endsWith("a")).toBe(true);
    });
  });

  describe("resolveShell", () => {
    it("returns a spawnable shell with fixed pre-args", () => {
      const shell = resolveShell();
      expect(typeof shell.command).toBe("string");
      expect(shell.command.length).toBeGreaterThan(0);
      expect(shell.preArgs.length).toBe(1);
    });
  });

  describe("runCommand", () => {
    let sandbox;

    beforeEach(() => {
      sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "cs-terminal-"));
      process.env.AGENT_ENABLE_TERMINAL = "1";
      process.env.AGENT_TERMINAL_ROOT = sandbox;
    });

    afterEach(() => {
      fs.rmSync(sandbox, { recursive: true, force: true });
    });

    it("rejects an empty command", async () => {
      const result = await runCommand("   ");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("No command provided");
    });

    it("refuses commands on the denylist", async () => {
      for (const command of [
        "shutdown /r /t 0",
        "format C:",
        "rm -rf /",
        "echo hi && diskpart",
      ]) {
        const result = await runCommand(command);
        expect(result.ok).toBe(false);
        expect(result.error).toContain("safety filter");
      }
    });

    it("runs a simple echo command and reports the result envelope", async () => {
      const result = await runCommand("echo cometstream-terminal-ok");
      expect(result.ok).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toLowerCase()).toContain(
        "cometstream-terminal-ok"
      );
      expect(result.cwd).toBe(sandbox);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("honors an explicit cwd override (in-app root)", async () => {
      const override = fs.mkdtempSync(path.join(os.tmpdir(), "cs-terminal-"));
      try {
        const result = await runCommand("echo override-ok", {
          cwd: override,
        });
        expect(result.ok).toBe(true);
        expect(result.cwd).toBe(override);
        expect(result.stdout.toLowerCase()).toContain("override-ok");
      } finally {
        fs.rmSync(override, { recursive: true, force: true });
      }
    });

    it("reports a non-zero exit code without throwing", async () => {
      const result = await runCommand("exit 3");
      expect(result.ok).toBe(true);
      expect(result.exitCode).toBe(3);
    });

    it("kills commands that exceed the timeout", async () => {
      process.env.AGENT_TERMINAL_TIMEOUT_MS = "5000";
      const result = await runCommand("sleep 30");
      expect(result.timedOut).toBe(true);
      expect(result.durationMs).toBeLessThan(15_000);
    }, 30_000);

    it("marks short output untruncated with no spill file", async () => {
      const result = await runCommand("echo spill-check-ok");
      expect(result.truncated).toBe(false);
      expect(result.outputFile).toBeNull();
      expect(result.stdout).toContain("spill-check-ok");
    });

    it("spills long output to disk with a pointer instead of losing it", async () => {
      const result = await runCommand(
        "for i in $(seq 1 3000); do echo line-$i-padding-to-grow-output; done"
      );
      expect(result.ok).toBe(true);
      expect(result.truncated).toBe(true);
      expect(result.stdout).toContain("chars truncated]");
      expect(result.stdout).toContain("spilled to");
      expect(typeof result.outputFile).toBe("string");
      const spilled = fs.readFileSync(result.outputFile, "utf-8");
      expect(spilled).toContain("line-1-");
      expect(spilled).toContain("line-3000-");
      // Spills live in a hidden dir the workdir snapshot ignores.
      expect(result.outputFile).toContain(".terminal-outputs");
    }, 30_000);
  });

  describe("summarizeCommand", () => {
    it("leaves short commands untouched", () => {
      expect(summarizeCommand("echo hello")).toBe("echo hello");
      expect(summarizeCommand("cd backend && python -m uvicorn main:app")).toBe(
        "cd backend && python -m uvicorn main:app"
      );
    });

    it("collapses heredoc bodies to a line count", () => {
      const cmd = [
        "cat > backend/main.py << 'EOF'",
        "from fastapi import FastAPI",
        "app = FastAPI()",
        "print('hi')",
        "EOF",
        "echo written",
      ].join("\n");
      const summary = summarizeCommand(cmd);
      expect(summary).not.toContain("FastAPI");
      expect(summary).toContain("…(3 heredoc lines)");
      expect(summary).toContain("cat > backend/main.py");
      expect(summary).toContain("echo written");
      expect(summary.split("\n")).toHaveLength(1);
    });

    it("handles double-quoted and bare delimiters", () => {
      const cmd = 'cat > f << "DONE"\nline1\nline2\nDONE';
      expect(summarizeCommand(cmd)).toContain("…(2 heredoc lines)");
      const bare = "cat > f << EOF\na\nEOF";
      expect(summarizeCommand(bare)).toContain("…(1 heredoc lines)");
    });

    it("leaves unterminated heredocs alone (still capped)", () => {
      const cmd = `cat > f << 'EOF'\n${"x".repeat(500)}`;
      const summary = summarizeCommand(cmd);
      expect(summary.length).toBeLessThanOrEqual(200);
    });

    it("caps very long single lines", () => {
      const summary = summarizeCommand(`echo ${"a".repeat(500)}`);
      expect(summary.length).toBeLessThanOrEqual(200);
      expect(summary.endsWith("…")).toBe(true);
    });
  });

  describe("DENIED_COMMAND_PATTERNS", () => {
    it("matches host-wrecking commands case-insensitively", () => {
      const combined = new RegExp(
        DENIED_COMMAND_PATTERNS.map((p) => p.source).join("|"),
        "i"
      );
      expect(combined.test("SHUTDOWN /s")).toBe(true);
      expect(combined.test("mkfs.ext4 /dev/sda1")).toBe(true);
      expect(combined.test("echo hello world")).toBe(false);
      expect(combined.test("npm install fastapi")).toBe(false);
    });

    it("blocks the expanded wipe/brick class", () => {
      const combined = new RegExp(
        DENIED_COMMAND_PATTERNS.map((p) => p.source).join("|"),
        "i"
      );
      for (const command of [
        "sudo dd if=image.iso of=/dev/sda bs=4M",
        "wipefs -a /dev/sdb",
        "cipher /w:C:\\",
        "bcdedit /set bootmenupolicy legacy",
        ":(){ :|:& };:",
        "rm -rf /etc/nginx",
        "rm -r /usr/local/bin --no-preserve-root",
        "rm -fr /var/log/syslog",
        "del C:\\Windows\\System32\\cmd.exe",
        "Remove-Item -Recurse -Force C:\\",
      ]) {
        expect(combined.test(command)).toBe(true);
      }
    });

    it("keeps legitimate workspace commands allowed", () => {
      const combined = new RegExp(
        DENIED_COMMAND_PATTERNS.map((p) => p.source).join("|"),
        "i"
      );
      for (const command of [
        "rm -rf ./build && npm run build",
        "rm -r src/old-module",
        "rm -rf /tmp/cs-terminal-scratch",
        "git reset --hard HEAD~1",
        "curl -s http://127.0.0.1:8000/api/health",
        "py -m pip install fastapi uvicorn",
        "echo 'format the code with prettier' && npx prettier -w .",
        "mkdir -p /tmp/scratch && dd if=/dev/zero of=./blank.img bs=1k count=1",
      ]) {
        expect(combined.test(command)).toBe(false);
      }
    });
  });

  describe("root access guardrail (deniedReason)", () => {
    it("blocks the real-world runaway root scan", () => {
      // A spawned agent command observed in the wild: cd to the filesystem
      // root then find - a 30+ minute whole-disk burn.
      expect(deniedReason('cd / && find . -path ./app -prune -o -name "main.py" -print')).toContain(
        "filesystem root"
      );
    });

    it.each([
      "find / -name main.py",
      "find C:\\ -name main.py",
      "grep -r password /",
      "rg secret /",
      "du -sh /",
      "dir /s C:\\",
      "tree /f ~",
      "Get-ChildItem C:\\ -Recurse",
      "Get-ChildItem C:\\Users -Recurse",
      "cd /",
      "cd /c",
      "cd C:\\",
      "cd ~ && du -sh .",
      "echo x && cd / ; ls",
      "dir /s /b C:\\Users",
    ])("blocks whole-disk access: %p", (command) => {
      expect(deniedReason(command)).not.toBeNull();
    });

    it.each([
      "find . -name main.py",
      "grep -r TODO src/",
      "rg pattern .",
      "du -sh .",
      "ls -la",
      "dir /s src\\components",
      "cd /c/Code/my-app && find . -name main.py",
      "cd .. && ls",
      "cd backend && python -m app.main",
      "tree backend",
    ])("allows scoped project work: %p", (command) => {
      expect(deniedReason(command)).toBeNull();
    });
  });
});

describe("background tasks", () => {
  let sandbox;
  let stateDir;

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "cs-term-bg-"));
    process.env.AGENT_TERMINAL_ROOT = sandbox;
    // Redirect the persisted task registry away from real storage.
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "cs-term-state-"));
    process.env.STORAGE_DIR = stateDir;
  });

  afterEach(() => {
    for (const task of backgroundTasks.values()) {
      try {
        if (task.running) task.proc.kill("SIGKILL");
      } catch {
        // Already exited.
      }
    }
    backgroundTasks.clear();
    delete process.env.STORAGE_DIR;
    fs.rmSync(stateDir, { recursive: true, force: true });
    // Windows releases a killed process's cwd handle asynchronously - retry
    // the sandbox removal instead of racing it.
    let lastError = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        fs.rmSync(sandbox, { recursive: true, force: true });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);
      }
    }
    if (lastError) throw lastError;
  });

  async function waitForSettled(id, timeoutMs = 10_000) {
    const start = Date.now();
    for (;;) {
      const poll = pollBackgroundTask(id);
      if (!poll.ok || !poll.running) return poll;
      if (Date.now() - start > timeoutMs)
        throw new Error(`background task ${id} still running`);
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  it("refuses denylisted commands and requires a cwd", () => {
    expect(startBackgroundTask("shutdown /s", { cwd: sandbox }).ok).toBe(false);
    expect(startBackgroundTask("echo hi", {}).ok).toBe(false);
    expect(startBackgroundTask("   ", { cwd: sandbox }).ok).toBe(false);
  });

  it("runs to completion with a pollable output tail", async () => {
    const started = startBackgroundTask("echo bg-ok && echo err-line >&2", {
      cwd: sandbox,
    });
    expect(started.ok).toBe(true);
    const final = await waitForSettled(started.taskId);
    expect(final.running).toBe(false);
    expect(final.exitCode).toBe(0);
    expect(final.stdoutTail).toContain("bg-ok");
    expect(final.stderrTail).toContain("err-line");
    expect(final.durationMs).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it("reports unknown task ids honestly", () => {
    const poll = pollBackgroundTask(999_999_999);
    expect(poll.ok).toBe(false);
    expect(poll.error).toContain("Unknown background task");
    expect(stopBackgroundTask(999_999_999).ok).toBe(false);
  });

  it("stops a running task on request", async () => {
    // A finite sleep, not a `while true` spin: the stop path kills only the
    // shell, so the `sleep` child can be orphaned if jest dies before the
    // assertion - an orphaned sleep is idle and expires on its own, while an
    // orphaned spin would burn a core until reboot (seen in the wild).
    const started = startBackgroundTask("sleep 600", {
      cwd: sandbox,
    });
    expect(started.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 1500));
    expect(pollBackgroundTask(started.taskId).running).toBe(true);
    const stopped = stopBackgroundTask(started.taskId);
    expect(stopped.running).toBe(false);
    expect(stopped.signal).toBe("SIGKILL");
    // Stopping a finished task re-reports the final state.
    expect(stopBackgroundTask(started.taskId).running).toBe(false);
  }, 30_000);

  it("kills tasks that exceed the timeout", async () => {
    process.env.AGENT_TERMINAL_TIMEOUT_MS = "5000";
    // Finite sleep for the same orphan-safety reason as the stop test: a
    // SIGKILLed jest must never leave an infinite spin behind.
    const started = startBackgroundTask("sleep 600", {
      cwd: sandbox,
    });
    const final = await waitForSettled(started.taskId, 20_000);
    expect(final.running).toBe(false);
    expect(final.timedOut).toBe(true);
  }, 30_000);

  it("caps the registry by evicting finished tasks", async () => {
    for (let i = 0; i < 25; i++) {
      const started = startBackgroundTask(`echo evict-${i}`, { cwd: sandbox });
      expect(started.ok).toBe(true);
    }
    await new Promise((r) => setTimeout(r, 3000));
    const extra = startBackgroundTask("echo one-more", { cwd: sandbox });
    expect(extra.ok).toBe(true);
    expect(backgroundTasks.size).toBeLessThanOrEqual(20);
    await waitForSettled(extra.taskId);
  }, 30_000);

  it("persists snapshots so a restart degrades instead of forgetting", async () => {
    const {
      loadPersistedTasks,
      tasksStateFile,
    } = require("../../../../../utils/agents/aibitat/plugins/terminal");
    const started = startBackgroundTask("echo persist-me", { cwd: sandbox });
    expect(started.ok).toBe(true);
    await waitForSettled(started.taskId);
    // The finished task snapshot reached the state file.
    expect(fs.existsSync(tasksStateFile())).toBe(true);

    // Simulate a server restart: drop the live map, reload from disk.
    backgroundTasks.clear();
    loadPersistedTasks();
    const poll = pollBackgroundTask(started.taskId);
    expect(poll.ok).toBe(true);
    expect(poll.running).toBe(false);
    expect(poll.stale).toBe(true);
    expect(poll.stdoutTail).toContain("persist-me");
    expect(poll.note).toContain("restarted");
    // Stopping a stale snapshot re-reports instead of erroring.
    expect(stopBackgroundTask(started.taskId).running).toBe(false);
  }, 30_000);
});

describe("settleFinishedBackgroundTasks (run-end sweep)", () => {
  let sandbox;
  let stateDir;
  const sessions = require("../../../../../utils/agents/aibitat/plugins/sessions");

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "cs-term-settle-"));
    process.env.AGENT_TERMINAL_ROOT = sandbox;
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "cs-term-settle-state-"));
    process.env.STORAGE_DIR = stateDir;
    sessions.clearSessions();
  });

  afterEach(() => {
    for (const task of backgroundTasks.values()) {
      try {
        if (task.running) task.proc.kill("SIGKILL");
      } catch {
        // Already exited.
      }
    }
    backgroundTasks.clear();
    sessions.clearSessions();
    delete process.env.STORAGE_DIR;
    fs.rmSync(stateDir, { recursive: true, force: true });
    // Same Windows cwd-handle race as the background-tasks block above:
    // a killed process releases its cwd asynchronously.
    let lastError = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        fs.rmSync(sandbox, { recursive: true, force: true });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);
      }
    }
    if (lastError) throw lastError;
  });

  async function waitForSettled(id, timeoutMs = 10_000) {
    const start = Date.now();
    for (;;) {
      const poll = pollBackgroundTask(id);
      if (!poll.ok || !poll.running) return poll;
      if (Date.now() - start > timeoutMs)
        throw new Error(`background task ${id} still running`);
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  function fakeSocket() {
    const sent = [];
    return { sent, send: (...args) => sent.push(args) };
  }

  // Mirrors the terminal-task-start handler: links a session row + run key.
  function linkRow(taskId, runKey) {
    const task = backgroundTasks.get(taskId);
    const row = sessions.startSession({
      kind: "terminal",
      label: `& task ${taskId}`,
    });
    task.sessionId = row.id;
    task.runKey = runKey;
    return row;
  }

  it("closes finished-but-unpolled rows for its own run key", async () => {
    const socket = fakeSocket();
    const started = startBackgroundTask("echo settle-me", { cwd: sandbox });
    expect(started.ok).toBe(true);
    const row = linkRow(started.taskId, 42);
    await waitForSettled(started.taskId);
    // Never polled: still open before the sweep (the live bug).
    expect(
      sessions.listSessions().find((s) => s.id === row.id).status
    ).toBe("running");
    expect(settleFinishedBackgroundTasks(42, socket)).toBe(1);
    expect(
      sessions.listSessions().find((s) => s.id === row.id).status
    ).toBe("done");
    const cards = socket.sent.filter((args) => args[0] === "sessionCard");
    expect(cards).toHaveLength(1);
    expect(cards[0][1].status).toBe("done");
    expect(cards[0][1].detail).toContain("settle-me");
  }, 30_000);

  it("leaves still-running tasks alone", async () => {
    const socket = fakeSocket();
    // Finite sleep: orphan-safe if jest dies (same reason as the stop test).
    const started = startBackgroundTask("sleep 30", { cwd: sandbox });
    expect(started.ok).toBe(true);
    const row = linkRow(started.taskId, 42);
    expect(pollBackgroundTask(started.taskId).running).toBe(true);
    expect(settleFinishedBackgroundTasks(42, socket)).toBe(0);
    expect(
      sessions.listSessions().find((s) => s.id === row.id).status
    ).toBe("running");
    expect(socket.sent).toHaveLength(0);
  }, 30_000);

  it("ignores tasks stamped for another run and stale snapshots", async () => {
    const socket = fakeSocket();
    const foreign = startBackgroundTask("echo foreign", { cwd: sandbox });
    expect(foreign.ok).toBe(true);
    linkRow(foreign.taskId, 7);
    const stale = startBackgroundTask("echo stale", { cwd: sandbox });
    expect(stale.ok).toBe(true);
    const staleRow = linkRow(stale.taskId, 42);
    await waitForSettled(foreign.taskId);
    await waitForSettled(stale.taskId);
    // Simulate a restart-rehydrated snapshot: no live state to settle.
    backgroundTasks.get(stale.taskId).stale = true;
    expect(settleFinishedBackgroundTasks(42, socket)).toBe(0);
    expect(
      sessions.listSessions().find((s) => s.id === staleRow.id).status
    ).toBe("running");
    expect(socket.sent).toHaveLength(0);
  }, 30_000);
});

describe("isReadOnlyCommand", () => {
  it.each([
    ["ls -la"],
    ["git status"],
    ["git log --oneline -5"],
    ["git diff --stat"],
    ["git show HEAD --stat"],
    ["git rev-parse HEAD"],
    ["git ls-files"],
    ["git stash list"],
    ["git remote -v"],
    ["git remote"],
    ["cd backend && ls"],
    ["cat file.txt | grep foo | head -20"],
    ["rg --files | head"],
    ["node --version"],
    ["npm --version"],
    ["python --help"],
    ["echo hello"],
    ["ls 2>/dev/null"],
    ["ls 2>&1 | head"],
    ["echo hello > /dev/null"],
    ["grep -r 'hello' . 2>/dev/null | head"],
    ["pwd && whoami && uname -a"],
    ["C:\\Windows\\System32\\whoami.exe"],
  ])("treats %p as read-only", (command) => {
    expect(isReadOnlyCommand(command)).toBe(true);
  });

  it.each([
    ["npm install express"],
    ["curl -s http://127.0.0.1:8000/api/health"],
    ["echo hi > out.txt"],
    ["cat > f << 'EOF'\nhi\nEOF"],
    ["rm -rf ./build"],
    ["rm -r src/old-module"],
    ["git push"],
    ["git reset --hard HEAD~1"],
    ["git branch -d feat"],
    ["git stash drop"],
    ["git tag -d v1"],
    ["node server.js"],
    ["python script.py"],
    ["npm run build"],
    ["FOO=1 ls"],
    ["echo $(whoami)"],
    ["echo `whoami`"],
    ["find . -delete"],
    ["find . -name x -exec rm {} \\;"],
    ["tail -f log.txt"],
    ["yq -i '.a=1' f.yml"],
    ["shutdown /s"],
    ["sudo ls"],
    ["env"],
    ["printenv"],
    ["del file.txt"],
    ["tee out.txt"],
    [""],
    ["   "],
    [null],
  ])("keeps %p behind approval", (command) => {
    expect(isReadOnlyCommand(command)).toBe(false);
  });

  it("stays under the stdout/stderr inline budgets", () => {
    expect(MAX_STDOUT_CHARS + MAX_STDERR_CHARS).toBeLessThanOrEqual(12_000);
  });
});

describe("categorizeCommand", () => {
  it.each([
    ["cat > app.js << 'EOF'\ncode\nEOF", "Write"],
    ["cat > miniapp/server.js << 'EOF' …(48 heredoc lines) EOF", "Write"],
    ["sed -i 's/a/b/' file.txt", "Write"],
    ["echo hello > out.txt", "Write"],
    ["grep -r 'hello' .", "Search"],
    ["rg --files | head", "Search"],
    ["find . -name '*.js'", "Search"],
    ["npm install express", "Install"],
    ["pip install requests", "Install"],
    ["curl -s http://localhost:4599/api/hello", "Fetch"],
    ["wget https://example.com/x", "Fetch"],
    ["curl -s http://x/ | head -20", "Fetch"],
    ["kill %1 2>/dev/null; pkill -f uvicorn", "Kill"],
    ["pkill -f \"python -m http.server\"", "Kill"],
    ["sleep 5 && cat /tmp/backend.log", "Sleep"],
    ["timeout 10 npm start", "Sleep"],
    ["git log --oneline -5", "Git"],
    ["gh repo view", "Git"],
    ["python -m pytest tests/ -x", "Test"],
    ["bash run_tests.sh", "Test"],
    ["npx jest src/", "Test"],
    ["rm -rf backend/data && mkdir -p backend/data", "Files"],
    ["cp a.txt b.txt && mv b.txt c.txt", "Files"],
    ["cat backend/app/main.py", "Cat"],
    ["head -50 server.log", "Cat"],
    ["ls -la", "List"],
    ["tree /F backend", "List"],
    ["pwd", "Pwd"],
    ["cd backend && pwd", "Pwd"],
    ["bash -c \"echo hi\"", "Bash"],
    ["cd miniapp && node server.js &", "Run"],
    ["python script.py", "Run"],
    ["npm run build", "Run"],
  ])("classifies %p as %p", (command, expected) => {
    expect(categorizeCommand(command)).toBe(expected);
  });

  it.each([
    ["ls 2>/dev/null | sort", "List"],
    ["node server.js 2>&1 | head", "Run"],
    ["cd backend", null],
    ["", null],
    [null, null],
    ["echo hello", null],
  ])("leaves %p chipless", (command, expected) => {
    expect(categorizeCommand(command)).toBe(expected);
  });
});

describe("workdir change detection", () => {
  function makeRoot(files = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "term-test-"));
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(root, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    }
    return root;
  }

  it("finds added and modified files", () => {
    const root = makeRoot({ "a.txt": "one\n", "sub/b.txt": "two\n" });
    const before = snapshotWorkdir(root);
    fs.writeFileSync(path.join(root, "new.txt"), "fresh\n");
    fs.writeFileSync(path.join(root, "a.txt"), "one\ntwo\n");
    const after = snapshotWorkdir(root);
    expect(detectWorkdirChanges(before, after)).toEqual({
      added: ["new.txt"],
      modified: ["a.txt"],
    });
  });

  it("ignores dependency dirs and deletions", () => {
    const root = makeRoot({
      "node_modules/dep/index.js": "x",
      "gone.txt": "bye",
    });
    const before = snapshotWorkdir(root);
    fs.writeFileSync(path.join(root, "node_modules/dep/index.js"), "y");
    fs.rmSync(path.join(root, "gone.txt"));
    const after = snapshotWorkdir(root);
    expect(detectWorkdirChanges(before, after)).toEqual({
      added: [],
      modified: [],
    });
  });

  it("emits create rows for new text and edit rows with diffs", () => {
    const root = makeRoot({ "a.txt": "one\n" });
    const before = snapshotWorkdir(root);
    fs.writeFileSync(path.join(root, "new.txt"), "fresh\nlines\n");
    fs.writeFileSync(path.join(root, "a.txt"), "one\ntwo\n");
    fs.writeFileSync(path.join(root, "blob.bin"), Buffer.from([0, 1, 2]));
    const after = snapshotWorkdir(root);
    const sent = [];
    emitWorkdirFileCards((payload) => sent.push(payload), before, after);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({
      action: "create",
      path: "new.txt",
      added: 3,
    });
    expect(sent[1].action).toBe("edit");
    expect(sent[1].path).toBe("a.txt");
    expect(sent[1].added).toBe(1);
    expect(sent[1].diff).toContain("+two");
  });

  it("emits nothing when only mtimes touched", () => {
    const root = makeRoot({ "a.txt": "same\n" });
    const before = snapshotWorkdir(root);
    const abs = path.join(root, "a.txt");
    const later = new Date(Date.now() + 60_000);
    fs.utimesSync(abs, later, later);
    const after = snapshotWorkdir(root);
    const sent = [];
    emitWorkdirFileCards((payload) => sent.push(payload), before, after);
    expect(sent).toHaveLength(0);
  });
});
