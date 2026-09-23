import { useState, useEffect, useContext, useRef, useCallback } from "react";
import ChatHistory from "./ChatHistory";
import ChatHeader from "./ChatHeader";
import { CLEAR_ATTACHMENTS_EVENT, DndUploaderContext } from "./DnDWrapper";
import PromptInput, {
  PROMPT_INPUT_EVENT,
  PROMPT_INPUT_ID,
} from "./PromptInput";
import Workspace from "@/models/workspace";
import handleChat, { ABORT_STREAM_EVENT } from "@/utils/chat";
import { isMobile } from "react-device-detect";
import { SidebarMobileHeader } from "../../Sidebar";
import { useNavigate } from "react-router-dom";
import { v4 } from "uuid";
import handleSocketResponse, {
  websocketURI,
  AGENT_SESSION_END,
  AGENT_SESSION_START,
  agentEventLoadingState,
  setAgentSessionActive,
  setAgentSessionSocket,
} from "@/utils/chat/agent";
import DnDFileUploaderWrapper from "./DnDWrapper";
import { getAgentActivity } from "@/utils/agentActivity";
import {
  getPermissionMode,
  subscribePermissionMode,
} from "@/utils/chat/permissions";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";
import { ChatTooltips } from "./ChatTooltips";
import { MetricsProvider } from "./ChatHistory/HistoricalMessage/Actions/RenderMetrics";
import useChatContainerQuickScroll from "@/hooks/useChatContainerQuickScroll";
import { PENDING_HOME_MESSAGE } from "@/utils/constants";
import { clearPromptInputDraft } from "@/hooks/usePromptInputStorage";
import { safeJsonParse } from "@/utils/request";
import showToast from "@/utils/toast";
import { useTranslation } from "react-i18next";
import paths from "@/utils/paths";
import QuickActions from "@/components/lib/QuickActions";
import SuggestedMessages from "@/components/lib/SuggestedMessages";
import ChatSettingsMenu from "./ChatSettingsMenu";
import { AgentPanelButton } from "../AgentSidePanel";
import { ChatSidebarProvider } from "./ChatSidebar";
import SourcesSidebar from "./SourcesSidebar";
import MemoriesSidebar from "./MemoriesSidebar";
import ActiveGenerationGuard from "./ActiveGenerationGuard";
import { isComposerNonEmpty } from "./MessageQueue";

