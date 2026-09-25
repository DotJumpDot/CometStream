/**
 * Tests for plan mode (ZCode-style approval-gated design phase):
 * allowlist gate, plan sanitizing, enter/exit handlers, and approval flow.
 */
const {
  planMode,
  EnterPlanMode,
  ExitPlanMode,
  isPlanMode,
  isToolAllowedInPlanMode,
  planModeDenialHint,
  sanitizePlan,
  PLAN_MAX_CHARS,
  PLAN_MIN_CHARS,
} = require("../../../../../utils/agents/aibitat/plugins/plan-mode.js");

function captureDef(plugin) {
  const captured = [];
  plugin.plugin().setup({ function: (def) => captured.push(def) });
  return captured[0];
}

// Minimal aibitat double: the handlers only touch handlerProps.log,
// introspect, _planMode, socket.send, and requestToolApproval.
function fakeAibitat(overrides = {}) {
  const sent = [];
  return {
    sent,
    introspected: [],
    handlerProps: { log: () => {} },
    _planMode: false,
    socket: { send: (type, content) => sent.push({ type, content }) },
    introspect(text) {
      this.introspected.push(text);
    },
    caller: "agent",
    ...overrides,
  };
}

async function callHandler(def, aibitat, args) {
  return def.handler.call({ super: aibitat, caller: "agent" }, args);
}

