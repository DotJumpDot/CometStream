const {
  formatMessagesForTools,
  tooledStream,
  tooledComplete,
  serviceTierParam,
} = require("../../../../../../utils/agents/aibitat/providers/helpers/tooled.js");

describe("formatMessagesForTools attachment content (native tool path)", () => {
  it("sends audio attachments as input_audio and keeps images as image_url", () => {
    const [formatted] = formatMessagesForTools([
      {
        role: "user",
        content: "transcribe this",
        attachments: [
          {
            name: "clip.mp3",
            mime: "audio/mpeg",
            contentString: "data:audio/mpeg;base64,BBBB",
          },
          {
            name: "image.png",
            mime: "image/png",
            contentString: "data:image/png;base64,AAAA",
          },
        ],
      },
    ]);

    expect(formatted.content[1]).toEqual({
      type: "input_audio",
      input_audio: { data: "BBBB", format: "mp3" },
    });
    expect(formatted.content[2]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,AAAA" },
    });
  });

  it("detects audio from the data URI when mime is absent", () => {
    const [formatted] = formatMessagesForTools([
      {
        role: "user",
        content: "hi",
        attachments: [{ contentString: "data:audio/wav;base64,DDDD" }],
      },
    ]);

    expect(formatted.content[1]).toEqual({
      type: "input_audio",
      input_audio: { data: "DDDD", format: "wav" },
    });
  });
});

describe("max_tokens forwarding from the tooled maxTokens option", () => {  const messages = [{ role: "user", content: "hi" }];

  function fakeClient({ stream = false } = {}) {
    const create = jest.fn(async () => {
      if (!stream) {
        return {
          choices: [{ message: { role: "assistant", content: "ok" } }],
          usage: null,
        };
      }
      return (async function* () {
        yield { choices: [{ delta: { content: "ok" } }] };
      })();
    });
    return { client: { chat: { completions: { create } } }, create };
  }

  it.each([
    ["a positive integer", 1024, 1024],
    ["a small budget", 7, 7],
  ])("tooledComplete forwards %s", async (_label, maxTokens, expected) => {
    const { client, create } = fakeClient();
    await tooledComplete(client, "m", messages, [], () => 0, {
      provider: {},
      maxTokens,
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].max_tokens).toBe(expected);
  });

  it.each([
    ["a positive integer", 1024, 1024],
    ["a small budget", 7, 7],
  ])("tooledStream forwards %s", async (_label, maxTokens, expected) => {
    const { client, create } = fakeClient({ stream: true });
    await tooledStream(client, "m", messages, [], null, {
      provider: {},
      maxTokens,
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].max_tokens).toBe(expected);
    expect(create.mock.calls[0][0].stream).toBe(true);
  });

  it.each([
    ["no option", undefined],
    ["null", null],
    ["a numeric string", "1024"],
    ["zero", 0],
    ["a negative number", -5],
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["a boolean", true],
  ])("omits max_tokens entirely for %s", async (_label, maxTokens) => {
    const complete = fakeClient();
    await tooledComplete(complete.client, "m", messages, [], () => 0, {
      provider: {},
      maxTokens,
    });
    expect(complete.create.mock.calls[0][0]).not.toHaveProperty("max_tokens");

    const streamed = fakeClient({ stream: true });
    await tooledStream(streamed.client, "m", messages, [], null, {
      provider: {},
      maxTokens,
    });
    expect(streamed.create.mock.calls[0][0]).not.toHaveProperty("max_tokens");
  });

  it("ignores provider.maxTokens when the option is not passed", async () => {
    const complete = fakeClient();
    await tooledComplete(complete.client, "m", messages, [], () => 0, {
      provider: { maxTokens: 1024 },
    });
    expect(complete.create.mock.calls[0][0]).not.toHaveProperty("max_tokens");

    const streamed = fakeClient({ stream: true });
    await tooledStream(streamed.client, "m", messages, [], null, {
      provider: { maxTokens: 1024 },
    });
    expect(streamed.create.mock.calls[0][0]).not.toHaveProperty("max_tokens");
  });

  it("keeps tools in the request alongside max_tokens", async () => {
    const { client, create } = fakeClient();
    const functions = [
      {
        name: "lookup",
        description: "Look something up",
        parameters: { type: "object", properties: {} },
      },
    ];
    await tooledComplete(client, "m", messages, functions, () => 0, {
      provider: {},
      maxTokens: 512,
    });
    const body = create.mock.calls[0][0];
    expect(body.max_tokens).toBe(512);
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].function.name).toBe("lookup");
  });
});

