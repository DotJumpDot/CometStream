// Set required env vars before requiring modules
process.env.STORAGE_DIR = __dirname;
process.env.NODE_ENV = "test";

const { SystemPromptVariables } = require("../../../models/systemPromptVariables");
const { SystemSettings } = require("../../../models/systemSettings");
const Provider = require("../../../utils/agents/aibitat/providers/ai-provider");

jest.mock("../../../models/systemPromptVariables");
jest.mock("../../../models/systemSettings");
jest.mock("../../../utils/agents/imported", () => ({
  activeImportedPlugins: jest.fn().mockReturnValue([]),
}));
jest.mock("../../../utils/agentFlows", () => ({
  AgentFlows: {
    activeFlowPlugins: jest.fn().mockReturnValue([]),
  },
}));
jest.mock("../../../utils/MCP", () => {
  return jest.fn().mockImplementation(() => ({
    activeMCPServers: jest.fn().mockResolvedValue([]),
  }));
});

const {
  WORKSPACE_AGENT,
  resolveAgentSkill,
  TERMINAL_COMPANION_TOOLS,
} = require("../../../utils/agents/defaults");

describe("WORKSPACE_AGENT.getDefinition", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    SystemPromptVariables.expandSystemPromptVariables.mockReset();
    SystemPromptVariables.expandSystemPromptVariables.mockImplementation(
      async (prompt) => prompt.replace("{datetime}", "January 1, 2024 12:00 PM")
    );
    // Mock SystemSettings to return empty arrays for agent skills
    SystemSettings.getValueOrFallback = jest.fn().mockResolvedValue("[]");
  });

  it("should use saneDefaultSystemPrompt when workspace has no openAiPrompt", async () => {
    const workspace = {
      id: 1,
      name: "Test Workspace",
      openAiPrompt: null,
    };
    const user = { id: 1 };
    const provider = "openai";
    const expectedPrompt = await Provider.systemPrompt({ workspace, user });
    const definition = await WORKSPACE_AGENT.getDefinition(
      provider,
      workspace,
      user
    );
    expect(definition.role.startsWith(expectedPrompt)).toBe(true);
    expect(definition.role).toContain("Visible progress notes");
    expect(SystemPromptVariables.expandSystemPromptVariables).toHaveBeenCalledWith(
      SystemSettings.saneDefaultSystemPrompt,
      user.id,
      workspace.id
    );
  });

  it("should use workspace system prompt with variable expansion when openAiPrompt exists", async () => {
    const workspace = {
      id: 1,
      name: "Test Workspace",
      openAiPrompt: "You are a helpful assistant for {workspace.name}. The current user is {user.name}.",
    };
    const user = { id: 1 };
    const provider = "openai";

    const expandedPrompt = "You are a helpful assistant for Test Workspace. The current user is John Doe.";
    SystemPromptVariables.expandSystemPromptVariables.mockResolvedValue(expandedPrompt);

    const definition = await WORKSPACE_AGENT.getDefinition(
      provider,
      workspace,
      user
    );

    expect(SystemPromptVariables.expandSystemPromptVariables).toHaveBeenCalledWith(
      workspace.openAiPrompt,
      user.id,
      workspace.id
    );
    expect(definition.role.startsWith(expandedPrompt)).toBe(true);
    expect(definition.role).toContain("Visible progress notes");
  });

  it("should handle workspace system prompt without user context", async () => {
    const workspace = {
      id: 1,
      name: "Test Workspace",
      openAiPrompt: "You are a helpful assistant. Today is {date}.",
    };
    const user = null;
    const provider = "lmstudio";
    const expandedPrompt = "You are a helpful assistant. Today is January 1, 2024.";
    SystemPromptVariables.expandSystemPromptVariables.mockResolvedValue(expandedPrompt);

    const definition = await WORKSPACE_AGENT.getDefinition(
      provider,
      workspace,
      user
    );

    expect(SystemPromptVariables.expandSystemPromptVariables).toHaveBeenCalledWith(
      workspace.openAiPrompt,
      null,
      workspace.id
    );
    expect(definition.role.startsWith(expandedPrompt)).toBe(true);
    expect(definition.role).toContain("Visible progress notes");
  });

  it("should return functions array in definition", async () => {
    const workspace = { id: 1, openAiPrompt: null };
    const provider = "openai";

    const definition = await WORKSPACE_AGENT.getDefinition(
      provider,
      workspace,
      null
    );

    expect(definition).toHaveProperty("functions");
    expect(Array.isArray(definition.functions)).toBe(true);
  });

  it("should use saneDefaultSystemPrompt for all providers when workspace has no openAiPrompt", async () => {
    const workspace = { id: 1, openAiPrompt: null };
    const user = null;
    const provider = "lmstudio";
    const definition = await WORKSPACE_AGENT.getDefinition(
      provider,
      workspace,
      null
    );

    expect(definition.role.startsWith(await Provider.systemPrompt({ workspace, user }))).toBe(true);
    expect(definition.role).toContain("Visible progress notes");
    expect(SystemPromptVariables.expandSystemPromptVariables).toHaveBeenCalledWith(
      SystemSettings.saneDefaultSystemPrompt,
      null,
      workspace.id
    );
  });

  it("appends mandatory per-turn progress-note protocol to the role", async () => {
    const workspace = { id: 1, openAiPrompt: null };
    const definition = await WORKSPACE_AGENT.getDefinition(
      "openai",
      workspace,
      null
    );

    expect(definition.role).toContain("Visible progress notes (mandatory");
    expect(definition.role).toContain("MUST start with 1-2 plain sentences");
    expect(definition.role).toContain("what you will try next");
    expect(definition.role).toContain(
      "never emit a tool-calling turn with empty visible text"
    );
  });

  it("appends mandatory plan-first protocol for 3+ step tasks to the role", async () => {
    const workspace = { id: 1, openAiPrompt: null };
    const definition = await WORKSPACE_AGENT.getDefinition(
      "openai",
      workspace,
      null
    );

    expect(definition.role).toContain("Plan first for multi-step work");
    expect(definition.role).toContain("FIRST tool call MUST be todo-write");
    expect(definition.role).toContain("3 or more steps");
    expect(definition.role).toContain("Never restate or paraphrase");
  });

  it("documents plan mode for design-before-code tasks", async () => {
    const workspace = { id: 1, openAiPrompt: null };
    const definition = await WORKSPACE_AGENT.getDefinition(
      "openai",
      workspace,
      null
    );

    expect(definition.role).toContain("enter-plan-mode");
    expect(definition.role).toContain("exit-plan-mode");
    expect(definition.role).toMatch(/FIRST tool call MUST be enter-plan-mode/);
  });

  it("expands array-type default skills to parent#child load ids", async () => {
    // Regression: pushing the bare parent name ("plan-mode-agent") crashes
    // the single-stage attach path (plugin.plugin is an array, not a
    // function) and kills the whole run before the first turn.
    const workspace = { id: 1, openAiPrompt: null };
    const definition = await WORKSPACE_AGENT.getDefinition(
      "openai",
      workspace,
      null
    );

    expect(definition.functions).toContain(
      "plan-mode-agent#enter-plan-mode"
    );
    expect(definition.functions).toContain("plan-mode-agent#exit-plan-mode");
    expect(definition.functions).not.toContain("plan-mode-agent");
  });
});

