// `utils/http` reaches the auth stack on require; this suite exercises none of it.
jest.mock("jsonwebtoken", () => ({}));
// Same storage-free stub as index.test.js - none of these fixtures read
// generated-image attachments.
jest.mock("../../../../utils/files", () => ({
  generatedImageAttachments: () => [],
}));

const { convertToChatHistory } = require("../../../../utils/helpers/chat/responses");

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
