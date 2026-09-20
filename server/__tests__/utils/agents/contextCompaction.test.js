const {
  estimateTokens,
  normalizeThresholdPct,
  shouldAutoCompact,
  splitForCompaction,
  buildSummaryTranscript,
  agentHistoryFromRows,
  isCompactCommand,
  stripReasoning,
  KEEP_TAIL_ROWS,
} = require("../../../utils/agents/contextCompaction");

jest.mock("../../../models/workspaceChats", () => ({}));
jest.mock("../../../models/workspace", () => ({}));
jest.mock("../../../utils/files", () => ({
  generatedImageAttachments: jest.fn(() => []),
}));

describe("estimateTokens", () => {
  it("estimates ~4 chars per token", () => {
    expect(estimateTokens("a".repeat(400))).toBe(100);
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens(null)).toBe(0);
  });
});

describe("normalizeThresholdPct", () => {
  it("clamps to 30-95 and defaults to 75", () => {
    expect(normalizeThresholdPct(50)).toBe(50);
    expect(normalizeThresholdPct(10)).toBe(30);
    expect(normalizeThresholdPct(120)).toBe(95);
    expect(normalizeThresholdPct(undefined)).toBe(75);
    expect(normalizeThresholdPct("abc")).toBe(75);
  });
});

describe("shouldAutoCompact", () => {
  const base = { contextWindow: 10_000, thresholdPct: 75, rowCount: 20 };

  it("fires when the estimate crosses the budget", () => {
    // budget = 7500 - 4000 reserve => estimate must be >= 3500
    expect(
      shouldAutoCompact({ ...base, estimatedTokens: 5_000 })
    ).toBe(true);
  });

  it("does not fire under the budget", () => {
    expect(shouldAutoCompact({ ...base, estimatedTokens: 1_000 })).toBe(false);
  });

  it("never fires without a context window", () => {
    expect(
      shouldAutoCompact({
        ...base,
        contextWindow: null,
        estimatedTokens: 999_999,
      })
    ).toBe(false);
  });

  it("never fires when there is too little history to compact", () => {
    expect(
      shouldAutoCompact({ ...base, estimatedTokens: 9_000, rowCount: 5 })
    ).toBe(false);
    expect(
      shouldAutoCompact({
        ...base,
        estimatedTokens: 9_000,
        rowCount: KEEP_TAIL_ROWS + 2,
      })
    ).toBe(false);
    expect(
      shouldAutoCompact({
        ...base,
        estimatedTokens: 9_000,
        rowCount: KEEP_TAIL_ROWS + 3,
      })
    ).toBe(true);
  });
});

describe("splitForCompaction", () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));

  it("keeps the tail rows verbatim and compacts the rest", () => {
    const { toCompact, toKeep } = splitForCompaction(rows);
    expect(toKeep).toHaveLength(KEEP_TAIL_ROWS);
    expect(toKeep.map((r) => r.id)).toEqual([7, 8, 9, 10]);
    expect(toCompact.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("compacts nothing when history is too short", () => {
    const { toCompact, toKeep } = splitForCompaction(rows.slice(0, 5));
    expect(toCompact).toEqual([]);
    expect(toKeep).toHaveLength(5);
  });
});

describe("buildSummaryTranscript", () => {
  it("labels each exchange with role markers", () => {
    const transcript = buildSummaryTranscript([
      { prompt: "hello", response: JSON.stringify({ text: "hi there" }) },
    ]);
    expect(transcript).toContain("[1] User: hello");
    expect(transcript).toContain("[1] Assistant: hi there");
  });

  it("caps runaway messages", () => {
    const long = "x".repeat(30_000);
    const transcript = buildSummaryTranscript([
      { prompt: long, response: JSON.stringify({ text: long }) },
    ]);
    expect(transcript.length).toBeLessThan(45_000);
    expect(transcript).toContain("truncated at 20000 chars");
  });
});

describe("agentHistoryFromRows", () => {
  it("maps normal rows to user/assistant pairs", () => {
    const history = agentHistoryFromRows([
      { prompt: "q", response: JSON.stringify({ text: "a" }) },
    ]);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ content: "q", state: "success" });
    expect(history[1]).toMatchObject({ content: "a", state: "success" });
  });

  it("injects a compact row as a single summary message that leads the buffer", () => {
    const history = agentHistoryFromRows([
      { prompt: "after", response: JSON.stringify({ text: "reply" }) },
      {
        prompt: "/compact",
        response: JSON.stringify({ text: "the summary", type: "compact" }),
      },
    ]);
    // The compact row sorts first even though its id (and so its input
    // position) is after the kept rows - it summarizes everything older.
    expect(history).toHaveLength(3);
    expect(history[0].content).toContain("compacted");
    expect(history[0].content).toContain("the summary");
    expect(history[1].content).toBe("after");
    expect(history[2].content).toBe("reply");
  });
});

describe("isCompactCommand", () => {
  it("matches /compact with optional trailing text and case", () => {
    expect(isCompactCommand("/compact")).toBe(true);
    expect(isCompactCommand("/COMPACT now")).toBe(true);
    expect(isCompactCommand("  /compact  ")).toBe(true);
  });

  it("does not match other commands or prose", () => {
    expect(isCompactCommand("/compaction")).toBe(false);
    expect(isCompactCommand("compact")).toBe(false);
    expect(isCompactCommand("/img")).toBe(false);
  });
});

describe("stripReasoning", () => {
  it("removes closed think blocks", () => {
    expect(
      stripReasoning("<think>chain of thought</think>\nActual summary.")
    ).toBe("Actual summary.");
  });

  it("drops everything after a dangling unclosed opener", () => {
    expect(stripReasoning("Summary start <think> runaway thoughts")).toBe(
      "Summary start"
    );
  });

  it("leaves plain text untouched", () => {
    expect(stripReasoning("  plain summary  ")).toBe("plain summary");
  });
});
