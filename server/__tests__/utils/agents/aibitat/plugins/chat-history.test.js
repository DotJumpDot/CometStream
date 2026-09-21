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
  chatHistory.plugin().setup.call(
    {
      _autoRenameThread: jest.fn(),
      _store: jest.fn(),
      _storeSpecial: jest.fn(),
    },
    aibitat
  );
  return aibitat._listeners.error;
}

beforeEach(() => {
  jest.clearAllMocks();
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