describe("terminal companion tools", () => {
  it("expands terminal-agent toggles to the background task tools", async () => {
    const resolved = await resolveAgentSkill("terminal-agent");
    expect(resolved.loadable).toContain("terminal-agent");
    expect(resolved.registered).toContain("terminal-agent");
    for (const tool of TERMINAL_COMPANION_TOOLS) {
      expect(resolved.loadable).toContain(tool);
      expect(resolved.registered).toContain(tool);
    }
  });

  it("leaves unrelated skills unexpanded", async () => {
    const AgentPlugins = require("../../../utils/agents/aibitat/plugins");
    const name = AgentPlugins.docSummarizer.name;
    const resolved = await resolveAgentSkill(name);
    expect(resolved).toEqual({ loadable: [name], registered: [name] });
  });

  it("offers background tools in the session function list", async () => {
    SystemSettings.getValueOrFallback = jest.fn(async ({ label }) => {
      if (label === "default_agent_skills")
        return JSON.stringify(["terminal-agent"]);
      return "[]";
    });
    const definition = await WORKSPACE_AGENT.getDefinition(
      "openai",
      { id: 1, openAiPrompt: null },
      null
    );
    expect(definition.functions).toContain("terminal-agent");
    for (const tool of TERMINAL_COMPANION_TOOLS) {
      expect(definition.functions).toContain(tool);
    }
  });
});
