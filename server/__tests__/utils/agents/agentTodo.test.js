const {
  sanitizeTodoItems,
  agentTodo,
} = require("../../../utils/agents/aibitat/plugins/agent-todo.js");

describe("todo-write skill", () => {
  describe("sanitizeTodoItems", () => {
    it("normalizes valid items and keeps their status", () => {
      const { items, error } = sanitizeTodoItems([
        { content: "Step one", status: "done" },
        { content: "  Step two  ", status: "in_progress" },
      ]);
      expect(error).toBeNull();
      expect(items).toEqual([
        { content: "Step one", status: "done" },
        { content: "Step two", status: "in_progress" },
      ]);
    });

    it("coerces unknown statuses to pending", () => {
      const { items } = sanitizeTodoItems([
        { content: "Step", status: "finished?!" },
      ]);
      expect(items[0].status).toBe("pending");
    });

    it("drops items without content and caps content length", () => {
      const long = "x".repeat(500);
      const { items } = sanitizeTodoItems([
        { content: "", status: "pending" },
        { content: long, status: "pending" },
      ]);
      expect(items).toHaveLength(1);
      expect(items[0].content).toHaveLength(200);
    });

    it("rejects empty or non-array input", () => {
      expect(sanitizeTodoItems([]).error).toMatch(/at least one/i);
      expect(sanitizeTodoItems(null).error).toMatch(/at least one/i);
      expect(sanitizeTodoItems([{ status: "done" }]).error).toMatch(
        /no valid todo items/i
      );
    });

    it("caps the list length", () => {
      const many = Array.from({ length: 50 }, (_, i) => ({
        content: `step ${i}`,
        status: "pending",
      }));
      expect(sanitizeTodoItems(many).items).toHaveLength(30);
    });
  });

  describe("tool description", () => {
    // The description is the model's instruction sheet: the 3+-step
    // first-call rule must survive refactors or multi-step runs silently
    // lose their plan (measured on long runs).
    function toolDefinition() {
      const captured = [];
      agentTodo.plugin().setup({ function: (def) => captured.push(def) });
      return captured[0];
    }

    it("registers as todo-write with an items schema", () => {
      const def = toolDefinition();
      expect(def.name).toBe("todo-write");
      expect(def.parameters.required).toContain("items");
    });

    it("mandates first-call use for 3+ step tasks", () => {
      const def = toolDefinition();
      expect(def.description).toMatch(/3 or more steps/i);
      expect(def.description).toMatch(/MUST call this tool FIRST/i);
    });
  });
});
