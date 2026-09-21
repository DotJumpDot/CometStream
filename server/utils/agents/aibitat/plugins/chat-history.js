const { WorkspaceChats } = require("../../../../models/workspaceChats");
const { WorkspaceThread } = require("../../../../models/workspaceThread");
const {
  ensureTrace,
  takeTrace,
  clearTrace,
  extractThoughts,
} = require("./trace.js");

/**
 * Plugin to save chat history to AnythingLLM DB.
 */
const chatHistory = {
  name: "chat-history",
  startupConfig: {
    params: {},
  },
  plugin: function () {
    return {
      name: this.name,
      setup: function (aibitat) {
        // Persistable run history: per-iteration thoughts record via the
        // execution loop and the socket stream records via the websocket
        // plugin's raw-send wrapper (see plugins/trace.js), so reopening
        // the thread restores the run, not just the final reply.
        ensureTrace(aibitat);

        // If the agent is aborted (e.g. user sent /reset mid-response), skip
        // the pending save so a completing in-flight response doesn't reappear.
        aibitat.onAbort(() => {
          aibitat._aborted = true;
        });

        // A run that dies before any reply (dead model connection, startup
        // crash) would otherwise leave the pre-registered prompt row with an
        // empty response - a thread that opens showing the question and
        // nothing else. Fill it with the failure so the thread reads
        // honestly. Guarded by _replySaved so a late error can never
        // overwrite a completed reply.
        aibitat.onError(async (error) => {
          try {
            if (!aibitat.trackedChatId || aibitat._replySaved) return;
            aibitat._replySaved = true;
            const invocation = aibitat.handlerProps.invocation;
            const message =
              error?.message || "An error occurred while running the agent.";
            const trace = takeTrace(aibitat);
            await WorkspaceChats.upsert(aibitat.trackedChatId, {
              workspaceId: Number(invocation.workspace_id),
              prompt: aibitat._failedPrompt ?? "",
              response: {
                text: `This run failed before producing a reply: ${message}`,
                sources: [],
                type: "chat",
                attachments: [],
                metrics: {},
                ...(trace.length > 0 ? { trace } : {}),
              },
              user: { id: invocation?.user_id || null },
              threadId: invocation?.thread_id || null,
              include: true,
            });
          } catch {}
        });

        // pre-register a workspace chat ID to secure it in the DB
        aibitat.onMessage(async (message) => {
          if (message.from !== "USER") return;

          /**
           * If we don't have a tracked chat ID, we need to create a new one so we can upsert the response later.
           * Normally, if this was a totally fresh chat from the user, we can assume that the message from the socket is
           * the message we want to store for the prompt. However, if this is a regeneration of a previous message and that message
           * called tools the history could include intermediate messages so need to search backwards to find the most recent user message
           * as that is actually the prompt.
           */
          if (!aibitat.trackedChatId) {
            let userMessage = message.content;
            if (userMessage.startsWith("@agent:")) {
              const lastUserMsgIndex = aibitat._chats.findLastIndex(
                (c) => c.from === "USER" && !c.content.startsWith("@agent:")
              );

              // When regenerating a message, we need to use the last user message as the prompt.
              // Also prune the chats array to only include the messages before target prompt to re-run
              // or else tool call results from the previous run will be included in the history and the model will not re-call tools
              // that previously worked for the to-be-regenerated prompt.
              if (lastUserMsgIndex !== -1) {
                userMessage = aibitat._chats[lastUserMsgIndex].content;
                aibitat._chats = aibitat._chats.slice(0, lastUserMsgIndex + 1);
              }
            }

            const { chat } = await WorkspaceChats.new({
              workspaceId: Number(aibitat.handlerProps.invocation.workspace_id),
              user: { id: aibitat.handlerProps.invocation.user_id || null },
              threadId: aibitat.handlerProps.invocation.thread_id || null,
              include: false,
              prompt: userMessage,
              response: {},
            });
            if (chat) aibitat.registerChatId(chat.id);
            // Kept for the onError fallback: if the run dies before any
            // reply, the failure save reuses this prompt.
            aibitat._failedPrompt = userMessage;

            // Rename the thread the moment its first chat is pre-registered
            // so the sidebar reflects the prompt right away. Waiting for the
            // reply to store leaves the thread named "Thread" for the whole
            // (possibly minutes-long) first agent turn. autoRenameThread's
            // name guard makes this idempotent for later turns.
            if (!aibitat._threadRenamed) {
              aibitat._threadRenamed = await this._autoRenameThread(
                aibitat,
                userMessage
              );
            }
          }
        });

        aibitat.onMessage(async () => {
          try {
            if (aibitat._aborted) return;
            const lastResponses = aibitat.chats.slice(-2);
            if (lastResponses.length !== 2) return;
            const [prev, last] = lastResponses;

            // We need a full conversation reply with prev being from
            // the USER and the last being from anyone other than the user.
            if (prev.from !== "USER" || last.from === "USER") return;

            // Extract attachments from user message if present
            const attachments = prev.attachments || [];

            // If we have a post-reply flow we should save the chat using this special flow
            // so that post save cleanup and other unique properties can be run as opposed to regular chat.
            if (aibitat.hasOwnProperty("_replySpecialAttributes")) {
              await this._storeSpecial(aibitat, {
                prompt: prev.content,
                response: last.content,
                attachments,
                options: aibitat._replySpecialAttributes,
              });
              delete aibitat._replySpecialAttributes;
              return;
            }

            await this._store(aibitat, {
              prompt: prev.content,
              response: last.content,
              attachments,
            });
          } catch {}
        });
      },
      _store: async function (
        aibitat,
        { prompt, response, attachments = [] } = {}
      ) {
        const invocation = aibitat.handlerProps.invocation;
        const metrics = aibitat.providerInstance?.getCumulativeUsage?.() ?? {};
        const citations = aibitat._pendingCitations ?? [];
        const outputs = aibitat._pendingOutputs ?? [];
        const clarifyingQuestions =
          aibitat._pendingClarifyingQuestionSurveys ?? [];
        // The run trace (thoughts/statuses/cards in order) restores the run
        // on reload. Thoughts are stripped from the saved reply since they
        // now live in the trace - otherwise the final thought renders twice.
        const trace = takeTrace(aibitat);
        const { cleanText } = extractThoughts(response);
        await WorkspaceChats.upsert(aibitat.trackedChatId, {
          workspaceId: Number(invocation.workspace_id),
          prompt,
          response: {
            text: cleanText,
            sources: citations,
            type: "chat",
            attachments,
            metrics,
            ...(outputs.length > 0 ? { outputs } : {}),
            ...(clarifyingQuestions.length > 0 ? { clarifyingQuestions } : {}),
            ...(trace.length > 0 ? { trace } : {}),
          },
          user: { id: invocation?.user_id || null },
          threadId: invocation?.thread_id || null,
          include: true,
        });
        // A completed save wins over any late error fallback.
        aibitat._replySaved = true;

        if (!aibitat._threadRenamed) {
          aibitat._threadRenamed = await this._autoRenameThread(
            aibitat,
            prompt
          );
        }
        this._cleanup(aibitat);
      },
      _storeSpecial: async function (
        aibitat,
        { prompt, response, attachments = [], options = {} } = {}
      ) {
        const invocation = aibitat.handlerProps.invocation;
        const metrics = aibitat.providerInstance?.getCumulativeUsage?.() ?? {};
        const citations = aibitat._pendingCitations ?? [];
        const outputs = aibitat._pendingOutputs ?? [];
        const clarifyingQuestions =
          aibitat._pendingClarifyingQuestionSurveys ?? [];
        const existingSources = options?.sources ?? [];
        const storedText = options.hasOwnProperty("storedResponse")
          ? options.storedResponse(response)
          : response;
        // See _store: thoughts live in the trace, not the saved reply.
        const trace = takeTrace(aibitat);
        const { cleanText } = extractThoughts(storedText);
        await WorkspaceChats.upsert(aibitat.trackedChatId, {
          workspaceId: Number(invocation.workspace_id),
          prompt,
          response: {
            sources: [...existingSources, ...citations],
            // when we have a _storeSpecial called the options param can include a storedResponse() function
            // that will override the text property to store extra information in, depending on the special type of chat.
            text: cleanText,
            type: options?.saveAsType ?? "chat",
            attachments,
            metrics,
            ...(outputs.length > 0 ? { outputs } : {}),
            ...(clarifyingQuestions.length > 0 ? { clarifyingQuestions } : {}),
            ...(trace.length > 0 ? { trace } : {}),
          },
          user: { id: invocation?.user_id || null },
          threadId: invocation?.thread_id || null,
          include: true,
        });

        if (!aibitat._threadRenamed) {
          aibitat._threadRenamed = await this._autoRenameThread(
            aibitat,
            prompt
          );
        }
        options?.postSave();
        // See _store: a completed save wins over any late error fallback.
        aibitat._replySaved = true;
        this._cleanup(aibitat);
      },

      _autoRenameThread: async function (aibitat, prompt) {
        const invocation = aibitat.handlerProps.invocation;
        if (!invocation?.thread_id) return true;

        const thread = await WorkspaceThread.get({ id: invocation.thread_id });
        if (!thread) return true;

        const { Workspace } = require("../../../../models/workspace");
        const workspace = await Workspace.get({ id: invocation.workspace_id });
        if (!workspace) return true;

        await WorkspaceThread.autoRenameThread({
          thread,
          workspace,
          user: invocation.user_id ? { id: invocation.user_id } : null,
          prompt,
          onRename: (updatedThread) => {
            aibitat.socket?.send("rename_thread", {
              slug: updatedThread.slug,
              name: updatedThread.name,
            });
          },
        });
        return true;
      },

      _cleanup: function (aibitat) {
        aibitat.clearCitations?.();
        aibitat._pendingOutputs = [];
        aibitat.clearClarifyingQuestionSurveys?.();
        clearTrace(aibitat);
        aibitat.clearTrackedChatId();
        // _replySaved intentionally survives cleanup: the instance is
        // per-run, and a late error after a completed save must stay a
        // no-op. Only the prompt scratch resets.
        aibitat._failedPrompt = "";
      },
    };
  },
};

module.exports = { chatHistory };
