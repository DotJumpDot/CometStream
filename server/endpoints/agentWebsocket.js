const { Telemetry } = require("../models/telemetry");
const {
  WorkspaceAgentInvocation,
} = require("../models/workspaceAgentInvocation");
const { AgentHandler } = require("../utils/agents");
const {
  WEBSOCKET_BAIL_COMMANDS,
} = require("../utils/agents/aibitat/plugins/websocket");
const { safeJsonParse } = require("../utils/http");
const { WorkspaceThread } = require("../models/workspaceThread");
const { WorkspaceChats } = require("../models/workspaceChats");
const truncate = require("truncate");

// Setup listener for incoming messages to relay to socket so it can be handled by agent plugin.
function relayToSocket(message) {
  // Tool toggles and the chat permission mode can arrive while the agent is
  // paused awaiting feedback/approval, so handle them first. The handlers
  // ignore (return false for) any other message.
  if (this.handleToolToggle?.(message)) return;
  if (this.handlePermissionMode?.(message)) return;
  // The client pushes its permission mode on socket open, which usually lands
  // before createAIbitat attaches the handlers above - stash it so it can be
  // applied after setup instead of falling back to ask-every-time for the
  // session's first tool calls.
  const earlyMode = readPermissionMode(message);
  if (earlyMode && !this.handlePermissionMode) {
    this._pendingPermissionMode = earlyMode;
    return;
  }
  if (this.handleFeedback) return this?.handleFeedback?.(message);
  if (this.handleToolApproval) return this?.handleToolApproval?.(message);
  if (this.handleClarificationResponse)
    return this?.handleClarificationResponse?.(message);
  // checkBailCommand is attached later in setup - an early non-permission
  // frame (e.g. a duplicate open push) must not throw here.
  this.checkBailCommand?.(message);
}

/**
 * Reads a chat permission mode out of a raw socket message.
 * Accepts only the modes the client can send - anything else is ignored so
 * a malformed early frame can never put the session in a bad state.
 * @param {string} message - raw socket message
 * @returns {"ask"|"auto"|"auto-remember"|null} The mode, or null.
 */
function readPermissionMode(message) {
  const data = safeJsonParse(message, {});
  if (data?.type !== "permissionMode") return null;
  if (!["ask", "auto", "auto-remember"].includes(data.mode)) return null;
  return data.mode;
}

function agentWebsocket(app) {
  if (!app) return;

  app.ws("/agent-invocation/:uuid", async function (socket, request) {
    // Attach the message relay synchronously, before any await below. The
    // client pushes its permission mode on socket open (within milliseconds
    // on localhost), and frames arriving before a "message" listener exists
    // are dropped by `ws` - a late attach silently loses the session's
    // auto-approve mode. The relay tolerates missing handlers (optional
    // chaining + the _pendingPermissionMode stash) until setup completes.
    socket.on("message", relayToSocket);
    try {
      const agentHandler = await new AgentHandler({
        uuid: String(request.params.uuid),
      }).init();

      if (!agentHandler.invocation) {
        socket.close();
        return;
      }

      // Rename a still-default-named thread from the opening prompt at
      // session start, so the sidebar reflects the conversation immediately.
      // The chat-history plugin's rename only fires once a chat row persists,
      // which for agent turns happens at end-of-turn (or session close) -
      // minutes after the user sent the message. Guarded by the default name
      // and chat count so only the thread's first exchange renames it.
      try {
        const invocation = agentHandler.invocation;
        if (invocation?.thread_id) {
          const thread = await WorkspaceThread.get({
            id: invocation.thread_id,
          });
          if (thread && thread.name === WorkspaceThread.defaultName) {
            const chatCount = await WorkspaceChats.count({
              workspaceId: invocation.workspace_id,
              thread_id: invocation.thread_id,
              user_id: invocation.user_id ?? null,
            });
            if (chatCount <= 1) {
              const { thread: renamed } = await WorkspaceThread.update(thread, {
                name: truncate(String(invocation.prompt), 22),
              });
              socket?.send(
                JSON.stringify({
                  type: "rename_thread",
                  content: { slug: renamed.slug, name: renamed.name },
                })
              );
            }
          }
        }
      } catch (e) {
        console.error("agentWebsocket.autoRenameThread", e.message);
      }

      // Message relay is attached synchronously at the top of this handler
      // (see above) so the session-start permission push is never missed.
      socket.on("close", () => {
        // Abort the running agent loop (stop button, tab close, disconnect) so
        // in-flight LLM requests are cancelled and no further turns run.
        agentHandler.aibitat?.abort();
        agentHandler.closeAlert();
        WorkspaceAgentInvocation.close(String(request.params.uuid));
        return;
      });

      socket.checkBailCommand = (data) => {
        const content = safeJsonParse(data)?.feedback;
        if (WEBSOCKET_BAIL_COMMANDS.includes(content)) {
          agentHandler.log(
            `User invoked bail command while processing. Closing session now.`
          );
          // aibitat may not exist yet if the bail arrives while the session
          // is still being built - closing the socket alone is enough then.
          agentHandler.aibitat?.abort();
          socket.close();
          return;
        }
      };

      await Telemetry.sendTelemetry("agent_chat_started");
      await agentHandler.createAIbitat({ socket });
      // A permission mode pushed on socket open can arrive before the
      // handlers above existed - apply the stashed value now so
      // auto-approve covers the session from its first tool call.
      if (socket._pendingPermissionMode && socket.handlePermissionMode) {
        socket.handlePermissionMode(
          JSON.stringify({
            type: "permissionMode",
            mode: socket._pendingPermissionMode,
          })
        );
        delete socket._pendingPermissionMode;
      }
      // Socket can close while aibitat is being built - don't start a session nobody is listening to.
      if (socket.readyState !== socket.OPEN) return;
      await agentHandler.startAgentCluster();
    } catch (e) {
      console.error(e.message, e);
      socket?.send(JSON.stringify({ type: "wssFailure", content: e.message }));
      socket?.close();
    }
  });
}

module.exports = { agentWebsocket, relayToSocket, readPermissionMode };
