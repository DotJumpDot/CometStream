/**
 * Tests for the agent session registry: terminal/subagent run tracking
 * behind the side-panel Sessions tab.
 */
const {
  startSession,
  updateSession,
  finishSession,
  listSessions,
  clearSessions,
  capDetail,
  MAX_SESSIONS,
} = require("../../../../../utils/agents/aibitat/plugins/sessions");

describe("agent session registry", () => {
  beforeEach(() => {
    clearSessions();
  });

  it("starts running sessions with ids and timestamps", () => {
    const a = startSession({ kind: "terminal", label: "$ echo hi" });
    const b = startSession({ kind: "subagent", label: "research x" });
    expect(a.id).not.toBe(b.id);
    expect(a.status).toBe("running");
    expect(a.endedAt).toBeNull();
    expect(typeof a.startedAt).toBe("number");
  });

  it("lists newest-first", () => {
    const a = startSession({ kind: "terminal", label: "first" });
    const b = startSession({ kind: "terminal", label: "second" });
    const listed = listSessions();
    expect(listed[0].id).toBe(b.id);
    expect(listed[1].id).toBe(a.id);
  });

  it("finishes sessions with status and end time", () => {
    const s = startSession({ kind: "terminal", label: "$ exit 3" });
    const done = finishSession(s.id, "done", "tail");
    expect(done.status).toBe("done");
    expect(typeof done.endedAt).toBe("number");
    expect(done.detail).toContain("tail");
    const err = startSession({ kind: "terminal", label: "x" });
    expect(finishSession(err.id, "error").status).toBe("error");
  });

  it("ignores unknown ids instead of throwing", () => {
    expect(updateSession(999, { status: "done" })).toBeNull();
    expect(finishSession(999)).toBeNull();
  });

  it("evicts oldest-first past the cap", () => {
    for (let i = 0; i < MAX_SESSIONS + 5; i++) {
      startSession({ kind: "terminal", label: `cmd ${i}` });
    }
    const listed = listSessions();
    expect(listed).toHaveLength(MAX_SESSIONS);
    expect(listed[0].label).toBe(`cmd ${MAX_SESSIONS + 4}`);
  });

  it("caps detail text keeping head and tail", () => {
    const big = "a".repeat(20_000);
    const capped = capDetail(big);
    expect(capped.length).toBeLessThan(big.length);
    expect(capped).toContain("chars truncated]");
  });
});
