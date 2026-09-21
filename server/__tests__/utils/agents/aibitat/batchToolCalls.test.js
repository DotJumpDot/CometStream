/**
 * Tests for batched tool-call execution: when a provider returns multiple
 * tool calls for one LLM turn (`functionCalls`), the execution loop runs all
 * of them sequentially before the next completion - single-call providers
 * (`functionCall`) keep working unchanged.
 */
jest.mock("../../../../models/telemetry", () => ({
  Telemetry: { sendTelemetry: jest.fn() },
}));

const AIbitat = require("../../../../utils/agents/aibitat");

/**
 * Builds an AIbitat instance with a fake provider whose `stream` (or
 * `complete`) pops scripted completions, plus registered no-op functions
 * that record their invocation order.
 * @param {Object} opts
 * @param {Array} opts.completions - scripted provider completions, in order
 * @param {number} [opts.maxToolCalls] - per-response tool budget
 * @param {boolean} [opts.sync] - exercise handleExecution instead of the
 *   streaming handler
 * @returns {{aibitat: AIbitat, calls: Array<string>, streams: Array<Array>}}
 *   calls records executed function names in order; streams records the
 *   messages each provider completion received.
 */
function makeAibitat({ completions, maxToolCalls = 10, sync = false }) {
  const aibitat = new AIbitat({
    provider: "genericOpenAi",
    model: "test-model",
    maxToolCalls,
    handlerProps: { log: jest.fn() },
  });
  const calls = [];
  const streams = [];
  let index = 0;

  for (const name of ["alpha", "beta", "gamma"]) {
    aibitat.function({
      name,
      description: `test fn ${name}`,
      parameters: { type: "object", properties: {} },
      handler: async (args) => {
        calls.push(name);
        if (args?.abort) aibitat._aborted = true;
        if (args?.directOutput) aibitat.skipHandleExecution = true;
        return `${name}-result`;
      },
    });
  }

  aibitat.providerInstance = {
    verbose: false,
    resetCumulativeUsage: jest.fn(),
    getCumulativeUsage: () => ({}),
    ...(sync
      ? {
          complete: async (messages, functions) => {
            streams.push({ messages: messages.map((m) => ({ ...m })), functions });
            return completions[index++] ?? { textResponse: "done" };
          },
        }
      : {
          stream: async (messages, functions, eventHandler) => {
            streams.push({ messages: messages.map((m) => ({ ...m })), functions });
            const completion =
              completions[index++] ?? { textResponse: "done" };
            eventHandler?.("reportStreamEvent", {
              type: "textResponseChunk",
              uuid: completion?.uuid ?? "u",
              content: completion?.textResponse ?? "",
            });
            return completion;
          },
        }),
  };
  aibitat.socket = { send: jest.fn() };
  return { aibitat, calls, streams };
}

