/**
 * Tests for tool I/O accounting: kind classification, run accumulation,
 * snapshot isolation, and the never-throw guarantee (accounting observes
 * the execution loop and must not break it).
 */
const {
  TOOL_KINDS,
  FILE_WRITE_TOOLS,
  classifyToolKind,
  guessPathFromArgs,
  estimateChars,
  estimateTokens,
  accumulateToolIo,
  drainPendingToolIo,
  toolIoSnapshot,
} = require("../../../../../utils/agents/aibitat/plugins/tool-usage");

describe("classifyToolKind", () => {
  it("classifies built-ins by name", () => {
    expect(classifyToolKind("terminal-agent")).toBe(TOOL_KINDS.TERMINAL);
    expect(classifyToolKind("terminal-task-start")).toBe(TOOL_KINDS.TERMINAL);
    expect(classifyToolKind("delegate-task")).toBe(TOOL_KINDS.SUBAGENT);
    expect(classifyToolKind("filesystem-write-text-file")).toBe(
      TOOL_KINDS.FILES_WRITE
    );
    expect(classifyToolKind("filesystem-edit-file")).toBe(
      TOOL_KINDS.FILES_WRITE
    );
    expect(classifyToolKind("filesystem-read-text-file")).toBe(
      TOOL_KINDS.FILES_READ
    );
    expect(classifyToolKind("filesystem-list-directory")).toBe(
      TOOL_KINDS.FILES_READ
    );
    expect(classifyToolKind("todo-write")).toBe(TOOL_KINDS.BUILTIN);
    expect(classifyToolKind("some-unknown-thing")).toBe(TOOL_KINDS.BUILTIN);
  });

  it("identifies MCP tools by definition flag, not name", () => {
    // Runtime MCP names (`${server}-${tool}`) carry no marker - the flag
    // on the registry definition is the only signal, and origin wins over
    // name collisions.
    expect(classifyToolKind("myserver-read_file", null)).toBe(
      TOOL_KINDS.BUILTIN
    );
    expect(
      classifyToolKind("myserver-read_file", { isMCPTool: true })
    ).toBe(TOOL_KINDS.MCP);
    expect(
      classifyToolKind("terminal-agent", { isMCPTool: true })
    ).toBe(TOOL_KINDS.MCP);
  });

  it("falls back to builtin for missing garbage", () => {
    expect(classifyToolKind()).toBe(TOOL_KINDS.BUILTIN);
    expect(classifyToolKind(null)).toBe(TOOL_KINDS.BUILTIN);
    expect(classifyToolKind(42)).toBe(TOOL_KINDS.BUILTIN);
  });
});

describe("guessPathFromArgs", () => {
  it("finds path-ish keys in partial JSON", () => {
    expect(guessPathFromArgs('{"filePath": "backend/app')).toBe("backend/app");
    expect(guessPathFromArgs('{"path":"a/b/c')).toBe("a/b/c");
    expect(guessPathFromArgs('{"filename": "x.txt", "cont')).toBe("x.txt");
  });

  it("returns null when no key is complete yet", () => {
    expect(guessPathFromArgs('{"fil')).toBeNull();
    expect(guessPathFromArgs("")).toBeNull();
    expect(guessPathFromArgs(null)).toBeNull();
  });

  it("guesses content lines from escaped breaks", () => {
    const { guessLinesFromArgs } = require("../../../../../utils/agents/aibitat/plugins/tool-usage");
    expect(guessLinesFromArgs('{"content": "a\\nb\\nc')).toBe(2);
    expect(guessLinesFromArgs('{"content": "no breaks')).toBe(0);
    expect(guessLinesFromArgs("")).toBe(0);
    expect(guessLinesFromArgs(null)).toBe(0);
  });
});

describe("accumulateToolIo", () => {
  it("accumulates totals and per-kind buckets", () => {
    const aibitat = {};
    accumulateToolIo(aibitat, {
      name: "terminal-agent",
      args: { command: "ls" },
      result: "a\nb\n",
    });
    accumulateToolIo(aibitat, {
      name: "myserver-read_file",
      fnDef: { isMCPTool: true },
      args: { path: "x" },
      result: "y".repeat(100),
    });
    const snap = toolIoSnapshot(aibitat);
    expect(snap.calls).toBe(2);
    expect(snap.tokensEst).toBeGreaterThan(0);
    expect(snap.byKind.terminal.calls).toBe(1);
    expect(snap.byKind.mcp.calls).toBe(1);
    expect(snap.byKind.mcp.tokensEst).toBe(
      Math.ceil(("y".repeat(100).length + JSON.stringify({ path: "x" }).length) / 4)
    );
  });

  it("snapshots are isolated copies", () => {
    const aibitat = {};
    accumulateToolIo(aibitat, { name: "a", args: "x", result: "y" });
    const before = toolIoSnapshot(aibitat);
    accumulateToolIo(aibitat, { name: "b", args: "x", result: "y" });
    expect(before.calls).toBe(1);
    expect(toolIoSnapshot(aibitat).calls).toBe(2);
    before.byKind.builtin.calls = 999;
    expect(toolIoSnapshot(aibitat).byKind.builtin.calls).toBe(2);
  });

  it("drains pending entries once", () => {
    const aibitat = {};
    accumulateToolIo(aibitat, { name: "a", args: "", result: "" });
    const first = drainPendingToolIo(aibitat);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ name: "a", kind: "builtin" });
    expect(drainPendingToolIo(aibitat)).toHaveLength(0);
  });

  it("never throws on hostile input", () => {
    expect(accumulateToolIo(null, null)).toBeNull();
    // BigInt results would crash a naive JSON.stringify - estimation
    // degrades to 0 instead.
    const entry = accumulateToolIo({}, { name: "x", result: BigInt(1) });
    expect(entry).toMatchObject({ name: "x", kind: "builtin" });
    expect(toolIoSnapshot(null)).toEqual({ calls: 0, tokensEst: 0, byKind: {} });
    expect(drainPendingToolIo(null)).toEqual([]);
    expect(estimateChars(null)).toBe(0);
    expect(estimateTokens(-5)).toBe(0);
  });

  it("gates built-in and MCP writes for progress, kinds stay by origin", () => {
    // Built-in skills classify as file writes...
    expect(classifyToolKind("filesystem-write-text-file")).toBe(
      TOOL_KINDS.FILES_WRITE
    );
    expect(classifyToolKind("filesystem-edit-file")).toBe(
      TOOL_KINDS.FILES_WRITE
    );
    // ...MCP filesystem writes stream too, but classify under MCP (origin).
    expect(
      classifyToolKind("filesystem-write_file", { isMCPTool: true })
    ).toBe(TOOL_KINDS.MCP);
    expect(
      classifyToolKind("filesystem-edit_file", { isMCPTool: true })
    ).toBe(TOOL_KINDS.MCP);
    for (const name of FILE_WRITE_TOOLS)
      expect(FILE_WRITE_TOOLS.has(name)).toBe(true);
  });
});
