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
  capOutput,
  commandTimeoutMs,
  summarizeCommand,
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
});
