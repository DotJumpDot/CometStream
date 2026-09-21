/**
 * Tests for the agent websocket message relay: a permission mode pushed on
 * socket open can arrive before createAIbitat attaches its handlers, so the
 * relay stashes it for post-setup apply instead of dropping it (which
 * silently forced ask-every-time on auto-approve sessions).
 */
const {
  relayToSocket,
  readPermissionMode,
} = require("../../endpoints/agentWebsocket");

describe("agentWebsocket permission mode relay", () => {
  function fakeSocket(overrides = {}) {
    return {
      checkBailCommand: jest.fn(),
      ...overrides,
    };
  }

  describe("readPermissionMode", () => {
    it("accepts only the client-sent modes", () => {
      expect(
        readPermissionMode(JSON.stringify({ type: "permissionMode", mode: "auto" }))
      ).toBe("auto");
      expect(
        readPermissionMode(
          JSON.stringify({ type: "permissionMode", mode: "auto-remember" })
        )
      ).toBe("auto-remember");
      expect(
        readPermissionMode(JSON.stringify({ type: "permissionMode", mode: "ask" }))
      ).toBe("ask");
    });

    it("rejects unknown modes and non-permission messages", () => {
      expect(
        readPermissionMode(JSON.stringify({ type: "permissionMode", mode: "yes" }))
      ).toBeNull();
      expect(
        readPermissionMode(JSON.stringify({ type: "awaitingFeedback" }))
      ).toBeNull();
      expect(readPermissionMode("not-json{{{")).toBeNull();
    });
  });

  describe("relayToSocket", () => {
    it("stashes an early permission mode when handlers are not attached yet", () => {
      const socket = fakeSocket();
      relayToSocket.call(
        socket,
        JSON.stringify({ type: "permissionMode", mode: "auto" })
      );
      expect(socket._pendingPermissionMode).toBe("auto");
      expect(socket.checkBailCommand).not.toHaveBeenCalled();
    });

    it("delegates to the handler once attached instead of stashing", () => {
      const handlePermissionMode = jest.fn(() => true);
      const socket = fakeSocket({ handlePermissionMode });
      relayToSocket.call(
        socket,
        JSON.stringify({ type: "permissionMode", mode: "auto" })
      );
      expect(handlePermissionMode).toHaveBeenCalled();
      expect(socket._pendingPermissionMode).toBeUndefined();
    });

    it("passes non-permission messages through to the normal handlers", () => {
      const socket = fakeSocket();
      const msg = JSON.stringify({ type: "awaitingFeedback", feedback: "hi" });
      relayToSocket.call(socket, msg);
      expect(socket._pendingPermissionMode).toBeUndefined();
      expect(socket.checkBailCommand).toHaveBeenCalledWith(msg);
    });

    it("ignores a malformed early mode instead of stashing it", () => {
      const socket = fakeSocket();
      relayToSocket.call(
        socket,
        JSON.stringify({ type: "permissionMode", mode: "always" })
      );
      expect(socket._pendingPermissionMode).toBeUndefined();
      expect(socket.checkBailCommand).toHaveBeenCalled();
    });

    it("does not throw when nothing is attached yet (sync relay attach)", () => {
      // The relay is attached before any setup runs, so bail/feedback
      // handlers may not exist when the first frames arrive.
      const socket = {};
      expect(() =>
        relayToSocket.call(
          socket,
          JSON.stringify({ type: "awaitingFeedback", feedback: "hi" })
        )
      ).not.toThrow();
      expect(socket._pendingPermissionMode).toBeUndefined();
    });
  });
});