describe("serviceTierParam", () => {
  it("passes a tier straight through", () => {
    expect(serviceTierParam("flex")).toEqual({ service_tier: "flex" });
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["non-string", 3],
  ])("returns an empty object when %s", (_label, value) => {
    expect(serviceTierParam(value)).toEqual({});
  });
});

describe("service_tier forwarding from the tooled serviceTier option", () => {
  const messages = [{ role: "user", content: "hi" }];

  function fakeClient({ stream = false } = {}) {
    const create = jest.fn(async () => {
      if (!stream) {
        return {
          choices: [{ message: { role: "assistant", content: "ok" } }],
          usage: null,
        };
      }
      return (async function* () {
        yield { choices: [{ delta: { content: "ok" } }] };
      })();
    });
    return { client: { chat: { completions: { create } } }, create };
  }

  it.each(["flex", "priority"])("forwards %s on complete and stream", async (serviceTier) => {
    const complete = fakeClient();
    await tooledComplete(complete.client, "m", messages, [], () => 0, {
      provider: {},
      serviceTier,
    });
    expect(complete.create.mock.calls[0][0].service_tier).toBe(serviceTier);

    const streamed = fakeClient({ stream: true });
    await tooledStream(streamed.client, "m", messages, [], null, {
      provider: {},
      serviceTier,
    });
    expect(streamed.create.mock.calls[0][0].service_tier).toBe(serviceTier);
  });

  it("omits service_tier entirely when the option is not passed", async () => {
    const complete = fakeClient();
    await tooledComplete(complete.client, "m", messages, [], () => 0, {
      provider: {},
    });
    expect(complete.create.mock.calls[0][0]).not.toHaveProperty("service_tier");

    const streamed = fakeClient({ stream: true });
    await tooledStream(streamed.client, "m", messages, [], null, {
      provider: {},
    });
    expect(streamed.create.mock.calls[0][0]).not.toHaveProperty("service_tier");
  });
});

