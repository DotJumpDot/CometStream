/**
 * Tests for the chat-history error fallback: a run that dies before any
 * reply must fill the pre-registered prompt row with the failure instead of
 * leaving an empty response behind - without ever overwriting a completed
 * reply with a late error.
 */
jest.mock("../../../../../models/workspaceChats", () => ({
  WorkspaceChats: {
    upsert: jest.fn(),
  },
}));

const { WorkspaceChats } = require("../../../../../models/workspaceChats");
const {
  chatHistory,
} = require("../../../../../utils/agents/aibitat/plugins/chat-history");

function mockAibitat(overrides = {}) {
  const listeners = {};
  return {
    _pendingTrace: [],
    trackedChatId: 42,
    _replySaved: false,
    handlerProps: {
      invocation: { workspace_id: 7, user_id: 1, thread_id: 9 },
    },
    onAbort: jest.fn(),
    onMessage: jest.fn(),
    onError: jest.fn((fn) => {
      listeners.error = fn;
    }),
    registerChatId: jest.fn(),
    ...overrides,
    _listeners: listeners,
  };
}

function setup(aibitat) {
  const plugin = chatHistory.plugin();
  chatHistory.plugin().setup.call(
    {
      _autoRenameThread: jest.fn(),
      _store: jest.fn(),
      _storeSpecial: jest.fn(),
      _checkpointTrace: plugin._checkpointTrace.bind(plugin),
      _serializedRowSave: plugin._serializedRowSave.bind(plugin),
    },
    aibitat
  );
  return aibitat._listeners.error;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("chat-history trace checkpoints", () => {
  const plugin = chatHistory.plugin();
  let timers;

  function setupWithRealCheckpoint(aibitat) {
    chatHistory.plugin().setup.call(
      {
        _autoRenameThread: jest.fn(),
        _store: jest.fn(),
        _storeSpecial: jest.fn(),
        _checkpointTrace: plugin._checkpointTrace.bind(plugin),
        _serializedRowSave: plugin._serializedRowSave.bind(plugin),
      },
      aibitat
    );
  }

  beforeEach(() => {
    timers = jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  function runningAibitat(trace = [{ type: "statusResponse", content: "hi" }]) {
    return mockAibitat({
      _failedPrompt: "do things",
      _pendingTrace: trace,
      clearTrackedChatId: jest.fn(),
      clearCitations: jest.fn(),
    });
  }

  it("persists the trace so far onto the pre-registered row", async () => {
    const aibitat = runningAibitat();
    setupWithRealCheckpoint(aibitat);
    await timers.advanceTimersByTimeAsync(30_000);
    expect(WorkspaceChats.upsert).toHaveBeenCalledTimes(1);
    const [chatId, payload] = WorkspaceChats.upsert.mock.calls[0];
    expect(chatId).toBe(42);
    expect(payload.include).toBe(false);
    expect(payload.prompt).toBe("do things");
    expect(payload.response.text).toBe("");
    expect(payload.response.trace).toHaveLength(1);
  });

  it("does not checkpoint an empty trace", async () => {
    setupWithRealCheckpoint(runningAibitat([]));
    await timers.advanceTimersByTimeAsync(120_000);
    expect(WorkspaceChats.upsert).not.toHaveBeenCalled();
  });

  it("stops checkpointing after the reply is saved or aborted", async () => {
    const saved = runningAibitat();
    saved._replySaved = true;
    setupWithRealCheckpoint(saved);
    const aborted = runningAibitat();
    setupWithRealCheckpoint(aborted);
    aborted._aborted = true;
    await timers.advanceTimersByTimeAsync(120_000);
    expect(WorkspaceChats.upsert).not.toHaveBeenCalled();
  });

  it("serializes checkpoint and completion saves in order", async () => {
    const order = [];
    WorkspaceChats.upsert.mockImplementation(async () => {
      order.push("upsert");
    });
    const aibitat = runningAibitat();
    setupWithRealCheckpoint(aibitat);
    // Let the tick queue its save first, then a completion save chains after.
    await timers.advanceTimersByTimeAsync(30_000);
    await plugin._serializedRowSave.bind(plugin)(aibitat, async () => {
      order.push("second");
    });
    expect(order).toEqual(["upsert", "second"]);
  });
});

describe("chat-history onError fallback", () => {
  it("fills an unsaved prompt row with the failure text", async () => {
    const aibitat = mockAibitat({ _failedPrompt: "hello?" });
    const onError = setup(aibitat);
    await onError(new Error("socket hang up"));
    expect(WorkspaceChats.upsert).toHaveBeenCalledTimes(1);
    const [chatId, payload] = WorkspaceChats.upsert.mock.calls[0];
    expect(chatId).toBe(42);
    expect(payload.prompt).toBe("hello?");
    expect(payload.response.text).toContain("socket hang up");
    expect(aibitat._replySaved).toBe(true);
  });

  it("never overwrites a completed reply with a late error", async () => {
    const aibitat = mockAibitat({ _replySaved: true });
    const onError = setup(aibitat);
    await onError(new Error("late boom"));
    expect(WorkspaceChats.upsert).not.toHaveBeenCalled();
  });

  it("does nothing without a tracked chat id", async () => {
    const aibitat = mockAibitat({ trackedChatId: null });
    const onError = setup(aibitat);
    await onError(new Error("early boom"));
    expect(WorkspaceChats.upsert).not.toHaveBeenCalled();
  });
});
