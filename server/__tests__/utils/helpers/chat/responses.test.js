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
});