describe("plan mode skill", () => {
  describe("sanitizePlan", () => {
    it("rejects empty or non-string plans", () => {
      expect(sanitizePlan("").error).toMatch(/non-empty/i);
      expect(sanitizePlan("   ").error).toMatch(/non-empty/i);
      expect(sanitizePlan(null).error).toMatch(/non-empty/i);
      expect(sanitizePlan(42).error).toMatch(/non-empty/i);
    });

    it("trims and caps the doc", () => {
      const { plan, error } = sanitizePlan(
        "  ## Goal\nBuild it.  " + "x".repeat(PLAN_MAX_CHARS + 100)
      );
      expect(error).toBeNull();
      expect(plan.startsWith("## Goal")).toBe(true);
      expect(plan).toHaveLength(PLAN_MAX_CHARS);
    });

    it("bounces thin restatements with the section list", () => {
      const { plan, error } = sanitizePlan("Do the thing as asked.");
      expect(plan).toBe("");
      expect(error).toMatch(/too thin/);
      expect(error).toMatch(/Exploration findings/);
      expect(error).toMatch(new RegExp(String(PLAN_MIN_CHARS)));
    });
  });

  describe("isPlanMode / isToolAllowedInPlanMode", () => {
    it("reads the per-run flag", () => {
      expect(isPlanMode({})).toBe(false);
      expect(isPlanMode({ _planMode: true })).toBe(true);
      expect(isPlanMode(null)).toBe(false);
    });

    it("allows read-only exploration tools", () => {
      for (const name of [
        "todo-write",
        "request-user-input",
        "filesystem-list-directory",
        "filesystem-read-text-file",
        "filesystem-read-multiple-files",
        "filesystem-search-files",
        "filesystem-get-file-info",
        "web-browsing",
        "web-scraping",
        "document-summarizer",
        "chat-history",
        "task-output",
        "enter-plan-mode",
        "exit-plan-mode",
      ])
        expect(isToolAllowedInPlanMode(name, {})).toBe(true);
    });

    it("blocks mutating, delegating, external, and unknown tools", () => {
      for (const name of [
        "filesystem-write-text-file",
        "filesystem-edit-file",
        "filesystem-create-directory",
        "terminal-task-start",
        "task-stop",
        "delegate-task",
        "sql-query",
        "rag-memory",
        "create-text-file",
        "generate-image",
        "@@mcp_filesystem-read",
        "@@skill_docs",
        "no-such-tool",
      ])
        expect(isToolAllowedInPlanMode(name, {})).toBe(false);
    });

    it("allows terminal-agent only for read-only commands", () => {
      expect(isToolAllowedInPlanMode("terminal-agent", { command: "ls -la" })).toBe(true);
      expect(
        isToolAllowedInPlanMode("terminal-agent", { command: "git status" })
      ).toBe(true);
      expect(
        isToolAllowedInPlanMode("terminal-agent", { command: "npm install" })
      ).toBe(false);
      expect(
        isToolAllowedInPlanMode("terminal-agent", {
          command: "echo hi > out.txt",
        })
      ).toBe(false);
      expect(isToolAllowedInPlanMode("terminal-agent", {})).toBe(false);
      expect(isToolAllowedInPlanMode("terminal-agent", null)).toBe(false);
    });
  });

  describe("planModeDenialHint", () => {
    it("names a read-only replacement per blocked tool", () => {
      expect(planModeDenialHint("terminal-task-start")).toMatch(
        /terminal-agent.*foreground/i
      );
      expect(planModeDenialHint("terminal-agent")).toMatch(/read-only/i);
      expect(planModeDenialHint("filesystem-write-text-file")).toMatch(
        /filesystem-read/i
      );
      expect(planModeDenialHint("delegate-task")).toMatch(/no subagents/i);
      expect(planModeDenialHint("task-stop")).toMatch(/task-output/i);
    });

    it("returns empty for tools covered by the generic message", () => {
      expect(planModeDenialHint("sql-query")).toBe("");
      expect(planModeDenialHint("todo-write")).toBe("");
    });
  });

  describe("tool registration", () => {    it("registers two tools under one loader plugin", () => {
      expect(planMode.name).toBe("plan-mode-agent");
      expect(planMode.plugin).toHaveLength(2);
      expect(captureDef(EnterPlanMode).name).toBe("enter-plan-mode");
      const exit = captureDef(ExitPlanMode);
      expect(exit.name).toBe("exit-plan-mode");
      expect(exit.parameters.required).toContain("plan");
    });

    it("documents the explore-then-submit contract", () => {
      expect(captureDef(EnterPlanMode).description).toMatch(/read-only/i);
      expect(captureDef(ExitPlanMode).description).toMatch(/todo-write/i);
    });
  });

  describe("enter-plan-mode handler", () => {
    it("sets the flag and narrates the lock", async () => {
      const aibitat = fakeAibitat();
      const result = await callHandler(captureDef(EnterPlanMode), aibitat, {});
      expect(aibitat._planMode).toBe(true);
      expect(result).toMatch(/read-only|read tools/i);
      expect(aibitat.introspected.join(" ")).toMatch(/plan mode/i);
    });

    it("refuses a second plan in the middle of the active one", async () => {
      const aibitat = fakeAibitat({ _planMode: true });
      const result = await callHandler(captureDef(EnterPlanMode), aibitat, {});
      expect(result).toMatch(/already in plan mode/i);
      expect(aibitat._planMode).toBe(true);
    });

    it("allows a fresh cycle after an approved exit", async () => {
      const aibitat = fakeAibitat({ _planMode: false });
      const result = await callHandler(captureDef(EnterPlanMode), aibitat, {});
      expect(aibitat._planMode).toBe(true);
      expect(result).toMatch(/plan mode active/i);
    });
  });

  describe("exit-plan-mode handler", () => {
    const REAL_ENV = process.env.PLAN_MODE_AUTO_APPROVE;
    afterEach(() => {
      if (REAL_ENV === undefined) delete process.env.PLAN_MODE_AUTO_APPROVE;
      else process.env.PLAN_MODE_AUTO_APPROVE = REAL_ENV;
    });

    it("refuses when not in plan mode", async () => {
      const aibitat = fakeAibitat();
      const result = await callHandler(captureDef(ExitPlanMode), aibitat, {
        plan: "## Goal\nDo things. " + "x".repeat(300),
      });
      expect(result).toMatch(/not in plan mode/i);
      expect(aibitat.sent).toHaveLength(0);
    });

    it("rejects empty plans without asking", async () => {
      const aibitat = fakeAibitat({ _planMode: true });
      const result = await callHandler(captureDef(ExitPlanMode), aibitat, {
        plan: "  ",
      });
      expect(result).toMatch(/non-empty/i);
      expect(aibitat.sent).toHaveLength(0);
      expect(aibitat._planMode).toBe(true);
    });

    it("rejects invalid todos and stays in plan mode", async () => {
      process.env.PLAN_MODE_AUTO_APPROVE = "0";
      const prompted = [];
      const aibitat = fakeAibitat({
        _planMode: true,
        requestToolApproval: async (opts) => {
          prompted.push(opts);
          return { approved: true, message: "ok" };
        },
      });
      const result = await callHandler(captureDef(ExitPlanMode), aibitat, {
        plan: "## Goal\nDo things. " + "x".repeat(300),
        todos: [{ status: "pending" }],
      });
      expect(result).toMatch(/no valid todo items/i);
      expect(aibitat._planMode).toBe(true);
      expect(prompted).toHaveLength(0);
      // The failed submission still settles the streaming row visibly.
      const rejected = aibitat.sent.filter(
        (e) => e.type === "planCard" && e.content.status === "rejected"
      );
      expect(rejected).toHaveLength(1);
      expect(rejected[0].content.plan).toContain("## Goal");
    });

    it("rejects exploration progress miscopied as plan todos", async () => {
      process.env.PLAN_MODE_AUTO_APPROVE = "0";
      const prompted = [];
      const aibitat = fakeAibitat({
        _planMode: true,
        requestToolApproval: async (opts) => {
          prompted.push(opts);
          return { approved: true, message: "ok" };
        },
      });
      const longPlan = "## Goal\nDo things. " + "x".repeat(300);
      const result = await callHandler(captureDef(ExitPlanMode), aibitat, {
        plan: longPlan,
        todos: [
          { content: "Read the brief", status: "done" },
          { content: "Build it", status: "pending" },
        ],
      });
      expect(result).toMatch(/upcoming build steps.*all pending/i);
      expect(aibitat._planMode).toBe(true);
      expect(prompted).toHaveLength(0);
      const rejected = aibitat.sent.filter(
        (e) => e.type === "planCard" && e.content.status === "rejected"
      );
      expect(rejected).toHaveLength(1);
    });

    it("auto-approves by default and seeds plan todos", async () => {
      delete process.env.PLAN_MODE_AUTO_APPROVE;
      let prompted = 0;
      const aibitat = fakeAibitat({
        _planMode: true,
        requestToolApproval: async () => {
          prompted++;
          return { approved: true, message: "ok" };
        },
      });
      const result = await callHandler(captureDef(ExitPlanMode), aibitat, {
        plan: "## Goal\nRate limit logins. " + "x".repeat(300),
        todos: [
          { content: "Add middleware", status: "pending" },
          { content: "Test it", status: "pending" },
        ],
      });
      expect(prompted).toBe(0);
      expect(aibitat._planMode).toBe(false);
      expect(result).toMatch(/auto-approved/i);
      expect(result).toMatch(/already seeded/i);
      expect(result).toContain("## Approved Plan:");
      const todoCards = aibitat.sent.filter((e) => e.type === "todoListCard");
      expect(todoCards).toHaveLength(1);
      expect(todoCards[0].content.items).toHaveLength(2);
      const statuses = aibitat.sent
        .filter((e) => e.type === "planCard")
        .map((e) => e.content.status);
      expect(statuses).toEqual(["proposed", "approved"]);
    });

    it("prompts the user when auto-approve is off, then hands off", async () => {
      process.env.PLAN_MODE_AUTO_APPROVE = "0";
      const aibitat = fakeAibitat({
        _planMode: true,
        requestToolApproval: async (opts) => {
          expect(opts.skillName).toBe("exit-plan-mode");
          expect(opts.forcePrompt).toBe(true);
          expect(opts.payload.plan).toContain("Rate limit");
          return { approved: true, message: "User approved." };
        },
      });
      const result = await callHandler(captureDef(ExitPlanMode), aibitat, {
        plan: "## Goal\nRate limit logins. " + "x".repeat(300),
      });
      expect(aibitat._planMode).toBe(false);
      expect(result).toMatch(/approved your plan/i);
      expect(result).toMatch(/todo-write/i);
      expect(result).toContain("## Approved Plan:");
      const statuses = aibitat.sent.map((e) => e.content.status);
      expect(statuses).toEqual(["proposed", "approved"]);
    });

    it("on denial stays in plan mode and records rejection", async () => {
      process.env.PLAN_MODE_AUTO_APPROVE = "0";
      const aibitat = fakeAibitat({
        _planMode: true,
        requestToolApproval: async () => ({
          approved: false,
          message: "Tool call was rejected by the user.",
        }),
      });
      const result = await callHandler(captureDef(ExitPlanMode), aibitat, {
        plan: "## Goal\nRate limit logins. " + "x".repeat(300),
      });
      expect(aibitat._planMode).toBe(true);
      expect(result).toMatch(/still in plan mode/i);
      const statuses = aibitat.sent.map((e) => e.content.status);
      expect(statuses).toEqual(["proposed", "rejected"]);
    });

    it("degrades honestly when approvals are unavailable", async () => {
      const aibitat = fakeAibitat({ _planMode: true });
      delete aibitat.requestToolApproval;
      const result = await callHandler(captureDef(ExitPlanMode), aibitat, {
        plan: "## Goal\nRate limit logins. " + "x".repeat(300),
      });
      expect(result).toMatch(/not available/i);
      expect(aibitat._planMode).toBe(true);
      const rejected = aibitat.sent.filter(
        (e) => e.type === "planCard" && e.content.status === "rejected"
      );
      expect(rejected).toHaveLength(1);
    });
  });
});
