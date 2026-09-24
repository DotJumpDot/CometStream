import { v4 } from "uuid";
import { safeJsonParse } from "../request";
import { API_BASE } from "../constants";
import { useEffect, useState } from "react";
import { emitAssistantMessageCompleteEvent } from "@/components/contexts/TTSProvider";
import { THREAD_RENAME_EVENT } from "@/components/Sidebar/ActiveWorkspaces/ThreadContainer";
import {
  addAgentFileChange,
  addTrajectoryRecord,
  setAgentTodo,
  setRunToolIo,
  upsertAgentSession,
} from "@/utils/agentActivity";

export const AGENT_SESSION_START = "agentSessionStart";
export const AGENT_SESSION_END = "agentSessionEnd";

// Pending file-write rows older than this sweep on the next fileChangeCard
// (a run killed mid-write leaves no orphans). The ChatHistory renderer
// additionally hides rows past twice this age as a backstop.
export const FILE_PROGRESS_STALE_MS = 3 * 60 * 1000;

// A live file-write stream emits progress every few hundred ms. Silence
// past this age means the stream is dead or finished without a completion
// card (MCP file writes succeed without emitting fileChangeCard), so the
// row drops even when no completion ever arrives to match it.
export const FILE_PROGRESS_ALIVE_MS = 60 * 1000;

/**
 * Matches a live file-write checkpoint row against a completed file path.
 * Either direction may prefix-match: mid-stream the guess is usually a
 * prefix of the final path. Short guesses (< 4 chars) never match - they
 * are still just a key fragment.
 * @param {{pathGuess?: string|null}} row - pending progress row
 * @param {string} finalPath - fileChangeCard path
 * @returns {boolean} True when the row belongs to this file.
 */
export function pendingProgressMatches(row = {}, finalPath = "") {
  const guess = typeof row?.pathGuess === "string" ? row.pathGuess : "";
  const final = typeof finalPath === "string" ? finalPath : "";
  if (guess.length < 4 || !final) return false;
  // Compare basenames as well: completion paths may be project-relative
  // while the guess is a bare filename (create-* tools), or vice versa.
  // Either side under 4 chars never matches (still a key fragment).
  const base = (p) => p.split(/[\\/]/).filter(Boolean).pop() || p;
  const pairs = [
    [guess, final],
    [base(guess), base(final)],
  ];
  return pairs.some(
    ([a, b]) =>
      Math.min(a.length, b.length) >= 4 &&
      (a === b || a.startsWith(b) || b.startsWith(a))
  );
}

/**
 * Drops settled pending file-write rows from a chat history array: rows
 * matching any settled name plus rows older than the stale budget (a run
 * killed mid-write leaves no orphans). Pure so the fileChangeCard and
 * fileDownloadCard handlers share it.
 * @param {Array} prev - chat history rows
 * @param {Array<string>} settledNames - completed file paths/names
 * @returns {Array} Filtered rows.
 */
export function clearSettledFileProgress(prev = [], settledNames = []) {
  const names = (Array.isArray(settledNames) ? settledNames : []).filter(
    (n) => typeof n === "string" && n
  );
  const now = Date.now();
  return prev.filter(
    (msg) =>
      !!msg.content &&
      (msg.type !== "fileWriteProgress" ||
        (!names.some((name) => pendingProgressMatches(msg, name)) &&
          now - (msg.at || 0) < FILE_PROGRESS_STALE_MS))
  );
}

// Socket events where the agent execution loop has paused and is waiting on
// the user to type a response (feedback prompt, clarifying questions). While
// one of these is pending the UI should show the send button instead of the
// stop generation button. A pending toolApprovalRequest is deliberately NOT
// here: the run is mid-execution waiting on an Approve/Reject, and dropping
// the stop button then makes the chat look finished or frozen.
const AGENT_AWAITING_USER_EVENTS = [
  "WAITING_ON_INPUT",
  "clarificationRequest",
  // An inline /img command finished while the session was paused awaiting
  // feedback - it stays paused, so the send button must come back.
  "imageGenerationCard",
  // Compaction finished. The session is paused waiting on the user (manual
  // /compact never resumes the agent) - even after an auto-compact at session
  // start the next status event re-flags the run as loading within moments.
  "contextCompactEnd",
];

