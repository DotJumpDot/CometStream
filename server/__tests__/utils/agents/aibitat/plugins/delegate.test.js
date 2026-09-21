/**
 * Tests for the delegate-task (subagent) skill: nesting guard, input
 * validation, timeout clamping, and child prompt/tool wiring.
 */
const {
  isNestedSubAgent,
  subAgentTimeoutMs,
  subAgentSystemPrompt,
  attachChildTools,
  buildChildAibitat,
  SUBAGENT_MAX_TOOL_CALLS,
  MAX_TASK_CHARS,
} = require("../../../../../utils/agents/aibitat/plugins/delegate");

describe("delegate-task skill", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.AGENT_SUBAGENT_TIMEOUT_MS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("isNestedSubAgent", () => {
    it("refuses delegation from inside a subagent", () => {
      expect(isNestedSubAgent(null)).toBe(false);
      expect(isNestedSubAgent({})).toBe(false);
      expect(
        isNestedSubAgent({ handlerProps: { isSubAgent: true } })
      ).toBe(true);
      expect(
        isNestedSubAgent({ handlerProps: { subAgentDepth: 1 } })
      ).toBe(true);
      expect(
        isNestedSubAgent({ handlerProps: { subAgentDepth: 0 } })
      ).toBe(false);
    });
  });

  describe("subAgentTimeoutMs", () => {
    it("defaults to 120s and clamps to [10s, 600s]", () => {
      expect(subAgentTimeoutMs()).toBe(120_000);
      process.env.AGENT_SUBAGENT_TIMEOUT_MS = "1000";
      expect(subAgentTimeoutMs()).toBe(10_000);
      process.env.AGENT_SUBAGENT_TIMEOUT_MS = "9999999";
      expect(subAgentTimeoutMs()).toBe(600_000);
      process.env.AGENT_SUBAGENT_TIMEOUT_MS = "60000";
      expect(subAgentTimeoutMs()).toBe(60_000);
    });
  });

  describe("subAgentSystemPrompt", () => {
    it("scopes the child and forces structured submit", () => {
      const prompt = subAgentSystemPrompt("scaffold backend");
      expect(prompt).toContain("scaffold backend");
      expect(prompt).toContain("submit-task-result");
      expect(prompt).toContain("cannot spawn");
    });
  });

  describe("attachChildTools", () => {
    it("attaches a bounded toolset without the delegate itself", () => {
      const used = [];
      const fakeChild = {
        use: (plugin) => {
          used.push(plugin);
          return fakeChild;
        },
      };
      const attached = attachChildTools(fakeChild);
      expect(attached.length).toBeGreaterThan(0);
      expect(attached).not.toContain("delegate-task");
      expect(attached).toContain("terminal-agent");
      expect(attached).toContain("todo-write");
      expect(attached).toContain(
        "filesystem-agent#filesystem-read-text-file"
      );
    });

    it("skips tools that fail to attach", () => {
      const fakeChild = {
        use: () => {
          throw new Error("nope");
        },
      };
      expect(attachChildTools(fakeChild)).toEqual([]);
    });
  });

  describe("buildChildAibitat", () => {
    it("inherits provider/model and arms the provider instance", () => {
      const parent = {
        provider: "custom:6",
        model: "Apodex-35B",
        handlerProps: { log: () => {} },
        introspect: () => {},
        socket: null,
        defaultProvider: { provider: "custom:6", model: "Apodex-35B" },
      };
      const { child, attached } = buildChildAibitat(parent);
      expect(child.provider).toBe("custom:6");
      expect(child.model).toBe("Apodex-35B");
      expect(child.handlerProps.isSubAgent).toBe(true);
      expect(child.handlerProps.subAgentDepth).toBe(1);
      expect(child.maxToolCalls).toBe(SUBAGENT_MAX_TOOL_CALLS);
      // Regression: execution reads this.providerInstance, never args.
      expect(child.providerInstance).toBeTruthy();
      expect(attached.length).toBeGreaterThan(0);
      expect(attached).not.toContain("delegate-task");

      // Depth increments from an already-nested parent (guarded at runtime).
      const nested = buildChildAibitat({
        ...parent,
        handlerProps: { ...parent.handlerProps, subAgentDepth: 1 },
      });
      expect(nested.child.handlerProps.subAgentDepth).toBe(2);
    });
  });

  describe("budgets", () => {
    it("caps child cost below a normal agent turn", () => {
      expect(SUBAGENT_MAX_TOOL_CALLS).toBeLessThanOrEqual(15);
      expect(MAX_TASK_CHARS).toBeGreaterThan(0);
    });
  });
});
