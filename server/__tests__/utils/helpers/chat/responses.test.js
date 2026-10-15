// `utils/http` reaches the auth stack on require; this suite exercises none of it.
jest.mock("jsonwebtoken", () => ({}));
// Same storage-free stub as index.test.js - none of these fixtures read
// generated-image attachments.
jest.mock("../../../../utils/files", () => ({
  generatedImageAttachments: () => [],
}));

const {
  convertToChatHistory,
} = require("../../../../utils/helpers/chat/responses");

describe("convertToChatHistory", () => {
  test("maps well-formed rows to user/assistant pairs", () => {
    const history = convertToChatHistory([
      {
        id: 1,
        prompt: "hello",
        response: JSON.stringify({
          text: "hi there",
          sources: [],
          type: "textResponse",
        }),
        createdAt: new Date("2026-09-20T10:00:00Z"),
        feedbackScore: null,
      },
    ]);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ role: "user", content: "hello" });
    expect(history[1]).toMatchObject({
      role: "assistant",
      content: "hi there",
    });
  });

  test("skips a corrupt (non-JSON) response row instead of throwing", () => {
    const history = convertToChatHistory([
      {
        id: 1,
        prompt: "broken row",
        // Not a JSON envelope - one bad row must not 500 the whole thread.
        response: "| col | col |\n| --- | --- |",
        createdAt: new Date("2026-09-20T10:00:00Z"),
        feedbackScore: null,
      },
      {
        id: 2,
        prompt: "good row",
        response: JSON.stringify({ text: "fine", sources: [], type: "textResponse" }),
        createdAt: new Date("2026-09-20T10:01:00Z"),
        feedbackScore: null,
      },
    ]);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ role: "user", content: "good row" });
    expect(history[1]).toMatchObject({ role: "assistant", content: "fine" });
  });

  test("skips a JSON row without a string text field", () => {
    const history = convertToChatHistory([
      {
        id: 1,
        prompt: "partial write",
        response: JSON.stringify({ sources: [] }),
        createdAt: new Date("2026-09-20T10:00:00Z"),
        feedbackScore: null,
      },
    ]);
    expect(history).toHaveLength(0);
  });

  test("emits compact rows as a single divider item", () => {
    const history = convertToChatHistory([
      {
        id: 1,
        prompt: "/compact",
        response: JSON.stringify({
          text: "summary of earlier turns",
          type: "compact",
          metrics: { compactedMessages: 4, tokensBefore: 100, tokensAfter: 20 },
        }),
        createdAt: new Date("2026-09-20T10:00:00Z"),
        feedbackScore: null,
      },
    ]);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      type: "compact",
      content: "summary of earlier turns",
    });
  });

  test("keeps compact rows at their chronological position", () => {
    const row = (id, prompt, text) => ({
      id,
      prompt,
      response: JSON.stringify({ text, sources: [], type: "textResponse" }),
      createdAt: new Date(`2026-09-20T10:0${id}:00Z`),
      feedbackScore: null,
    });
    const history = convertToChatHistory([
      row(1, "kept one", "a1"),
      {
        id: 2,
        prompt: "/compact",
        response: JSON.stringify({ text: "fold", type: "compact" }),
        createdAt: new Date("2026-09-20T10:02:00Z"),
        feedbackScore: null,
      },
      row(3, "after compact", "a3"),
    ]);
    // [user, assistant, divider, user, assistant] - the divider sits at its
    // birth line between the kept tail and whatever came after, never hoisted.
    expect(history.map((m) => (m.type === "compact" ? "compact" : m.role))).toEqual([
      "user",
      "assistant",
      "compact",
      "user",
      "assistant",
    ]);
    expect(history[2]).toMatchObject({ type: "compact", content: "fold" });
  });
});

describe("convertToChatHistory interrupt placeholders", () => {
  const OLD = new Date("2026-09-20T10:00:00Z");
  const killedRow = (id, prompt, ts = OLD) => ({
    id,
    prompt,
    response: "{}",
    createdAt: ts,
    lastUpdatedAt: ts,
    include: false,
    feedbackScore: null,
  });
  const OPTS = { includeInterruptPlaceholders: true };

  test("skips response-less rows by default (agent context stays clean)", () => {
    expect(convertToChatHistory([killedRow(1, "hello")])).toEqual([]);
  });

  test("emits a user prompt + interrupted assistant pair when opted in", () => {
    const history = convertToChatHistory([killedRow(7, "hello again")], OPTS);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      role: "user",
      content: "hello again",
      chatId: 7,
    });
    expect(history[1]).toMatchObject({
      type: "interrupted",
      role: "assistant",
      content: "",
      chatId: 7,
    });
  });

  test("hides fresh pre-registrations that may still be live", () => {
    const now = new Date();
    const history = convertToChatHistory([killedRow(7, "live?", now)], OPTS);
    expect(history).toEqual([]);
  });

  test("keeps cleared threads cleared even with dead rows in them", () => {
    const cleared = {
      id: 1,
      prompt: "was answered",
      response: JSON.stringify({ text: "answer" }),
      createdAt: OLD,
      lastUpdatedAt: OLD,
      include: false,
      feedbackScore: null,
    };
    expect(convertToChatHistory([cleared, killedRow(2, "dead")], OPTS)).toEqual(
      []
    );
  });

  test("still skips rows with a non-string prompt even when opted in", () => {
    expect(
      convertToChatHistory([{ id: 1, prompt: 42, response: "{}" }], OPTS)
    ).toEqual([]);
  });

  test("splices checkpoint trace cards before the interrupted marker", () => {
    const trace = [
      { type: "todoListCard", content: { items: [] } }, // panel-only, skipped
      {
        type: "sessionCard",
        content: { id: "s1", status: "done", output: "ok" },
      },
      { type: "statusResponse", content: "working" },
      { type: "planCard", content: {} }, // no plan, skipped
      {
        type: "planCard",
        content: { plan: "# design", status: "proposed" },
      },
    ];
    const history = convertToChatHistory(
      [
        {
          ...killedRow(9, "long run"),
          response: JSON.stringify({ text: "", trace }),
        },
      ],
      OPTS
    );
    expect(history.map((m) => m.type || m.role)).toEqual([
      "user",
      "sessionCard",
      "statusResponse",
      "planCard",
      "interrupted",
    ]);
    expect(history[4]).toMatchObject({ chatId: 9, trace });
    expect(history[3]).toMatchObject({ plan: "# design", chatId: 9 });
  });

  test("renders completed pure-think replies normally, not as interrupted", () => {
    const history = convertToChatHistory(
      [
        {
          ...killedRow(3, "thinker"),
          include: true,
          response: JSON.stringify({ text: "" }),
        },
      ],
      OPTS
    );
    expect(history).toHaveLength(2);
    expect(history[1]).toMatchObject({ role: "assistant", content: "" });
    expect(history[1].type).not.toBe("interrupted");
  });

  test("mixes placeholders and normal pairs in order", () => {
    const history = convertToChatHistory(
      [
        killedRow(1, "first (killed)"),
        {
          id: 2,
          prompt: "second",
          response: JSON.stringify({ text: "answer" }),
          createdAt: OLD,
          lastUpdatedAt: OLD,
          include: true,
          feedbackScore: null,
        },
      ],
      OPTS
    );
    expect(history.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(history[1].type).toBe("interrupted");
    expect(history[3].content).toBe("answer");
  });
});
