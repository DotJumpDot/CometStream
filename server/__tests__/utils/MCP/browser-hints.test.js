const path = require("path");
const fs = require("fs");
const os = require("os");

const MCPCompatibilityLayer = require("../../../utils/MCP");
const MCPHypervisor = require("../../../utils/MCP/hypervisor");

const PW_NAV = {
  name: "browser_navigate",
  description: "Navigate to a URL",
  inputSchema: { type: "object", properties: {} },
};
const PW_SNAP = {
  name: "browser_snapshot",
  description: "Capture accessibility snapshot",
  inputSchema: { type: "object", properties: {} },
};
const PW_CLICK = {
  name: "browser_click",
  description: "Perform click on a web page",
  inputSchema: { type: "object", properties: {} },
};
const CD_NAV = {
  name: "navigate_page",
  description: "Go to a URL",
  inputSchema: { type: "object", properties: {} },
};
const CD_SNAP = {
  name: "take_snapshot",
  description: "Take a text snapshot",
  inputSchema: { type: "object", properties: {} },
};
const CD_CLICK = {
  name: "click",
  description: "Clicks on the provided element",
  inputSchema: { type: "object", properties: {} },
};
const ECHO = {
  name: "echo",
  description: "Echoes input back",
  inputSchema: { type: "object", properties: {} },
};

describe("MCP browser-kit interaction hints", () => {
  let storageDir;
  let mcpLayer;

  beforeEach(() => {
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-browser-hints-"));
    process.env.STORAGE_DIR = storageDir;
    MCPCompatibilityLayer._instance = undefined;
    MCPHypervisor._instance = undefined;
    fs.mkdirSync(path.join(storageDir, "plugins"), { recursive: true });
    fs.writeFileSync(
      path.join(storageDir, "plugins", "anythingllm_mcp_servers.json"),
      JSON.stringify({ mcpServers: {} }, null, 2)
    );
    jest.spyOn(console, "log").mockImplementation(() => {});
    mcpLayer = new MCPCompatibilityLayer();
  });

  afterEach(() => {
    MCPCompatibilityLayer._instance = undefined;
    MCPHypervisor._instance = undefined;
    mcpLayer = undefined;
    delete process.env.STORAGE_DIR;
    fs.rmSync(storageDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  function injectServer(name, tools) {
    mcpLayer.mcps[name] = {
      listTools: () => Promise.resolve({ tools }),
      transport: { close: () => {} },
      close: () => {},
    };
  }

  async function descriptionsFor(name) {
    const plugins = await mcpLayer.convertServerToolsToPlugins(name, null);
    return Object.fromEntries(plugins.map((p) => [p.name, p.description]));
  }

  it("appends the full ref-as-target loop to playwright entry tools and a one-liner to actions", async () => {
    injectServer("playwright", [PW_NAV, PW_SNAP, PW_CLICK]);
    const desc = await descriptionsFor("playwright");

    expect(desc["playwright-browser_navigate"]).toMatch(/Browser loop/);
    expect(desc["playwright-browser_navigate"]).toMatch(/SEPARATE browser/);
    expect(desc["playwright-browser_navigate"]).toMatch(/`target`/);
    expect(desc["playwright-browser_snapshot"]).toMatch(/Browser loop/);
    expect(desc["playwright-browser_click"]).not.toMatch(/Browser loop/);
    expect(desc["playwright-browser_click"]).toMatch(/navigate→snapshot→act→verify/);
    expect(desc["playwright-browser_click"]).toMatch(/`target`/);
    // Original description survives underneath.
    expect(desc["playwright-browser_click"].startsWith("Perform click")).toBe(
      true
    );
  });

  it("uses uid/pageId wording for the chrome-devtools signature", async () => {
    injectServer("chrome-devtools", [CD_NAV, CD_SNAP, CD_CLICK]);
    const desc = await descriptionsFor("chrome-devtools");

    expect(desc["chrome-devtools-navigate_page"]).toMatch(/Browser loop/);
    expect(desc["chrome-devtools-navigate_page"]).toMatch(/`uid`/);
    expect(desc["chrome-devtools-navigate_page"]).toMatch(/`pageId`/);
    expect(desc["chrome-devtools-take_snapshot"]).toMatch(/Browser loop/);
    expect(desc["chrome-devtools-click"]).toMatch(/navigate→snapshot→act→verify/);
  });

  it("leaves non-browser servers untouched and tolerates missing descriptions", async () => {
    injectServer("files", [ECHO, { name: "nodesc", inputSchema: {} }]);
    const desc = await descriptionsFor("files");

    expect(desc["files-echo"]).toBe("Echoes input back");
    expect(desc["files-nodesc"]).toBe("");
  });

  it("does not hint when only half the signature is present", async () => {
    // Snapshot without navigate is not a controllable browser kit.
    injectServer("half", [PW_SNAP, ECHO]);
    const desc = await descriptionsFor("half");

    expect(desc["half-browser_snapshot"]).toBe("Capture accessibility snapshot");
  });
});