describe("AIbitat batched tool calls (handleAsyncExecution)", () => {
  it("executes every call of a batch in order before the next completion", async () => {
    const { aibitat, calls, streams } = makeAibitat({
      completions: [
        {
          uuid: "turn-1",
          textResponse: "",
          functionCalls: [
            { id: "c1", name: "alpha", arguments: {} },
            { id: "c2", name: "beta", arguments: {} },
            { id: "c3", name: "gamma", arguments: {} },
          ],
        },
        { uuid: "turn-2", textResponse: "all files written" },
      ],
    });

    const result = await aibitat.handleAsyncExecution(
      [{ role: "user", content: "go" }],
      [],
      "agent"
    );

    expect(result).toBe("all files written");
    expect(calls).toEqual(["alpha", "beta", "gamma"]);
    // Two provider completions: the tool turn and the final text turn.
    expect(streams).toHaveLength(2);
    // The second completion saw one function message per executed call,
    // each carrying its own originalFunctionCall id.
    const functionMessages = streams[1].messages.filter(
      (m) => m.role === "function"
    );
    expect(functionMessages.map((m) => m.name)).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
    expect(functionMessages.map((m) => m.originalFunctionCall.id)).toEqual([
      "c1",
      "c2",
      "c3",
    ]);
    expect(functionMessages.map((m) => m.content)).toEqual([
      "alpha-result",
      "beta-result",
      "gamma-result",
    ]);
  });

  it("keeps single-functionCall providers working", async () => {
    const { aibitat, calls } = makeAibitat({
      completions: [
        {
          uuid: "t1",
          textResponse: "",
          functionCall: { id: "c1", name: "alpha", arguments: {} },
        },
        { uuid: "t2", textResponse: "legacy ok" },
      ],
    });

    const result = await aibitat.handleAsyncExecution(
      [{ role: "user", content: "go" }],
      [],
      "agent"
    );
    expect(result).toBe("legacy ok");
    expect(calls).toEqual(["alpha"]);
  });

  it("counts every executed call against the tool budget", async () => {
    const { aibitat, calls, streams } = makeAibitat({
      maxToolCalls: 2,
      completions: [
        {
          uuid: "t1",
          textResponse: "",
          functionCalls: [
            { id: "c1", name: "alpha", arguments: {} },
            { id: "c2", name: "beta", arguments: {} },
            { id: "c3", name: "gamma", arguments: {} },
          ],
        },
        { uuid: "t2", textResponse: "budget respected" },
      ],
    });

    const result = await aibitat.handleAsyncExecution(
      [{ role: "user", content: "go" }],
      [{ name: "alpha" }, { name: "beta" }, { name: "gamma" }],
      "agent"
    );

    expect(result).toBe("budget respected");
    // The call that reaches the limit still runs (single-call semantics:
    // "execute final tool call then generate response") and cuts the rest,
    // so gamma executes as the final call and the follow-up completion is
    // text-only - the batch cannot bypass maxToolCalls.
    expect(calls).toEqual(["alpha", "beta", "gamma"]);
    expect(streams[1].functions).toEqual([]);
  });

  it("records unknown functions as not-found and continues the batch", async () => {
    const { aibitat, calls, streams } = makeAibitat({
      completions: [
        {
          uuid: "t1",
          textResponse: "",
          functionCalls: [
            { id: "c1", name: "alpha", arguments: {} },
            { id: "c2", name: "nope", arguments: {} },
            { id: "c3", name: "beta", arguments: {} },
          ],
        },
        { uuid: "t2", textResponse: "recovered" },
      ],
    });

    const result = await aibitat.handleAsyncExecution(
      [{ role: "user", content: "go" }],
      [],
      "agent"
    );

    expect(result).toBe("recovered");
    expect(calls).toEqual(["alpha", "beta"]);
    const notFound = streams[1].messages.find((m) => m.name === "nope");
    expect(notFound?.content).toContain("not found");
  });

  it("stops mid-batch when the session is aborted", async () => {
    const { aibitat, calls } = makeAibitat({
      completions: [
        {
          uuid: "t1",
          textResponse: "",
          functionCalls: [
            { id: "c1", name: "alpha", arguments: { abort: true } },
            { id: "c2", name: "beta", arguments: {} },
          ],
        },
      ],
    });

    const result = await aibitat.handleAsyncExecution(
      [{ role: "user", content: "go" }],
      [],
      "agent"
    );
    expect(result).toBe(null);
    expect(calls).toEqual(["alpha"]);
  });

  it("returns direct-output results immediately, skipping the rest", async () => {
    const { aibitat, calls } = makeAibitat({
      completions: [
        {
          uuid: "t1",
          textResponse: "",
          functionCalls: [
            { id: "c1", name: "alpha", arguments: { directOutput: true } },
            { id: "c2", name: "beta", arguments: {} },
          ],
        },
      ],
    });

    const result = await aibitat.handleAsyncExecution(
      [{ role: "user", content: "go" }],
      [],
      "agent"
    );
    expect(result).toBe("alpha-result");
    expect(calls).toEqual(["alpha"]);
    expect(aibitat.socket.send).toHaveBeenCalledWith(
      "reportStreamEvent",
      expect.objectContaining({ type: "fullTextResponse" })
    );
  });
});

describe("AIbitat batched tool calls (handleExecution, sync)", () => {
  it("executes the whole batch and returns the final text", async () => {
    const { aibitat, calls, streams } = makeAibitat({
      sync: true,
      completions: [
        {
          textResponse: "",
          functionCalls: [
            { id: "c1", name: "alpha", arguments: {} },
            { id: "c2", name: "beta", arguments: {} },
          ],
        },
        { textResponse: "sync done" },
      ],
    });

    const result = await aibitat.handleExecution(
      [{ role: "user", content: "go" }],
      [],
      "agent"
    );
    expect(result).toBe("sync done");
    expect(calls).toEqual(["alpha", "beta"]);
    const functionMessages = streams[1].messages.filter(
      (m) => m.role === "function"
    );
    expect(functionMessages).toHaveLength(2);
  });
});