// Bookkeeping events that never indicate the agent is actively working. Some
// of these can arrive after the execution loop already finished (e.g.
// rename_thread fires once the async chat save + thread auto-rename complete),
// so they must not re-show the stop generation button.
const AGENT_PASSIVE_EVENTS = ["rename_thread"];
const AGENT_PASSIVE_STREAM_EVENTS = [
  "chatId",
  "usageMetrics",
  "citations",
  "removeStatusResponse",
  // Live file-write checkpoints tick a pending row in place; they carry no
  // new work state.
  "toolCallProgress",
];

/**
 * Determine what the chat loading state should become for an incoming agent
 * socket event: `true` while the agent is actively working (stop generation
 * button shows), `false` when it has paused to wait on the user (send button
 * shows), and `null` for passive bookkeeping events that should leave the
 * loading state untouched.
 * @param {object|null} data - parsed agent socket event payload
 * @returns {boolean|null}
 */
export function agentEventLoadingState(data) {
  if (AGENT_AWAITING_USER_EVENTS.includes(data?.type)) return false;
  if (AGENT_PASSIVE_EVENTS.includes(data?.type)) return null;
  if (
    data?.type === "reportStreamEvent" &&
    AGENT_PASSIVE_STREAM_EVENTS.includes(data?.content?.type)
  )
    return null;
  return true;
}

// Citations arrive as a terminal websocket event that must match an existing message by
// uuid. On a thread's first message the empty->chat transition remounts the chat and
// replays the send, so the citations event can land before its message exists in history.
// Buffer by uuid (module scope survives the remount) and attach when the message appears.
const bufferedCitations = new Map();
function takeBufferedCitations(uuid) {
  if (!uuid || !bufferedCitations.has(uuid)) return [];
  const citations = bufferedCitations.get(uuid);
  bufferedCitations.delete(uuid);
  return citations;
}
const handledEvents = [
  "statusResponse",
  "fileChangeCard",
  "todoListCard",
  "sessionCard",
  "fileDownloadCard",
  "imageGenerationCard",
  "imageGenerationPending",
  "scheduledJobCreated",
  "awaitingFeedback",
  "wssFailure",
  "rechartVisualize",
  "toolApprovalRequest",
  "clarificationRequest",
  "contextCompactStart",
  "contextCompactEnd",
  "trajectoryEvent",
  // Streaming events
  "reportStreamEvent",
];

export function websocketURI() {
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  if (API_BASE === "/api") return `${wsProtocol}//${window.location.host}`;
  return `${wsProtocol}//${new URL(import.meta.env.VITE_API_BASE).host}`;
}