export default function ChatContainer({
  workspace,
  threadSlug = null,
  knownHistory = [],
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loadingResponse, setLoadingResponse] = useState(false);
  const [chatHistory, setChatHistory] = useState(knownHistory);
  const [socketId, setSocketId] = useState(null);
  const [websocket, setWebsocket] = useState(null);
  const { files, parseAttachments } = useContext(DndUploaderContext);
  const { chatHistoryRef } = useChatContainerQuickScroll();
  const pendingMessageChecked = useRef(false);
  const pendingResetRef = useRef(false);
  // Wall-clock start of the current agent turn (socket open or follow-up
  // message) and a once-per-turn guard for the run-summary card. The summary
  // fires on WAITING_ON_INPUT (agent finished its work, session stays open
  // awaiting feedback) or on socket close - whichever comes first.
  const runStartRef = useRef(null);
  const summaryEmittedRef = useRef(false);
  const activeThreadSlug = threadSlug;

  // Queued follow-up messages submitted while a run is in flight. Each item
  // dispatches via the normal sendCommand path once the previous run
  // settles, so queued turns never race an active generation.
  const [messageQueue, setMessageQueue] = useState([]);
  const [queueHalted, setQueueHalted] = useState(false);
  const messageQueueRef = useRef([]);
  messageQueueRef.current = messageQueue;
  const queueHaltedRef = useRef(false);
  queueHaltedRef.current = queueHalted;
  const loadingResponseRef = useRef(false);
  loadingResponseRef.current = loadingResponse;
  const prevLoadingRef = useRef(false);

  const isEmpty =
    chatHistory.length === 0 && !sessionStorage.getItem(PENDING_HOME_MESSAGE);

  /**
   * Appends the Trae-style run-summary card once per agent turn, snapshotting
   * the session activity so the summary stays stable after the live panel
   * state moves on. Guarded by summaryEmittedRef - WAITING_ON_INPUT and the
   * socket close can both arrive for the same finished turn.
   */
  const emitRunSummary = useCallback(() => {
    if (summaryEmittedRef.current) return;
    summaryEmittedRef.current = true;
    const activity = getAgentActivity();
    setChatHistory((prev) => [
      ...prev.filter((msg) => !!msg.content),
      {
        uuid: v4(),
        type: "agentRunSummary",
        // Truthy content keeps the pending-message sweep from dropping the
        // card on the next history update.
        content: "agent-run-summary",
        role: "assistant",
        sources: [],
        closed: true,
        error: null,
        animate: false,
        pending: false,
        durationMs: runStartRef.current
          ? Date.now() - runStartRef.current
          : null,
        todo: activity.todo,
        fileChanges: activity.fileChanges,
      },
    ]);
  }, []);

  /**
   * Keep chat history bottom-padding in sync with the prompt input's
   * actual rendered height so expanding input never covers messages.
   */
  useEffect(() => {
    if (isEmpty) return;
    const wrapper = document.getElementById("prompt-input-wrapper");
    const chatEl = document.getElementById("chat-history");
    if (!wrapper || !chatEl) return;

    const observer = new ResizeObserver(([entry]) => {
      const inputHeight =
        entry.borderBoxSize?.[0]?.blockSize ?? entry.target.offsetHeight;
      chatEl.style.paddingBottom = `${inputHeight}px`;
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [isEmpty]);

  const { listening, resetTranscript } = useSpeechRecognition({
    clearTranscriptOnListen: true,
  });

  /**
   * Emit an update to the state of the prompt input without directly
   * passing a prop in so that it does not re-render constantly.
   * @param {string} messageContent - The message content to set
   * @param {'replace' | 'append'} writeMode - Replace current text or append to existing text (default: replace)
   */
  function setMessageEmit(messageContent = "", writeMode = "replace") {
    window.dispatchEvent(
      new CustomEvent(PROMPT_INPUT_EVENT, {
        detail: { messageContent, writeMode },
      })
    );
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    const currentMessage =
      document.getElementById(PROMPT_INPUT_ID)?.value || "";
    if (!currentMessage) return false;

    // Clear the localStorage draft for this thread/workspace so that if the
    // PromptInput remounts (empty→chat transition), it won't restore stale text
    clearPromptInputDraft(activeThreadSlug ?? workspace.slug);

    // If we're on a bare workspace route (no thread) and no chats exist yet,
    // create a new thread and navigate to it — mimicking Home page behavior.
    if (!activeThreadSlug && chatHistory.length === 0) {
      const { thread } = await Workspace.threads.new(workspace.slug);
      if (thread) {
        sessionStorage.setItem(
          PENDING_HOME_MESSAGE,
          JSON.stringify({
            message: currentMessage,
            attachments: parseAttachments(),
          })
        );
        navigate(paths.workspace.thread(workspace.slug, thread.slug));
        return;
      }
    }

    const prevChatHistory = [
      ...chatHistory,
      {
        content: currentMessage,
        role: "user",
        attachments: parseAttachments(),
      },
      {
        content: "",
        role: "assistant",
        pending: true,
        userMessage: currentMessage,
        animate: true,
      },
    ];

    if (listening) {
      endSTTSession();
    }
    setChatHistory(prevChatHistory);
    setMessageEmit("");
    setLoadingResponse(true);
  };

  function endSTTSession() {
    SpeechRecognition.stopListening();
    resetTranscript();
  }

  const sendCommandRef = useRef(null);

  /**
   * Send a command to the LLM prompt input.
   * @param {Object} options - Arguments to send to the LLM
   * @param {string} options.text - The text to send to the LLM
   * @param {boolean} options.autoSubmit - Determines if the text should be sent immediately or if it should be added to the message state (default: false)
   * @param {Object[]} options.history - The history of the chat prior to this message for overriding the current chat history
   * @param {Object[import("./DnDWrapper").Attachment]} options.attachments - The attachments to send to the LLM for this message
   * @param {'replace' | 'append' | 'prepend'} options.writeMode - Replace current text or append to existing text (default: replace)
   * @returns {void}
   */
  const sendCommand = async ({
    text = "",
    autoSubmit = false,
    history = [],
    attachments = [],
    writeMode = "replace",
  } = {}) => {
    // If we are not auto-submitting, we can just emit the text to the prompt input.
    if (!autoSubmit) {
      setMessageEmit(text, writeMode);
      return;
    }

    if (writeMode === "prepend") {
      const currentText = document.getElementById(PROMPT_INPUT_ID)?.value ?? "";
      text = currentText + " " + text;
    }

    // If we are auto-submitting in append mode
    // than we need to update text with whatever is in the prompt input + the text we are sending.
    // @note: `message` will not work here since it is not updated yet.
    // If text is still empty, after this, then we should just return.
    if (writeMode === "append") {
      const currentText = document.getElementById(PROMPT_INPUT_ID)?.value ?? "";
      text = currentText + text;
    }

    if (!text || text === "") return false;

    // If on a bare workspace route with no thread and no chat yet, create a
    // virtual thread and navigate — same as handleSubmit does.
    if (!activeThreadSlug && chatHistory.length === 0 && history.length === 0) {
      const { thread } = await Workspace.threads.new(workspace.slug);
      if (thread) {
        sessionStorage.setItem(
          PENDING_HOME_MESSAGE,
          JSON.stringify({ message: text, attachments })
        );
        navigate(paths.workspace.thread(workspace.slug, thread.slug));
        return;
      }
    }

    // Clear the localStorage draft so that if the PromptInput remounts
    // (e.g. /reset causing empty→chat or chat→empty transitions),
    // it won't restore stale text.
    clearPromptInputDraft(activeThreadSlug ?? workspace.slug);

    // If we are auto-submitting
    // Then we can replace the current text since this is not accumulating.
    let prevChatHistory;
    if (history.length > 0) {
      // use pre-determined history chain.
      prevChatHistory = [
        ...history,
        {
          content: "",
          role: "assistant",
          pending: true,
          userMessage: text,
          attachments,
          animate: true,
        },
      ];
    } else {
      prevChatHistory = [
        ...chatHistory,
        {
          content: text,
          role: "user",
          attachments,
        },
        {
          content: "",
          role: "assistant",
          pending: true,
          userMessage: text,
          attachments,
          animate: true,
        },
      ];
    }

    setChatHistory(prevChatHistory);
    setMessageEmit("");
    setLoadingResponse(true);
  };

  sendCommandRef.current = sendCommand;
  const chatHistoryRef2 = useRef(chatHistory);
  chatHistoryRef2.current = chatHistory;

  /**
   * Reset the follow-up queue when switching threads/workspaces - queued
   * prompts belong to the conversation they were written in.
   */
  useEffect(() => {
    setMessageQueue([]);
    messageQueueRef.current = [];
    setQueueHalted(false);
    queueHaltedRef.current = false;
  }, [activeThreadSlug, workspace?.slug]);

  /**
   * A manual stop aborts the run AND halts auto-dispatch: the remaining
   * queue is kept so the user can review and continue it explicitly.
   */
  useEffect(() => {
    const onAbort = () => {
      setQueueHalted(true);
      queueHaltedRef.current = true;
    };
    window.addEventListener(ABORT_STREAM_EVENT, onAbort);
    return () => window.removeEventListener(ABORT_STREAM_EVENT, onAbort);
  }, []);

  /**
   * Dispatch the next queued message via the normal send path. Error runs
   * halt the queue instead of chaining into a broken turn; the queue itself
   * is preserved for an explicit continue.
   */
  const dispatchQueuedMessage = useCallback(() => {
    const next = messageQueueRef.current[0];
    if (!next || loadingResponseRef.current) return;
    setMessageQueue((prev) => {
      const updated = prev.filter((item) => item.id !== next.id);
      messageQueueRef.current = updated;
      return updated;
    });
    sendCommandRef.current?.({
      text: next.text,
      autoSubmit: true,
      attachments: next.attachments ?? [],
    });
  }, []);

  const continueQueue = useCallback(() => {
    setQueueHalted(false);
    queueHaltedRef.current = false;
    // Dispatch on next tick so the halted flag settles first.
    setTimeout(() => dispatchQueuedMessage(), 0);
  }, [dispatchQueuedMessage]);

  // When a run settles (loading true->false), auto-dispatch the next queued
  // message unless halted or the finished turn errored.
  useEffect(() => {
    const was = prevLoadingRef.current;
    prevLoadingRef.current = loadingResponse;
    if (!was || loadingResponse) return;
    if (queueHaltedRef.current) return;
    if (messageQueueRef.current.length === 0) return;
    const history = chatHistoryRef2.current;
    const last = history[history.length - 1];
    if (last?.role === "assistant" && last?.error) {
      setQueueHalted(true);
      queueHaltedRef.current = true;
      return;
    }
    dispatchQueuedMessage();
  }, [loadingResponse, messageQueue, dispatchQueuedMessage]);

  /**
   * Queue the current composer text as a follow-up turn. Attachments are
   * snapshotted now so later picks don't leak into earlier items.
   */
  const queueMessage = useCallback(
    (text) => {
      const trimmed = String(text ?? "").trim();
      if (!trimmed) return false;
      const item = {
        id: v4(),
        text: trimmed,
        attachments: parseAttachments(),
      };
      setMessageQueue((prev) => {
        const updated = [...prev, item];
        messageQueueRef.current = updated;
        return updated;
      });
      // No toast on queue: the panel row appearing is the confirmation.
      // (A toast per queued message is noisy on long runs.)
      return true;
    },
    [parseAttachments]
  );

  const moveQueueItem = useCallback((id, dir) => {
    setMessageQueue((prev) => {
      const idx = prev.findIndex((item) => item.id === id);
      const swap = idx + dir;
      if (idx < 0 || swap < 0 || swap >= prev.length) return prev;
      const updated = [...prev];
      [updated[idx], updated[swap]] = [updated[swap], updated[idx]];
      messageQueueRef.current = updated;
      return updated;
    });
  }, []);

  const deleteQueueItem = useCallback((id) => {
    setMessageQueue((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      messageQueueRef.current = updated;
      return updated;
    });
  }, []);

  /**
   * Move a queued prompt back into the composer for editing. Refused when
   * the box already holds text so nothing gets overwritten.
   */
  const editQueueItem = useCallback(
    (id) => {
      const item = messageQueueRef.current.find((entry) => entry.id === id);
      if (!item) return;
      if (isComposerNonEmpty()) {
        showToast(t("chat_window.queue.edit_blocked"), "warning");
        return;
      }
      setMessageQueue((prev) => {
        const updated = prev.filter((entry) => entry.id !== id);
        messageQueueRef.current = updated;
        return updated;
      });
      setMessageEmit(item.text, "replace");
    },
    [t]
  );

  const regenerateAssistantMessage = useCallback(
    (chatId) => {
      const filteredHistory = chatHistoryRef2.current.slice(0, -1);
      const lastUserMessage = filteredHistory.findLast(
        (msg) => msg.role === "user"
      );
      Workspace.deleteChats(workspace.slug, [chatId])
        .then(() =>
          sendCommandRef.current({
            text: lastUserMessage.content,
            autoSubmit: true,
            history: filteredHistory,
            attachments: lastUserMessage?.attachments,
          })
        )
        .catch((e) => console.error(e));
    },
    [workspace.slug]
  );

  useEffect(() => {
    if (pendingMessageChecked.current || !workspace?.slug) return;
    pendingMessageChecked.current = true;

    const pending = safeJsonParse(sessionStorage.getItem(PENDING_HOME_MESSAGE));
    if (pending?.message) {
      setTimeout(() => {
        sessionStorage.removeItem(PENDING_HOME_MESSAGE);
        sendCommand({
          text: pending.message,
          attachments: pending.attachments || [],
          autoSubmit: true,
        });
      }, 100);
    }
  }, [workspace?.slug]);

  useEffect(() => {
    async function fetchReply() {
      const promptMessage =
        chatHistory.length > 0 ? chatHistory[chatHistory.length - 1] : null;
      const remHistory = chatHistory.length > 0 ? chatHistory.slice(0, -1) : [];
      var _chatHistory = [...remHistory];

      // Override hook for new messages to now go to agents until the connection closes
      if (!!websocket) {
        if (!promptMessage || !promptMessage?.userMessage) return false;

        // Session start re-triggers this effect (setLoadingResponse(true) in
        // handleWSS) while the socket is still CONNECTING. The server already
        // begins working on the invocation prompt itself on connect, so there
        // is no feedback to relay yet - sending here would both throw
        // (InvalidStateError) and duplicate the opening prompt.
        if (websocket.readyState === WebSocket.CONNECTING) return;

        // A stale socket (server restart, network drop) must not orphan the
        // message: drop it and fall through to a fresh send below. Without
        // this the optimistic bubble renders but nothing ever runs.
        if (websocket.readyState !== WebSocket.OPEN) {
          try {
            websocket.close();
          } catch {}
          setWebsocket(null);
          setSocketId(null);
          setAgentSessionActive(false);
          setAgentSessionSocket(null);
        } else {
          const attachments = promptMessage?.attachments ?? parseAttachments();
          window.dispatchEvent(new CustomEvent(CLEAR_ATTACHMENTS_EVENT));
          // A follow-up message starts a new agent turn: reset the run clock
          // and re-arm the summary card for that turn's end.
          runStartRef.current = Date.now();
          summaryEmittedRef.current = false;
          websocket.send(
            JSON.stringify({
              type: "awaitingFeedback",
              feedback: promptMessage?.userMessage,
              attachments,
            })
          );

          // /reset during an active agent session should end the session AND
          // clear the chat in a single action. The send above triggers the
          // server to abort the agent and close the socket; fall through to the
          // /reset flow below which resets memory + clears chat history.
          if (promptMessage.userMessage.trim() !== "/reset") return;
          pendingResetRef.current = true;
        }
      }

      if (!promptMessage || !promptMessage?.userMessage) return false;

      // /compact without an open agent session has nothing to compact - the
      // server only intercepts the command over the session websocket. Sending
      // it as a normal prompt would just be handed to the model, so revert the
      // pending pair and hint instead.
      if (/^\/compact(\s|$)/i.test(String(promptMessage.userMessage).trim())) {
        const trimmed = [...remHistory];
        const last = trimmed[trimmed.length - 1];
        if (
          last?.role === "user" &&
          last?.content === promptMessage.userMessage
        )
          trimmed.pop();
        setChatHistory(trimmed);
        setLoadingResponse(false);
        showToast(t("chat_window.compact.no_session"), "info", {
          clear: true,
        });
        return;
      }

      // If running and edit or regeneration, this history will already have attachments
      // so no need to parse the current state.
      const attachments = promptMessage?.attachments ?? parseAttachments();
      window.dispatchEvent(new CustomEvent(CLEAR_ATTACHMENTS_EVENT));

      await Workspace.multiplexStream({
        workspaceSlug: workspace.slug,
        threadSlug: activeThreadSlug,
        prompt: promptMessage.userMessage,
        chatHandler: (chatResult) =>
          handleChat(
            chatResult,
            setLoadingResponse,
            setChatHistory,
            remHistory,
            _chatHistory,
            setSocketId
          ),
        attachments,
      });
      return;
    }
    loadingResponse === true && fetchReply();
  }, [loadingResponse, chatHistory, workspace]);

  // TODO: Simplify this WSS stuff
  useEffect(() => {
    let socket = null;
    let onAbortStream = null;

    function removeAbortListener() {
      if (!onAbortStream) return;
      window.removeEventListener(ABORT_STREAM_EVENT, onAbortStream);
      onAbortStream = null;
    }

    function handleWSS() {
      try {
        if (!socketId || !!websocket) return;
        socket = new WebSocket(
          `${websocketURI()}/api/agent-invocation/${socketId}`
        );
        socket.supportsAgentStreaming = false;

        onAbortStream = () => {
          setAgentSessionActive(false);
          setAgentSessionSocket(null);
          window.dispatchEvent(new CustomEvent(AGENT_SESSION_END));
          socket?.close();
        };
        window.addEventListener(ABORT_STREAM_EVENT, onAbortStream);

        socket.addEventListener("message", (event) => {
          try {
            // Keep the stop generation button visible for the entire
            // execution loop - only swap back to the send button when the
            // agent pauses to wait on the user. Passive bookkeeping events
            // (null) leave the loading state as-is.
            const data = safeJsonParse(event.data, null);
            const loadingState = agentEventLoadingState(data);
            if (loadingState !== null) setLoadingResponse(loadingState);
            // The agent finished its turn and pauses for the user - the run
            // summary fires here; the socket itself stays open for follow-ups.
            if (data?.type === "WAITING_ON_INPUT") emitRunSummary();
            handleSocketResponse(socket, event, setChatHistory);
          } catch {
            console.error("Failed to parse data");
            setAgentSessionActive(false);
            window.dispatchEvent(new CustomEvent(AGENT_SESSION_END));
            setLoadingResponse(false);
            socket.close();
          }
        });

        socket.addEventListener("close", (_event) => {
          removeAbortListener();
          setAgentSessionActive(false);
          setAgentSessionSocket(null);
          window.dispatchEvent(new CustomEvent(AGENT_SESSION_END));
          // When the close was triggered by /reset, skip the run summary -
          // the pending /reset flow will clear history. A summary already
          // emitted by WAITING_ON_INPUT is not duplicated.
          if (!pendingResetRef.current) emitRunSummary();
          pendingResetRef.current = false;
          setLoadingResponse(false);
          setWebsocket(null);
          setSocketId(null);
        });
        setWebsocket(socket);
        setAgentSessionActive(true);
        setAgentSessionSocket(socket);
        runStartRef.current = Date.now();
        summaryEmittedRef.current = false;
        // Seed the chat's tool permission mode so a session opened while
        // auto-approve is selected never prompts for its first tool call.
        // The socket is still CONNECTING here, so wait for open.
        socket.addEventListener("open", () => {
          socket.send(
            JSON.stringify({
              type: "permissionMode",
              mode: getPermissionMode(),
            })
          );
        });
        // The agent immediately begins working on the prompt that opened
        // this session, so restore the loading state that the closing
        // "Swapping over to agent chat" statusResponse cleared.
        setLoadingResponse(true);
        window.dispatchEvent(new CustomEvent(AGENT_SESSION_START));
        window.dispatchEvent(new CustomEvent(CLEAR_ATTACHMENTS_EVENT));
      } catch (e) {
        setChatHistory((prev) => [
          ...prev.filter((msg) => !!msg.content),
          {
            uuid: v4(),
            type: "abort",
            content: e.message,
            role: "assistant",
            sources: [],
            closed: true,
            error: e.message,
            animate: false,
            pending: false,
          },
        ]);
        setLoadingResponse(false);
        setWebsocket(null);
        setSocketId(null);
      }
    }
    handleWSS();

    return () => {
      removeAbortListener();
      if (socket) {
        setAgentSessionActive(false);
        window.dispatchEvent(new CustomEvent(AGENT_SESSION_END));
        socket.close();
      }
    };
  }, [socketId, emitRunSummary]);

  // Push permission-mode changes to a live agent session so the chat-bar pill
  // applies mid-run, not just at the next session start.
  const liveSocketRef = useRef(websocket);
  liveSocketRef.current = websocket;
  useEffect(
    () =>
      subscribePermissionMode((mode) => {
        const socket = liveSocketRef.current;
        if (socket?.readyState === WebSocket.OPEN)
          socket.send(JSON.stringify({ type: "permissionMode", mode }));
      }),
    []
  );

  if (isEmpty) {
    return (
      <ChatSidebarProvider>
        <div
          style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
          className="relative flex md:ml-[2px] md:mr-[16px] md:my-[16px] w-full h-full min-w-0 z-[2]"
        >
          <div className="flex-1 min-w-0 relative md:rounded-[16px] bg-zinc-900 light:bg-white w-full h-full overflow-hidden border-none light:border-solid light:border light:border-theme-modal-border">
            {isMobile && <SidebarMobileHeader />}
            <DnDFileUploaderWrapper>
              <div className="flex flex-col h-full w-full">
                <ChatHeader workspace={workspace} threadSlug={activeThreadSlug}>
                  <ChatSettingsMenu
                    inline
                    history={chatHistory}
                    workspace={workspace}
                    threadSlug={activeThreadSlug}
                  />
                  <AgentPanelButton />
                </ChatHeader>
                <div className="flex-1 min-h-0 flex flex-col w-full items-center justify-center overflow-y-auto no-scroll">
                  <div className="flex flex-col items-center w-full md:w-[85%]">
                    <h1 className="text-white text-xl md:text-2xl mb-11 text-center">
                      {t("main-page.greeting")}
                    </h1>
                    <PromptInput
                      workspace={workspace}
                      submit={handleSubmit}
                      isStreaming={loadingResponse}
                      sendCommand={sendCommand}
                      attachments={files}
                      centered={true}
                      chatHistory={chatHistory}
                    />
                    <QuickActions
                      hasAvailableWorkspace={!!workspace}
                      onCreateAgent={() =>
                        navigate(paths.settings.agentSkills())
                      }
                      onEditWorkspace={() =>
                        navigate(
                          paths.workspace.settings.generalAppearance(
                            workspace.slug
                          )
                        )
                      }
                      onUploadDocument={() =>
                        document
                          .getElementById("dnd-chat-file-uploader")
                          ?.click()
                      }
                    />
                  </div>
                  <SuggestedMessages
                    suggestedMessages={workspace?.suggestedMessages}
                    sendCommand={sendCommand}
                  />
                </div>
              </div>
            </DnDFileUploaderWrapper>
            <ChatTooltips />
          </div>
          <MemoriesSidebar workspace={workspace} />
        </div>
      </ChatSidebarProvider>
    );
  }

  return (
    <ChatSidebarProvider>
      <ActiveGenerationGuard isGenerating={loadingResponse} />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative flex md:ml-[2px] md:mr-[16px] md:my-[16px] w-full h-full min-w-0 z-[2]"
      >
        <div className="flex-1 min-w-0 relative md:rounded-[16px] bg-zinc-900 light:bg-white text-white light:text-slate-900 h-full overflow-hidden border-none light:border-solid light:border light:border-theme-modal-border">
          {isMobile && <SidebarMobileHeader />}
          <DnDFileUploaderWrapper>
            <div className="flex flex-col h-full w-full pb-20 md:pb-0">
              <ChatHeader workspace={workspace} threadSlug={activeThreadSlug}>
                <ChatSettingsMenu
                  inline
                  history={chatHistory}
                  workspace={workspace}
                  threadSlug={activeThreadSlug}
                />
                <AgentPanelButton />
              </ChatHeader>
              <div className="contents">
                <MetricsProvider>
                  <ChatHistory
                    ref={chatHistoryRef}
                    history={chatHistory}
                    workspace={workspace}
                    sendCommand={sendCommand}
                    updateHistory={setChatHistory}
                    regenerateAssistantMessage={regenerateAssistantMessage}
                    websocket={websocket}
                  />
                </MetricsProvider>
                <PromptInput
                  workspace={workspace}
                  submit={handleSubmit}
                  isStreaming={loadingResponse}
                  sendCommand={sendCommand}
                  attachments={files}
                  centered={false}
                  chatHistory={chatHistory}
                  messageQueue={messageQueue}
                  queueHalted={queueHalted}
                  onQueueMessage={queueMessage}
                  onQueueMove={moveQueueItem}
                  onQueueEdit={editQueueItem}
                  onQueueDelete={deleteQueueItem}
                  onQueueContinue={continueQueue}
                />
              </div>
            </div>
          </DnDFileUploaderWrapper>
          <ChatTooltips />
        </div>
        <SourcesSidebar />
        <MemoriesSidebar workspace={workspace} />
      </div>
    </ChatSidebarProvider>
  );
}
