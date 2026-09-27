/**
 * Tests for built-in provider management helpers: disconnecting credentials
 * and validating the hidden-models curation map.
 */
const {
  disconnectProviderEnv,
  validHiddenBuiltinModels,
} = require("../../../utils/helpers/updateENV");

describe("disconnectProviderEnv", () => {
  const SAVED = {};
  beforeEach(() => {
    for (const key of ["OPEN_AI_KEY", "OPEN_MODEL_PREF", "LLM_PROVIDER"]) {
      SAVED[key] = process.env[key];
    }
    process.env.OPEN_AI_KEY = "sk-fake";
    process.env.OPEN_MODEL_PREF = "gpt-4o";
    process.env.LLM_PROVIDER = "openai";
  });
  afterEach(() => {
    for (const key of ["OPEN_AI_KEY", "OPEN_MODEL_PREF", "LLM_PROVIDER"]) {
      if (SAVED[key] === undefined) delete process.env[key];
      else process.env[key] = SAVED[key];
    }
  });

  it("deletes allowlisted credential keys and resets a matching system default", () => {
    const result = disconnectProviderEnv("openai", ["OpenAiKey"]);
    expect(result).toEqual({ disconnected: ["OpenAiKey"], resetDefault: true });
    expect(process.env.OPEN_AI_KEY).toBeUndefined();
    expect(process.env.LLM_PROVIDER).toBeUndefined();
    // Untouched keys survive.
    expect(process.env.OPEN_MODEL_PREF).toBe("gpt-4o");
  });

  it("keeps the system default when disconnecting another provider", () => {
    process.env.LLM_PROVIDER = "ollama";
    const result = disconnectProviderEnv("openai", ["OpenAiKey"]);
    expect(result.resetDefault).toBe(false);
    expect(process.env.LLM_PROVIDER).toBe("ollama");
  });

  it("refuses unknown setting keys so unrelated env cannot be cleared", () => {
    process.env.AUTH_TOKEN = "secret";
    try {
      expect(() =>
        disconnectProviderEnv("openai", ["OpenAiKey", "AUTH_TOKEN"])
      ).not.toThrow();
      // AUTH_TOKEN is not a KEY_MAPPING label, so only the known key clears.
      expect(process.env.AUTH_TOKEN).toBe("secret");
      expect(process.env.OPEN_AI_KEY).toBeUndefined();
    } finally {
      delete process.env.AUTH_TOKEN;
    }
  });

  it("throws when provider or keys are missing", () => {
    expect(() => disconnectProviderEnv("openai", [])).toThrow();
    expect(() => disconnectProviderEnv("", ["OpenAiKey"])).toThrow();
    expect(() => disconnectProviderEnv(null, ["OpenAiKey"])).toThrow();
  });
});

describe("validHiddenBuiltinModels", () => {
  it.each([[""], [null], [undefined]])("accepts empty %s", (input) => {
    expect(validHiddenBuiltinModels(input)).toBeNull();
  });

  it("accepts a well-formed map", () => {
    expect(
      validHiddenBuiltinModels('{"openai":["gpt-4"],"ollama":[]}')
    ).toBeNull();
  });

  it.each([
    ["not json", "{oops"],
    ["an array", "[]"],
    ["a string", '"openai"'],
    ["a number", "42"],
    ["non-array entries", '{"openai":"gpt-4"}'],
    ["non-string ids", '{"openai":[42]}'],
  ])("rejects %s", (_label, input) => {
    expect(typeof validHiddenBuiltinModels(input)).toBe("string");
  });
});
