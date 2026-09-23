/**
 * Tests for AIbitat.resolveMaxToolCalls: ENV wins, then the in-app
 * `agent_max_tool_calls` system setting, then the 10-call default.
 */
jest.mock("../../../../models/systemSettings", () => ({
  SystemSettings: {
    getValueOrFallback: jest.fn(async () => ""),
  },
}));

const { SystemSettings } = require("../../../../models/systemSettings");
const AIbitat = require("../../../../utils/agents/aibitat");

describe("AIbitat.resolveMaxToolCalls", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.AGENT_MAX_TOOL_CALLS;
    jest.clearAllMocks();
    SystemSettings.getValueOrFallback.mockResolvedValue("");
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("prefers a valid ENV value without touching the DB", async () => {
    process.env.AGENT_MAX_TOOL_CALLS = "25";
    expect(await AIbitat.resolveMaxToolCalls()).toBe(25);
    expect(SystemSettings.getValueOrFallback).not.toHaveBeenCalled();
  });

  it("caps the ENV value at the hard cap", async () => {
    process.env.AGENT_MAX_TOOL_CALLS = "9999";
    expect(await AIbitat.resolveMaxToolCalls()).toBe(
      AIbitat.MAX_TOOL_CALLS_HARD_CAP
    );
  });

  it("falls back to the in-app setting when ENV is unset", async () => {
    SystemSettings.getValueOrFallback.mockResolvedValue("50");
    expect(await AIbitat.resolveMaxToolCalls()).toBe(50);
    expect(SystemSettings.getValueOrFallback).toHaveBeenCalledWith(
      { label: "agent_max_tool_calls" },
      ""
    );
  });

  it("returns the default when nothing is configured", async () => {
    expect(await AIbitat.resolveMaxToolCalls()).toBe(10);
  });

  it("ignores non-numeric setting values", async () => {
    SystemSettings.getValueOrFallback.mockResolvedValue("lots");
    expect(await AIbitat.resolveMaxToolCalls()).toBe(10);
  });

  it("caps the setting value at the hard cap", async () => {
    SystemSettings.getValueOrFallback.mockResolvedValue("5000");
    expect(await AIbitat.resolveMaxToolCalls()).toBe(
      AIbitat.MAX_TOOL_CALLS_HARD_CAP
    );
  });

  it("fails open to the default when the settings lookup throws", async () => {
    SystemSettings.getValueOrFallback.mockRejectedValue(new Error("db down"));
    expect(await AIbitat.resolveMaxToolCalls()).toBe(10);
  });
});
