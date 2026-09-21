/**
 * Tests for the agent run trace recorder: the persistable slice of the live
 * socket stream (thoughts, statuses, file cards, plans, sessions) saved
 * with the turn so reopening a thread restores the run.
 */
const {
  ensureTrace,
  recordTraceEvent,
  recordThoughtText,
  extractThoughts,
  wrapRawSocketForTrace,
  takeTrace,
  clearTrace,
  MAX_TRACE_EVENTS,
} = require("../../../../../utils/agents/aibitat/plugins/trace");

describe("agent run trace recorder", () => {
  describe("extractThoughts", () => {
    it("splits think blocks out and cleans the reply text", () => {
      const { thoughts, cleanText } = extractThoughts(
        "<think>reason one</think>Visible reply<think>reason two</think>"
      );
      expect(thoughts).toEqual(["reason one", "reason two"]);
      expect(cleanText).toBe("Visible reply");
    });

    it("drops an unclosed trailing tag from persisted text", () => {
      const { thoughts, cleanText } = extractThoughts("Reply<think>half a");
      expect(thoughts).toEqual([]);
      expect(cleanText).toBe("Reply");
    });

    it("passes text without thoughts through untouched", () => {
      const { thoughts, cleanText } = extractThoughts("Just a reply");
      expect(thoughts).toEqual([]);
      expect(cleanText).toBe("Just a reply");
    });

    it("tolerates non-string input", () => {
      expect(extractThoughts(null)).toEqual({ thoughts: [], cleanText: null });
      expect(extractThoughts(undefined).thoughts).toEqual([]);
    });
  });

  describe("recordTraceEvent", () => {
    it("records allowlisted types and ignores the rest", () => {
      const aibitat = {};
      expect(recordTraceEvent(aibitat, "statusResponse", "hello")).toBe(true);
      expect(
        recordTraceEvent(aibitat, "fileChangeCard", { path: "a.txt" })
      ).toBe(true);
      expect(recordTraceEvent(aibitat, "todoListCard", { items: [] })).toBe(
        true
      );
      expect(
        recordTraceEvent(aibitat, "sessionCard", { label: "$ ls" })
      ).toBe(true);
      expect(recordTraceEvent(aibitat, "reportStreamEvent", {})).toBe(false);
      expect(recordTraceEvent(aibitat, "toolApprovalRequest", {})).toBe(false);
      expect(aibitat._pendingTrace).toHaveLength(4);
    });

    it("clones payloads so live mutation cannot corrupt history", () => {
      const aibitat = {};
      const payload = { path: "a.txt", added: 1 };
      recordTraceEvent(aibitat, "fileChangeCard", payload);
      payload.added = 999;
      expect(aibitat._pendingTrace[0].content.added).toBe(1);
    });

    it("caps long status text and session detail", () => {
      const aibitat = {};
      recordTraceEvent(aibitat, "statusResponse", "x".repeat(5_000));
      expect(aibitat._pendingTrace[0].content.length).toBeLessThan(5_000);
      expect(aibitat._pendingTrace[0].content).toContain("truncated");
      recordTraceEvent(aibitat, "sessionCard", {
        label: "l",
        detail: "y".repeat(5_000),
      });
      expect(aibitat._pendingTrace[1].content.detail).toContain("truncated");
    });

    it("stops past the event cap", () => {
      const aibitat = { _pendingTrace: new Array(MAX_TRACE_EVENTS).fill({}) };
      expect(recordTraceEvent(aibitat, "statusResponse", "one more")).toBe(
        false
      );
      expect(aibitat._pendingTrace).toHaveLength(MAX_TRACE_EVENTS);
    });

    it("tolerates missing instances", () => {
      expect(recordTraceEvent(null, "statusResponse", "x")).toBe(false);
      expect(recordTraceEvent(undefined, "statusResponse", "x")).toBe(false);
    });
  });

  describe("recordThoughtText", () => {
    it("records each think block in order and skips plain text", () => {
      const aibitat = {};
      recordThoughtText(aibitat, "no thoughts here");
      expect(ensureTrace(aibitat)).toHaveLength(0);
      recordThoughtText(
        aibitat,
        "<think>first</think>mid<think>second</think>"
      );
      expect(aibitat._pendingTrace).toEqual([
        { type: "thoughtChain", content: "first" },
        { type: "thoughtChain", content: "second" },
      ]);
    });

    it("never throws on odd input", () => {
      expect(() => recordThoughtText({}, null)).not.toThrow();
      expect(() => recordThoughtText(null, "<think>x</think>")).not.toThrow();
    });
  });

  describe("wrapRawSocketForTrace", () => {
    it("records allowlisted frames through the raw send and passes all through", () => {
      const sent = [];
      const socket = { send: (msg) => sent.push(msg) };
      const aibitat = {};
      wrapRawSocketForTrace(aibitat, socket);
      socket.send(JSON.stringify({ type: "statusResponse", content: "working" }));
      socket.send(JSON.stringify({ type: "reportStreamEvent", content: {} }));
      socket.send("not-json{{{");
      expect(sent).toHaveLength(3);
      expect(aibitat._pendingTrace).toEqual([
        { type: "statusResponse", content: "working" },
      ]);
    });

    it("wraps once and tolerates missing sockets", () => {
      const socket = { send: jest.fn() };
      wrapRawSocketForTrace({}, socket);
      const first = socket.send;
      wrapRawSocketForTrace({}, socket);
      expect(socket.send).toBe(first);
      expect(() => wrapRawSocketForTrace({}, null)).not.toThrow();
      expect(() => wrapRawSocketForTrace({}, {})).not.toThrow();
      expect(() => wrapRawSocketForTrace(null, socket)).not.toThrow();
    });
  });

  describe("takeTrace / clearTrace", () => {
    it("returns a copy and clears on demand", () => {
      const aibitat = {};
      recordTraceEvent(aibitat, "statusResponse", "a");
      const taken = takeTrace(aibitat);
      expect(taken).toHaveLength(1);
      taken.push({ type: "x" });
      expect(takeTrace(aibitat)).toHaveLength(1);
      clearTrace(aibitat);
      expect(takeTrace(aibitat)).toEqual([]);
      expect(takeTrace(null)).toEqual([]);
    });
  });
});