export default function handleSocketResponse(socket, event, setChatHistory) {
  const data = safeJsonParse(event.data, null);
  if (data === null) return;

  // Handle thread rename
  if (data.type === "rename_thread") {
    const { slug, name } = data.content || {};
    if (slug && name) {
      window.dispatchEvent(
        new CustomEvent(THREAD_RENAME_EVENT, {
          detail: { threadSlug: slug, newName: name },
        })
      );
    }
    return;
  }

  // No message type is defined then this is a generic message
  // that we need to print to the user as a system response
  if (!data.hasOwnProperty("type") && !socket.supportsAgentStreaming) {
    return setChatHistory((prev) => {
      return [
        ...prev.filter((msg) => !!msg.content),
        {
          uuid: v4(),
          content: data.content,
          role: "assistant",
          sources: [],
          closed: true,
          error: null,
          animate: false,
          pending: false,
          metrics: {},
        },
      ];
    });
  }

  // toolApprovalRequest doesn't have content field, so check separately
  if (data.type === "toolApprovalRequest") {
    if (!data.requestId || !data.skillName) return;
  } else if (data.type === "clarificationRequest") {
    if (!data.requestId || !Array.isArray(data.questions)) return;
  } else if (data.type === "imageGenerationPending") {
    // The generate-image skill tags its placeholder with a pendingId and the
    // prompt so the result card can swap it out by uuid. The inline /img
    // command sends no content - its empty placeholder is swept up by the
    // !!msg.content filters when the next message lands.
    return setChatHistory((prev) => [
      ...prev.filter((msg) => !!msg.content),
      {
        type: "imageGenerationPending",
        uuid: data.content?.pendingId || v4(),
        content: data.content?.prompt || "",
        role: "assistant",
        sources: [],
        closed: false,
        error: null,
        animate: false,
        pending: true,
        metrics: {},
      },
    ]);
  } else if (!handledEvents.includes(data.type) || !data.content) {
    return;
  }

  if (data.type === "reportStreamEvent") {
    // Enable agent streaming for the next message so we can handle streaming or non-streaming responses
    // If we get this message we know the provider supports agentic streaming
    socket.supportsAgentStreaming = true;

    // trigger TTS auto-play
    if (data.content?.type === "chatId" && data.content?.chatId)
      emitAssistantMessageCompleteEvent(data.content.chatId);

    // Run-end tool-I/O snapshot (closes the trajectory lag so end-of-run
    // kind totals are exact). Store-only, no chat row.
    if (data.content?.type === "usageMetrics" && data.content?.toolIo)
      setRunToolIo(data.content.toolIo);

    // Live file-write checkpoints: one pending row per streaming tool call
    // (stable uuid per call index), updated in place as args stream in.
    // The completion's fileChangeCard replaces it below.
    if (data.content?.type === "toolCallProgress") {
      const progress = data.content;
      if (!progress?.uuid || !progress?.name) return;
      return setChatHistory((prev) => {
        const anchor = progress.pathGuess || progress.name;
        const now = Date.now();
        const row = {
          uuid: progress.uuid,
          type: "fileWriteProgress",
          role: "assistant",
          name: progress.name,
          pathGuess: progress.pathGuess || null,
          argChars: Number(progress.argChars) || 0,
          linesGuess: Number(progress.linesGuess) || 0,
          at: now,
          content: anchor,
          sources: [],
          closed: true,
          error: null,
          animate: false,
          pending: true,
          metrics: {},
        };
        if (prev.some((msg) => msg.uuid === progress.uuid)) {
          return prev.map((msg) =>
            msg.uuid === progress.uuid ? { ...msg, ...row } : msg
          );
        }
        // Silence-aged rows drop here too: a stream dead longer than the
        // alive budget never produces a completion to match against, so
        // waiting for one would orphan the row (e.g. MCP writes, which
        // succeed without any fileChangeCard).
        return [
          ...prev.filter(
            (msg) =>
              !!msg.content &&
              (msg.type !== "fileWriteProgress" ||
                msg.uuid === progress.uuid ||
                now - (msg.at || 0) < FILE_PROGRESS_ALIVE_MS)
          ),
          row,
        ];
      });
    }

    return setChatHistory((prev) => {
      if (data.content.type === "removeStatusResponse")
        return [...prev.filter((msg) => msg.uuid !== data.content.uuid)];

      if (data.content.type === "modelRouteNotification") {
        if (!data.content.routedTo) return prev;
        return [
          ...prev.filter(
            (msg) => !(msg.role === "assistant" && msg.pending && !msg.content)
          ),
          {
            uuid: data.content.uuid,
            type: "modelRouteNotification",
            content: "modelRouteNotification",
            routedTo: data.content.routedTo,
          },
        ];
      }

      // Handle citations independently of message creation order. If the target message
      // exists, attach now or buffer until it is created.
      if (data.content.type === "citations") {
        const { uuid, citations } = data.content;
        if (!citations) return prev;
        let attached = false;
        const next = prev.map((msg) => {
          if (msg.uuid !== uuid) return msg;
          attached = true;
          return { ...msg, sources: [...(msg.sources || []), ...citations] };
        });
        if (!attached) bufferedCitations.set(uuid, citations);
        return next;
      }

      const knownMessage = data.content.uuid
        ? prev.find((msg) => msg.uuid === data.content.uuid)
        : null;
      if (!knownMessage) {
        if (data.content.type === "fullTextResponse") {
          return [
            ...prev.filter((msg) => !!msg.content),
            {
              uuid: data.content.uuid,
              type: "textResponse",
              content: data.content.content,
              role: "assistant",
              sources: takeBufferedCitations(data.content.uuid),
              closed: true,
              error: null,
              animate: false,
              pending: false,
              metrics: {},
            },
          ];
        }

        // Handle textResponseChunk initialization as textResponse instead of statusResponse.
        // Without this the first chunk creates a statusResponse (thought bubble) by falling through to the default case.
        // Providers like Gemini send large chunks and can complete in a single chunk before the update logic can convert it.
        // Other providers send many small chunks so the second chunk triggers the update logic to fix the type.
        if (data.content.type === "textResponseChunk") {
          // If this first chunk is just a non-text char (like \n, \t, etc.) then we need to ignore it.
          // Some providers like LMStudio will do this and it depends on the chat template as well.
          if (data.content.content.trim() === "") return prev;
          return [
            ...prev.filter((msg) => !!msg.content),
            {
              uuid: data.content.uuid,
              type: "textResponse",
              content: data.content.content,
              role: "assistant",
              sources: takeBufferedCitations(data.content.uuid),
              closed: true,
              error: null,
              animate: false,
              pending: false,
              metrics: {},
            },
          ];
        }

        return [
          ...prev.filter((msg) => !!msg.content),
          {
            uuid: data.content.uuid,
            type: "statusResponse",
            content: data.content.content,
            role: "assistant",
            sources: [],
            closed: true,
            error: null,
            animate: false,
            pending: false,
            metrics: {},
          },
        ];
      } else {
        const { type, content, uuid } = data.content;
        // For tool call invocations, we need to update the existing message entirely since it is accumulated
        // and we dont know if the function will have arguments or not while streaming - so replace the existing message entirely
        if (type === "toolCallInvocation") {
          const knownMessage = prev.find((msg) => msg.uuid === uuid);
          if (!knownMessage)
            return [...prev, { uuid, type: "toolCallInvocation", content }]; // If the message is not known, add it to the end of the list
          return [
            ...prev.filter((msg) => msg.uuid !== uuid),
            { ...knownMessage, content },
          ]; // If the message is known, replace it with the new content
        }

        if (type === "usageMetrics") {
          if (!data.content.metrics) return prev;
          return prev.map((msg) =>
            msg.uuid === uuid ? { ...msg, metrics: data.content.metrics } : msg
          );
        }

        if (type === "chatId") {
          if (!data.content.chatId) return prev;
          const assistantIdx = prev.findIndex((msg) => msg.uuid === uuid);
          if (assistantIdx === -1) return prev;
          const userIdx = prev.findLastIndex(
            (msg, i) => i < assistantIdx && msg.role === "user"
          );
          return prev.map((msg, i) =>
            i === assistantIdx || i === userIdx
              ? { ...msg, chatId: data.content.chatId }
              : msg
          );
        }

        if (type === "textResponseChunk") {
          return prev
            .map((msg) =>
              msg.uuid === uuid
                ? {
                    ...msg,
                    type: "textResponse",
                    content: msg.content + content,
                  }
                : msg?.content
                  ? msg
                  : null
            )
            .filter((msg) => !!msg);
        }

        // Generic text response - will be put in the agent thought bubble
        return prev.map((msg) =>
          msg.uuid === data.content.uuid
            ? { ...msg, content: msg.content + data.content.content }
            : msg
        );
      }
    });
  }

  if (data.type === "fileChangeCard") {
    const change = data.content || {};
    if (!change.path) return;
    // Panel feed mirrors chat-stream chips (reads are chat-only).
    addAgentFileChange(change);
    return setChatHistory((prev) => [
      // The completion settles its live checkpoint row (exact, prefix, or
      // basename match); unrelated stale rows sweep too.
      ...clearSettledFileProgress(prev, [change.path]),
      {
        uuid: v4(),
        type: "fileChangeCard",
        role: "assistant",
        action: change.action || "edit",
        path: change.path,
        added: change.added ?? 0,
        removed: change.removed ?? 0,
        diff: change.diff || "",
        diffTruncated: !!change.truncated,
        readLines: change.lines ?? null,
        content: change.path,
        sources: [],
        closed: true,
        error: null,
        animate: false,
        pending: false,
        metrics: {},
      },
    ]);
  }

  // Plan updates render only in the agent side panel - no chat bubble.
  if (data.type === "todoListCard") {
    setAgentTodo(data.content?.items || []);
    return;
  }

  // Model trajectory records render only in the agent side panel's
  // Trajectory tab (per-iteration debug view) - never as chat bubbles.
  if (data.type === "trajectoryEvent") {
    addTrajectoryRecord(data.content || {});
    return;
  }

  // Terminal/subagent session rows live in both places: the side panel
  // feed and the chat stream. Two frames arrive per session (`running` at
  // start, `done`/`error` at finish with the same id), so the chat item
  // upserts in place - replacing keeps chronological interleave instead of
  // appending a duplicate row.
  if (data.type === "sessionCard") {
    const session = data.content || {};
    upsertAgentSession(session);
    if (session.id == null) return;
    return setChatHistory((prev) => {
      if (prev.some((msg) => msg.sessionId === session.id)) {
        return prev.map((msg) =>
          msg.sessionId === session.id
            ? { ...msg, content: { ...session } }
            : msg
        );
      }
      return [
        ...prev.filter((msg) => !!msg.content),
        {
          uuid: `session-${session.id}`,
          sessionId: session.id,
          type: "sessionCard",
          role: "assistant",
          content: { ...session },
          sources: [],
          closed: true,
          error: null,
          animate: false,
          pending: false,
          metrics: {},
        },
      ];
    });
  }

  if (data.type === "fileDownloadCard") {
    // Generated-file tools (create-text-file, xlsx/pdf/docx/pptx, images)
    // succeed through this card, so it settles live checkpoint rows exactly
    // like a fileChangeCard does.
    const content = data.content || {};
    return setChatHistory((prev) => {
      return [
        ...clearSettledFileProgress(prev, [
          content.filename,
          content.displayFilename,
        ]),
        {
          type: "fileDownloadCard",
          uuid: v4(),
          content: data.content,
          role: "assistant",
          sources: [],
          closed: true,
          error: null,
          animate: false,
          pending: false,
          metrics: data.metrics || {},
        },
      ];
    });
  }

  if (data.type === "imageGenerationCard") {
    return setChatHistory((prev) => {
      // Drops the placeholder card this result belongs to, if there was one.
      const history = prev.filter(
        (msg) => !!msg.content && msg.uuid !== data.content.pendingId
      );
      if (data.content.failed) return history;
      return [
        ...history,
        {
          uuid: v4(),
          type: "textResponse",
          content: data.content.text,
          outputs: data.content.outputs || [],
          chatId: data.content.chatId || null,
          role: "assistant",
          sources: [],
          closed: true,
          error: null,
          animate: false,
          pending: false,
          metrics: {},
        },
      ];
    });
  }

  if (data.type === "scheduledJobCreated") {
    return setChatHistory((prev) => {
      return [
        ...prev.filter((msg) => !!msg.content),
        {
          type: "scheduledJobCreated",
          uuid: v4(),
          content: data.content,
          role: "assistant",
          sources: [],
          closed: true,
          error: null,
          animate: false,
          pending: false,
          metrics: data.metrics || {},
        },
      ];
    });
  }

  if (data.type === "rechartVisualize") {
    return setChatHistory((prev) => {
      return [
        ...prev.filter((msg) => !!msg.content),
        {
          type: "rechartVisualize",
          uuid: v4(),
          content: data.content,
          role: "assistant",
          sources: [],
          closed: true,
          error: null,
          animate: false,
          pending: false,
          metrics: data.metrics || {},
        },
      ];
    });
  }

  if (data.type === "wssFailure") {
    return setChatHistory((prev) => {
      return [
        ...prev.filter((msg) => !!msg.content),
        {
          uuid: v4(),
          content: data.content,
          role: "assistant",
          sources: [],
          closed: true,
          error: data.content,
          animate: false,
          pending: false,
          metrics: {},
        },
      ];
    });
  }

  if (data.type === "toolApprovalRequest") {
    return setChatHistory((prev) => {
      return [
        ...prev.filter((msg) => !!msg.content),
        {
          uuid: v4(),
          type: "toolApprovalRequest",
          requestId: data.requestId,
          skillName: data.skillName,
          payload: data.payload,
          description: data.description,
          timeoutMs: data.timeoutMs,
          content: `Approval requested for ${data.skillName}`,
          role: "assistant",
          sources: [],
          closed: false,
          error: null,
          animate: false,
          pending: true,
          metrics: {},
        },
      ];
    });
  }

  if (data.type === "clarificationRequest") {
    return setChatHistory((prev) => {
      return [
        ...prev.filter((msg) => !!msg.content),
        {
          uuid: v4(),
          type: "clarifyingQuestion",
          requestId: data.requestId,
          questions: data.questions || [],
          allowSkip: data.allowSkip !== false,
          timeoutMs: data.timeoutMs,
          content: `Agent has ${data.questions?.length || 0} question${
            (data.questions?.length || 0) === 1 ? "" : "s"
          }`,
          role: "assistant",
          sources: [],
          closed: false,
          error: null,
          animate: false,
          pending: true,
          metrics: {},
        },
      ];
    });
  }

  if (data.type === "contextCompactStart") {
    return setChatHistory((prev) => [
      ...prev.filter((msg) => !!msg.content),
      {
        uuid: v4(),
        type: "contextCompactPending",
        content: "compressing-context",
        role: "assistant",
        sources: [],
        closed: false,
        error: null,
        animate: false,
        pending: true,
        metrics: {},
      },
    ]);
  }

  if (data.type === "contextCompactEnd") {
    const content = data.content || {};
    return setChatHistory((prev) => {
      // Swap the pending "Compressing context" card for the finished one.
      const base = prev.filter(
        (msg) => msg.type !== "contextCompactPending" && !!msg.content
      );
      // A skipped auto-compact (under threshold / disabled) is silent - the
      // user asked a question and the agent turn simply proceeds.
      if (content.ok === false && content.trigger === "auto") return base;

      // A successful compact folded the older rows server-side: drop them
      // and their live-only cards so the view matches the reloaded thread
      // and the context ring reflects the freed tokens. Everything from
      // the first surviving row onward is kept, which always includes the
      // current pending turn.
      let kept = base;
      const keptIds = new Set(content.keptChatIds || []);
      if (content.ok && keptIds.size > 0) {
        const firstKeptIdx = base.findIndex((msg) => keptIds.has(msg.chatId));
        if (firstKeptIdx > 0) kept = base.slice(firstKeptIdx);
      }

      const card = {
        uuid: v4(),
        type: "contextCompact",
        content: content.summary || "compacted-context",
        summary: content.summary || "",
        compactedMessages: content.compactedMessages ?? null,
        tokensBefore: content.tokensBefore ?? null,
        tokensAfter: content.tokensAfter ?? null,
        failure:
          content.ok === false
            ? content.reason || content.error || "failed"
            : null,
        role: "assistant",
        sources: [],
        closed: true,
        error: null,
        animate: false,
        pending: false,
        metrics: {},
      };
      // Success: the divider leads the kept tail, matching the persisted
      // rendering. Failure: the card reports what went wrong at the bottom.
      return content.ok === false ? [...kept, card] : [card, ...kept];
    });
  }

  return setChatHistory((prev) => {
    return [
      ...prev.filter((msg) => !!msg.content),
      {
        uuid: v4(),
        type: data.type,
        content: data.content,
        role: "assistant",
        sources: [],
        closed: true,
        error: null,
        animate: data?.animate || false,
        pending: false,
        metrics: data.metrics || {},
      },
    ];
  });
}

