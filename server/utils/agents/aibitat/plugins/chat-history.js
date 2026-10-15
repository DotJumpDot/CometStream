const { WorkspaceChats } = require("../../../../models/workspaceChats");
const { WorkspaceThread } = require("../../../../models/workspaceThread");
const {
  ensureTrace,
  takeTrace,
  clearTrace,
  extractThoughts,
} = require("./trace.js");

// Checkpoint cadence: bounds both staleness of a killed run's partial
// history and write load (one small upsert per active run per interval).
const CHECKPOINT_MS = 30_000;

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

        // Periodic trace checkpoints: a run that dies (killed server, lost
        // model connection, operator stop) would otherwise leave only the
        // pre-registered prompt row. Every tick persists the trace so far
        // onto that row - a killed run reloads its prompt, partial cards,
        // and an interrupted marker at the end. Unref'd + self-clearing so
        // it can neither hold the process open nor outlive its turn;
        // completion/error/abort paths clear it explicitly.
        if (aibitat._checkpointTimer) clearInterval(aibitat._checkpointTimer);
        const checkpointTimer = setInterval(() => {
          try {
            if (
              !aibitat.trackedChatId ||
              aibitat._replySaved ||
              aibitat._aborted ||
              !Array.isArray(aibitat._pendingTrace) ||
              aibitat._pendingTrace.length === 0
            ) {
              clearInterval(checkpointTimer);
              return;
            }
            // Unawaited by design (interval cadence, not completion); the
            // promise is caught so a failed tick can never surface as an
            // unhandled rejection and disturb the run.
            this._checkpointTrace(aibitat).catch(() => {});
          } catch {}
        }, CHECKPOINT_MS);
        if (typeof checkpointTimer.unref === "function")
          checkpointTimer.unref();
        aibitat._checkpointTimer = checkpointTimer;

        // If the agent is aborted (e.g. user sent /reset mid-response), skip
        // the pending save so a completing in-flight response doesn't reappear.
        aibitat.onAbort(() => {
          aibitat._aborted = true;
          if (aibitat._checkpointTimer) {
            clearInterval(aibitat._checkpointTimer);
            aibitat._checkpointTimer = null;
          }
        });

        // A run that dies before any reply (dead model connection, startup
        // crash) leaves the pre-registered prompt row response-less: with
        // checkpoints it still carries the partial trace, otherwise just the
        // prompt. Either way the history endpoints render it as an
        // interrupted turn. Fill graceful deaths with the failure text so the
        // thread reads honestly. Guarded by _replySaved so a late error can
        // never overwrite a completed reply.
        aibitat.onError(async (error) => {
          try {
            if (!aibitat.trackedChatId || aibitat._replySaved) return;
            aibitat._replySaved = true;
            const invocation = aibitat.handlerProps.invocation;
            const message =
              error?.message || "An error occurred while running the agent.";
            const trace = takeTrace(aibitat);
            await this._serializedRowSave(aibitat, () =>
              WorkspaceChats.upsert(aibitat.trackedChatId, {
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
              })
            );
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
        // Flag first: a checkpoint tick already inside its save must not land
        // after this write and bury a finished reply under trace-only content.
        aibitat._replySaved = true;
        await this._serializedRowSave(aibitat, () =>
          WorkspaceChats.upsert(aibitat.trackedChatId, {
            workspaceId: Number(invocation.workspace_id),
            prompt,
            response: {
              text: cleanText,
              sources: citations,
              type: "chat",
              attachments,
              metrics,
              ...(outputs.length > 0 ? { outputs } : {}),
              ...(clarifyingQuestions.length > 0
                ? { clarifyingQuestions }
                : {}),
              ...(trace.length > 0 ? { trace } : {}),
            },
            user: { id: invocation?.user_id || null },
            threadId: invocation?.thread_id || null,
            include: true,
          })
        );

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
        // Flag first (see _store): serialize after it so a checkpoint tick
        // can never land last over a finished save.
        aibitat._replySaved = true;
        await this._serializedRowSave(aibitat, () =>
          WorkspaceChats.upsert(aibitat.trackedChatId, {
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
              ...(clarifyingQuestions.length > 0
                ? { clarifyingQuestions }
                : {}),
              ...(trace.length > 0 ? { trace } : {}),
            },
            user: { id: invocation?.user_id || null },
            threadId: invocation?.thread_id || null,
            include: true,
          })
        );

        if (!aibitat._threadRenamed) {
          aibitat._threadRenamed = await this._autoRenameThread(
            aibitat,
            prompt
          );
        }
        options?.postSave();
        this._cleanup(aibitat);
      },

      /**
       * Serialize one turn's row writes (checkpoints, completion, error
       * fallback) per instance. Async ticks and turn-end saves otherwise race
       * on the same row: whichever lands last wins, so an unlucky checkpoint
       * could bury a finished reply. Chained per instance; a rejected link
       * never breaks the chain for the next writer.
       */
      _serializedRowSave: async function (aibitat, saveFn) {
        const run = (aibitat._saveChain || Promise.resolve()).then(saveFn);
        aibitat._saveChain = run.catch(() => {});
        return run;
      },

      /**
       * Persist the trace accumulated so far onto the pre-registered row.
       * Keeps include:false + empty text: the turn still reads as in-flight
       * until the completion save flips it, so a mid-run reload behaves
       * exactly like today (prompt hidden, live socket streams) while a
       * killed run keeps everything up to the last tick.
       */
      _checkpointTrace: async function (aibitat) {
        if (!aibitat.trackedChatId || aibitat._replySaved || aibitat._aborted)
          return;
        const invocation = aibitat.handlerProps.invocation;
        const trace = takeTrace(aibitat);
        if (trace.length === 0) return;
        await this._serializedRowSave(aibitat, () =>
          WorkspaceChats.upsert(aibitat.trackedChatId, {
            workspaceId: Number(invocation.workspace_id),
            prompt: aibitat._failedPrompt ?? "",
            response: { text: "", trace },
            user: { id: invocation?.user_id || null },
            threadId: invocation?.thread_id || null,
            include: false,
          })
        );
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
        if (aibitat._checkpointTimer) {
          clearInterval(aibitat._checkpointTimer);
          aibitat._checkpointTimer = null;
        }
        // _replySaved intentionally survives cleanup: the instance is
        // per-run, and a late error after a completed save must stay a
        // no-op. Only the prompt scratch resets.
        aibitat._failedPrompt = "";
      },
    };
  },
};

module.exports = { chatHistory };
