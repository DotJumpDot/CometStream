/**
 * Tests for the tool-argument validation + repair module: malformed JSON,
 * missing/invalid required fields, and the model-facing repair format.
 */
const {
  validateToolCallArgs,
  formatArgRepair,
  normalizeArgs,
  ARGS_PARSE_ERROR_KEY,
  MAX_ARG_REPAIRS_PER_TURN,
} = require("../../../../../utils/agents/aibitat/utils/toolArgRepair");

const SCHEMA = {
  type: "object",
  properties: {
    command: { type: "string" },
    timeout: { type: "number" },
    tags: { type: "array" },
    options: { type: "object" },
  },
  required: ["command"],
  additionalProperties: false,
};
const FN = { name: "terminal-agent", parameters: SCHEMA };

describe("toolArgRepair", () => {
  describe("normalizeArgs", () => {
    it("passes objects through", () => {
      expect(normalizeArgs({ a: 1 })).toEqual({
        value: { a: 1 },
        rawExcerpt: null,
      });
    });

    it("parses JSON strings", () => {
      expect(normalizeArgs('{"a":1}').value).toEqual({ a: 1 });
    });

    it("reports unparseable strings with an excerpt", () => {
      const out = normalizeArgs('{"a":');
      expect(out.value).toBeNull();
      expect(out.rawExcerpt).toBe('{"a":');
    });

    it("rejects arrays and scalars", () => {
      expect(normalizeArgs([1]).value).toBeNull();
      expect(normalizeArgs(null).value).toBeNull();
    });
  });

  describe("validateToolCallArgs", () => {
    it("accepts valid calls and ignores extra keys", () => {
      expect(
        validateToolCallArgs(FN, {
          name: "terminal-agent",
          arguments: { command: "ls", junk: 1 },
        })
      ).toBeNull();
    });

    it("flags streamed parse failures without executing", () => {
      const issue = validateToolCallArgs(FN, {
        name: "terminal-agent",
        arguments: {},
        [ARGS_PARSE_ERROR_KEY]: '{"command": "ls',
      });
      expect(issue).toContain("not valid JSON");
      expect(issue).toContain('{"command": "ls');
    });

    it("flags missing required fields with received keys", () => {
      const issue = validateToolCallArgs(FN, {
        name: "terminal-agent",
        arguments: { timeout: 5 },
      });
      expect(issue).toContain('missing required field "command"');
      expect(issue).toContain("Received keys: timeout");
    });

    it("flags wrong-typed required fields", () => {
      const issue = validateToolCallArgs(FN, {
        name: "terminal-agent",
        arguments: { command: 42 },
      });
      expect(issue).toContain('"command" should be string');
    });

    it("accepts calls when no schema is registered", () => {
      expect(
        validateToolCallArgs({ name: "x" }, { arguments: { anything: 1 } })
      ).toBeNull();
      expect(validateToolCallArgs(null, { arguments: {} })).toBeNull();
    });

    it("flags string args that will not parse", () => {
      expect(
        validateToolCallArgs(FN, { arguments: "{oops" })
      ).toContain("not a JSON object");
    });
  });

  describe("formatArgRepair", () => {
    it("names the tool, the issue, the required shape, and the re-call", () => {
      const text = formatArgRepair(FN.name, 'missing required field "command"', FN);
      expect(text).toContain("terminal-agent");
      expect(text).toContain("NOT executed");
      expect(text).toContain("Required fields: command");
      expect(text).toContain("call \"terminal-agent\" again");
      expect(text).toContain("Do not explain");
    });
  });

  it("exports a sane per-turn repair cap", () => {
    expect(MAX_ARG_REPAIRS_PER_TURN).toBeGreaterThanOrEqual(1);
    expect(MAX_ARG_REPAIRS_PER_TURN).toBeLessThanOrEqual(5);
  });
});
