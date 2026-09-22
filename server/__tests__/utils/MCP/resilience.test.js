/**
 * Tests for MCP tool-call resilience: per-call timeouts, one restart +
 * retry on transport failure, and bounded inline results with spill files.
 * MCP clients are mocked - no real servers boot.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const MCPCompatibilityLayer = require("../../../utils/MCP");
const MCPHypervisor = require("../../../utils/MCP/hypervisor");

jest.mock("../../../models/systemSettings", () => ({
  SystemSettings: {
    getValueOrFallback: jest.fn(async () => ""),
  },
}));
const {
  SystemSettings,
} = require("../../../models/systemSettings");

function mockClient(impl) {
  return {
    callTool: impl,
    ping: async () => true,
    transport: { close: jest.fn() },
    close: jest.fn(),
  };
}

describe("MCP tool resilience", () => {
  let storageDir;
  let layer;

  beforeEach(() => {
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-resil-"));
    process.env.STORAGE_DIR = storageDir;
    delete process.env.AGENT_MCP_TOOL_TIMEOUT_MS;
    MCPCompatibilityLayer._instance = undefined;
    MCPHypervisor._instance = undefined;
    jest.clearAllMocks();
    SystemSettings.getValueOrFallback.mockResolvedValue("");
    jest.spyOn(console, "log").mockImplementation(() => {});
    layer = new MCPCompatibilityLayer();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    MCPCompatibilityLayer._instance = undefined;
    MCPHypervisor._instance = undefined;
    delete process.env.STORAGE_DIR;
    fs.rmSync(storageDir, { recursive: true, force: true });
  });

  describe("mcpToolTimeoutMs", () => {
    it("prefers ENV and clamps to [5s, 600s]", async () => {
      process.env.AGENT_MCP_TOOL_TIMEOUT_MS = "100";
      await expect(
        MCPCompatibilityLayer.mcpToolTimeoutMs()
      ).resolves.toBe(5000);
      process.env.AGENT_MCP_TOOL_TIMEOUT_MS = "99999999";
      await expect(
        MCPCompatibilityLayer.mcpToolTimeoutMs()
      ).resolves.toBe(600000);
      process.env.AGENT_MCP_TOOL_TIMEOUT_MS = "30000";
      await expect(
        MCPCompatibilityLayer.mcpToolTimeoutMs()
      ).resolves.toBe(30000);
    });

    it("falls back to the in-app setting, then the default", async () => {
      SystemSettings.getValueOrFallback.mockResolvedValue("45000");
      await expect(
        MCPCompatibilityLayer.mcpToolTimeoutMs()
      ).resolves.toBe(45000);
      expect(SystemSettings.getValueOrFallback).toHaveBeenCalledWith(
        { label: "mcp_tool_timeout_ms" },
        ""
      );
      SystemSettings.getValueOrFallback.mockResolvedValue("");
      await expect(
        MCPCompatibilityLayer.mcpToolTimeoutMs()
      ).resolves.toBe(
        MCPCompatibilityLayer.DEFAULT_MCP_TOOL_TIMEOUT_MS
      );
    });

    it("clamps garbage statically", () => {
      const clamp = MCPCompatibilityLayer.clampMcpTimeout;
      expect(clamp("abc", 7000)).toBe(7000);
      expect(clamp("-5", 7000)).toBe(7000);
      expect(clamp("0", 7000)).toBe(7000);
    });
  });

  describe("callMCPToolWithResilience", () => {
    it("returns small results untouched", async () => {
      layer.mcps = {
        t: mockClient(async () => ({ content: [{ type: "text", text: "hi" }] })),
      };
      const text = await layer.callMCPToolWithResilience("t", "echo", {
        text: "hi",
      });
      expect(text).toContain("hi");
      expect(text).not.toContain("truncated");
    });

    it("projects huge results inline and spills the full text", async () => {
      const big = "z".repeat(60_000);
      layer.mcps = {
        t: mockClient(async () => ({ content: [{ type: "text", text: big }] })),
      };
      const text = await layer.callMCPToolWithResilience("t", "dump", {});
      expect(text.length).toBeLessThan(20_000);
      expect(text).toContain("chars truncated]");
      expect(text).toContain("spilled to");
      const spillDir = path.join(
        storageDir,
        "anythingllm-fs",
        ".tool-outputs"
      );
      const spills = fs
        .readdirSync(spillDir)
        .filter((f) => f.endsWith(".log"));
      expect(spills).toHaveLength(1);
      expect(
        fs.readFileSync(path.join(spillDir, spills[0]), "utf-8")
      ).toContain(big.slice(0, 1000));
    }, 30_000);

    it("times out hung calls without retrying", async () => {
      process.env.AGENT_MCP_TOOL_TIMEOUT_MS = "5000";
      layer.mcps = {
        t: mockClient(() => new Promise(() => {})),
      };
      const restart = jest.spyOn(layer, "restartMCPServerForRetry");
      const text = await layer.callMCPToolWithResilience("t", "hang", {});
      expect(text).toMatch(/timed out after 5s/);
      expect(text).toMatch(/NOT retried/);
      expect(restart).not.toHaveBeenCalled();
    }, 20_000);

    it("restarts once and retries on transport failure", async () => {
      let calls = 0;
      const introspect = jest.fn();
      layer.mcps = {
        t: mockClient(async () => {
          calls++;
          if (calls === 1) throw new Error("fetch failed");
          return { recovered: true };
        }),
      };
      // The real startMCPServer would boot a new client into mcps[name] -
      // mirror that contract with the working mock.
      jest
        .spyOn(layer, "startMCPServer")
        .mockImplementation(async () => {
          layer.mcps.t = mockClient(async () => ({ recovered: true }));
          return { success: true };
        });
      const text = await layer.callMCPToolWithResilience(
        "t",
        "flaky",
        {},
        { log: () => {}, introspect }
      );
      expect(calls).toBe(1);
      expect(text).toContain("recovered");
      expect(
        introspect.mock.calls.some((c) => String(c[0]).includes("restarting"))
      ).toBe(true);
      expect(
        introspect.mock.calls.some((c) => String(c[0]).includes("recovered"))
      ).toBe(true);
    });

    it("throws the original error when restart fails", async () => {
      layer.mcps = {
        t: mockClient(async () => {
          throw new Error("fetch failed");
        }),
      };
      jest.spyOn(layer, "startMCPServer").mockResolvedValue({ success: false });
      await expect(
        layer.callMCPToolWithResilience("t", "flaky", {})
      ).rejects.toThrow("fetch failed");
    });

    it("fails fast for tool logic errors (no restart)", async () => {
      layer.mcps = {
        t: mockClient(async () => {
          throw new Error("Invalid params: missing path");
        }),
      };
      const restart = jest.spyOn(layer, "restartMCPServerForRetry");
      await expect(
        layer.callMCPToolWithResilience("t", "bad", {})
      ).rejects.toThrow("Invalid params");
      expect(restart).not.toHaveBeenCalled();
    });

    it("throws when the server is not running", async () => {
      layer.mcps = {};
      await expect(
        layer.callMCPToolWithResilience("ghost", "tool", {})
      ).rejects.toThrow("not currently running");
    });
  });
});