let _agentSessionActive = false;
export function setAgentSessionActive(value) {
  _agentSessionActive = value;
}
export function getAgentSessionActive() {
  return _agentSessionActive;
}

// Live agent-session websocket, used to toggle tools available to the agent mid-session.
let _agentSessionSocket = null;
export function setAgentSessionSocket(socket) {
  _agentSessionSocket = socket;
}

/**
 * Toggle a tool/skill on or off for the active agent session over the websocket.
 * No-op when there is no open agent session.
 * @param {string} skill - Skill key, `@@flow_<uuid>`, MCP `<server>-<tool>`, hubId, or sub-skill name.
 * @param {boolean} enabled - Whether the tool should be enabled.
 * @param {string|null} [serverName] - MCP server name; required to enable an MCP tool mid-session.
 */
export function toggleAgentSessionTool(skill, enabled, serverName = null) {
  if (_agentSessionSocket?.readyState !== WebSocket.OPEN) return;
  _agentSessionSocket.send(
    JSON.stringify({ type: "agentToolToggle", skill, enabled, serverName })
  );
}

export function useIsAgentSessionActive() {
  const [activeSession, setActiveSession] = useState(
    () => !!getAgentSessionActive()
  );
  useEffect(() => {
    function listenForAgentSession() {
      if (!window) return;
      window.addEventListener(AGENT_SESSION_START, () =>
        setActiveSession(true)
      );
      window.addEventListener(AGENT_SESSION_END, () => setActiveSession(false));
    }
    listenForAgentSession();
  }, []);

  return activeSession;
}