describe("batched tool calls (functionCalls)", () => {
  function streamingClient(chunks) {
    const create = jest.fn(async () =>
      (async function* () {
        yield* chunks;
      })()
    );
    return { client: { chat: { completions: { create } } }, create };
  }

  it("tooledStream returns every streamed tool call in index order", async () => {
    const { client } = streamingClient([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call-1",
                  function: { name: "alpha", arguments: '{"x":' },
                },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, function: { arguments: "1}" } }],
            },
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 1,
                  id: "call-2",
                  function: { name: "beta", arguments: "{}" },
                },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 10,
                  id: "call-3",
                  function: { name: "gamma", arguments: "{}" },
                },
              ],
            },
          },
        ],
      },
    ]);

    const result = await tooledStream(client, "m", [], [], null, {});
    expect(result.functionCalls).toHaveLength(3);
    // Numeric index order (index 10 sorts after 1, unlike string keys).
    expect(result.functionCalls.map((c) => c.name)).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
    expect(result.functionCalls[0].arguments).toEqual({ x: 1 });
    expect(result.functionCall).toBe(result.functionCalls[0]);
  });

  it("wraps reasoning into textResponse even on tool-call turns", async () => {    const { client } = streamingClient([
      {
        choices: [
          { delta: { reasoning_content: "planning the whole batch" } },
        ],
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: "c1", function: { name: "alpha", arguments: "{}" } },
              ],
            },
          },
        ],
      },
    ]);

    const result = await tooledStream(client, "m", [], [], null, {});
    expect(result.functionCalls).toHaveLength(1);
    // The run-trace recorder extracts the turn's reasoning from
    // textResponse - without the wrap, batched turns would lose thoughts.
    expect(result.textResponse).toBe("<think>planning the whole batch</think>");
  });

  it("drops nameless glitch slots from the batch", async () => {
    const { client } = streamingClient([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call-1",
                  function: { name: "", arguments: "{}" },
                },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 1, id: "call-2", function: { name: "beta", arguments: "{}" } },
              ],
            },
          },
        ],
      },
    ]);

    const result = await tooledStream(client, "m", [], [], null, {});
    expect(result.functionCalls).toHaveLength(1);
    expect(result.functionCalls[0].name).toBe("beta");
    expect(result.functionCall?.name).toBe("beta");
  });

  it("tooledComplete returns every requested tool call", async () => {
    const create = jest.fn(async () => ({
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              { id: "a", function: { name: "alpha", arguments: '{"k":1}' } },
              { id: "b", function: { name: "beta", arguments: "{}" } },
            ],
          },
        },
      ],
      usage: null,
    }));
    const client = { chat: { completions: { create } } };

    const result = await tooledComplete(client, "m", [], [], () => 0, {});
    expect(result.functionCalls.map((c) => c.name)).toEqual(["alpha", "beta"]);
    expect(result.functionCalls[0].arguments).toEqual({ k: 1 });
    expect(result.functionCall?.id).toBe("a");
  });

  it("flags unparseable streamed arguments instead of coercing to {}", async () => {
    const { client } = streamingClient([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call-1",
                  // Stream cut mid-object: valid prefix, invalid JSON.
                  function: { name: "alpha", arguments: '{"command": "ls' },
                },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 1,
                  id: "call-2",
                  function: { name: "beta", arguments: "{}" },
                },
              ],
            },
          },
        ],
      },
    ]);

    const result = await tooledStream(client, "m", [], [], null, {});
    expect(result.functionCalls).toHaveLength(2);
    // The broken call keeps its name (so the repair turn can reference it)
    // with empty args plus the raw excerpt flag - the execution loop turns
    // the flag into a repair turn and never executes it.
    expect(result.functionCalls[0].name).toBe("alpha");
    expect(result.functionCalls[0].arguments).toEqual({});
    expect(result.functionCalls[0].argsParseError).toBe('{"command": "ls');
    // The healthy call carries no flag.
    expect(result.functionCalls[1].arguments).toEqual({});
    expect(result.functionCalls[1]).not.toHaveProperty("argsParseError");
  });

  it("treats empty streamed arguments as parameterless, not broken", async () => {
    const { client } = streamingClient([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: "call-1", function: { name: "alpha" } },
              ],
            },
          },
        ],
      },
    ]);

    const result = await tooledStream(client, "m", [], [], null, {});
    expect(result.functionCalls).toHaveLength(1);
    expect(result.functionCalls[0].arguments).toEqual({});
    expect(result.functionCalls[0]).not.toHaveProperty("argsParseError");
  });
});

describe("live progress checkpoints (toolCallProgress)", () => {
  function streamingClient(chunks) {
    const create = jest.fn(async () =>
      (async function* () {
        yield* chunks;
      })()
    );
    return { client: { chat: { completions: { create } } }, create };
  }

  function toolChunks(name, parts) {
    return parts.map((args, i) => ({
      choices: [
        {
          delta: {
            tool_calls: [
              i === 0
                ? { index: 0, id: "call-1", function: { name, arguments: args } }
                : { index: 0, function: { arguments: args } },
            ],
          },
        },
      ],
    }));
  }

  it("emits progress for exit-plan-mode proposals like file writes", async () => {
    const { client } = streamingClient(
      toolChunks("exit-plan-mode", ['{"plan": "## Goal', '\\nBuild it."}'])
    );
    const events = [];
    const handler = (type, event) => events.push({ type, event });
    await tooledStream(client, "m", [], [], handler, {});
    const progress = events.filter(
      (e) => e.event?.type === "toolCallProgress"
    );
    expect(progress.length).toBeGreaterThan(0);
    expect(progress[0].event.name).toBe("exit-plan-mode");
    expect(progress[0].event.argChars).toBeGreaterThan(0);
  });

  it("stays silent for ordinary tools", async () => {
    const { client } = streamingClient(
      toolChunks("terminal-agent", ['{"command": "ls', ' -la"}'])
    );
    const events = [];
    const handler = (type, event) => events.push({ type, event });
    await tooledStream(client, "m", [], [], handler, {});
    expect(
      events.filter((e) => e.event?.type === "toolCallProgress")
    ).toHaveLength(0);
  });
});
