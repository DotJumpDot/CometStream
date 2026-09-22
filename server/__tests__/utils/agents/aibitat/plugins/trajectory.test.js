/**
 * Tests for the trajectory recorder: per-iteration deltas, bounded
 * previews, socket fan-out, and never-throw guarantees.
 */
const {
  ensureTrajectory,
  recordTrajectoryIteration,
  previewContent,
} = require("../../../../../utils/agents/aibitat/plugins/trajectory");

function fakeAibitat(overrides = {}) {
  return {
    provider: "custom",
    model: "Apodex-35B",
    socket: { send: jest.fn() },
    providerInstance: {
      getCumulativeUsage: () => ({ prompt_tokens: 10, completion_tokens: 5 }),
    },
    ...overrides,
  };
}

describe("trajectory recorder", () => {
  it("records only message deltas per iteration", () => {
    const aibitat = fakeAibitat();
    const messages = [
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
    ];
    recordTrajectoryIteration(aibitat, {
      messages,
      functions: [{ name: "a" }, { name: "b" }],
      result: { textResponse: "hello", functionCalls: [] },
      depth: 0,
    });
    expect(aibitat._pendingTrajectory).toHaveLength(1);
    expect(aibitat._pendingTrajectory[0].newMessages).toHaveLength(2);
    expect(aibitat._pendingTrajectory[0].offeredTools).toBe(2);

    recordTrajectoryIteration(aibitat, {
      messages: [...messages, { role: "assistant", content: "ok" }],
      functions: [],
      result: {
        textResponse: "",
        functionCalls: [{ name: "ls", arguments: { path: "." } }],
      },
      depth: 1,
    });
    const second = aibitat._pendingTrajectory[1];
    expect(second.newMessages).toHaveLength(1);
    expect(second.newMessages[0].role).toBe("assistant");
    expect(second.requestedTools).toEqual([{ name: "ls", args: '{"path":"."}' }]);
    expect(second.usage).toEqual({ prompt_tokens: 10, completion_tokens: 5 });
  });

  it("caps previews and streams the record to the socket", () => {
    const aibitat = fakeAibitat();
    const record = recordTrajectoryIteration(aibitat, {
      messages: [{ role: "user", content: "x".repeat(5000) }],
      functions: [],
      result: { textResponse: "y".repeat(100) },
    });
    expect(record.newMessages[0].preview.length).toBeLessThan(2000);
    expect(record.newMessages[0].preview).toContain("chars]");
    expect(aibitat.socket.send).toHaveBeenCalledWith("trajectoryEvent", record);
  });

  it("survives missing sockets and throwing usage getters", () => {
    const aibitat = fakeAibitat({
      socket: null,
      providerInstance: {
        getCumulativeUsage: () => {
          throw new Error("nope");
        },
      },
    });
    const record = recordTrajectoryIteration(aibitat, {
      messages: [],
      functions: [],
      result: {},
    });
    expect(record.usage).toBeNull();
    expect(aibitat._pendingTrajectory).toHaveLength(1);
  });

  it("ensureTrajectory is idempotent", () => {
    const aibitat = {};
    expect(ensureTrajectory(aibitat)).toBe(ensureTrajectory(aibitat));
  });

  it("previewContent stringifies non-strings", () => {
    expect(previewContent(null)).toBe("null");
    expect(previewContent("short")).toBe("short");
  });
});
