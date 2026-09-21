import { memo, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import DOMPurify from "dompurify";
import {
  Brain,
  CheckCircle,
  Terminal,
  Wrench,
  XCircle,
} from "@phosphor-icons/react";
import AgentAnimation from "@/media/animations/agent-animation.webm";
import AgentStatic from "@/media/animations/agent-static.png";
import { renderThoughtMarkdown } from "@/utils/chat/markdown";
import { formatDuration } from "@/utils/numbers";
import {
  THOUGHT_REGEX_CLOSE,
  THOUGHT_REGEX_OPEN,
  stripThoughtTags,
  thoughtLabel,
  useThoughtExpansion,
} from "../ThoughtContainer";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "../ChainOfThought";

/**
 * Maximum characters for one activity-chain row. Rows are single-line by
 * design - the full text stays available on hover (see the step `title`).
 */
const STATUS_LABEL_MAX_CHARS = 120;

/**
 * Flattens a status line to a single capped line so long tool commands
 * (e.g. a chained shell one-liner) render as one truncated row instead of
 * a multi-line wall of text.
 * @param {string} text - raw status line
 * @returns {string} single-line label, capped with an ellipsis
 */
function singleLineStatus(text = "", max = STATUS_LABEL_MAX_CHARS) {
  const flat = String(text).replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Collapses raw agent status broadcasts into one readable line each.
 * The server emits several verbose forms per tool call (assembly dumps,
 * execution echoes with the full JSON payload) - the expanded chain should
 * read like a short log, not a protocol trace. Also reused by
 * HistoricalTrace so reloaded threads read the same as live ones.
 * @param {string} raw - statusResponse content
 * @returns {string|null} display label, or null to drop the line entirely
 */
export function humanizeAgentStatus(raw = "") {
  const s = raw.trim();
  if (!s) return null;
  // Pre-execution assembly dumps duplicate the execution echo that follows.
  if (/^Assembling Tool Call:/i.test(s)) return null;
  if (s.startsWith("@agent is executing")) {
    const match = s.match(/`([^`]+)`/);
    return match ? singleLineStatus(`Called ${cleanToolName(match[1])}`) : null;
  }
  let out = s.replace(/^@agent:\s*/i, "");
  // Trailing JSON argument payloads are unreadable noise in a step list.
  out = out.replace(/\s*\{[\s\S]*\}\s*$/, "").trim();
  const label = singleLineStatus(out);
  return label || null;
}

/**
 * Shortens a tool name for display: drops any parent# namespace and the
 * long filesystem- prefix so `filesystem-agent#filesystem-write-text-file`
 * reads as `write-text-file`. Shared with HistoricalTrace.
 * @param {string} name
 */
export function cleanToolName(name = "") {
  return name.replace(/^.*#/, "").replace(/^filesystem-/, "");
}

/**
 * Classifies a humanized status row so the chain can color-code it:
 * tool invocations, shell commands, and pass/fail results each get their
 * own icon + tone instead of one flat white list.
 * @param {string} label - humanized single-line status label
 * @returns {"toolcall"|"command"|"exit-ok"|"exit-fail"|"status"} step kind
 */
function classifyStatus(label = "") {
  if (label.startsWith("Called ")) return "toolcall";
  if (label.startsWith("$ ")) return "command";
  const exit = label.match(/^exit\s+(\d+)/i);
  if (exit) return Number(exit[1]) === 0 ? "exit-ok" : "exit-fail";
  return "status";
}

const STEP_KIND_ICON = {
  toolcall: Wrench,
  command: Terminal,
  "exit-ok": CheckCircle,
  "exit-fail": XCircle,
};

// Tones paint the label line only - durations keep their own dim style.
const STEP_KIND_TONE = {
  toolcall: "text-sky-300 light:text-sky-700 font-medium",
  command: "text-zinc-200 light:text-zinc-800",
  "exit-ok": "text-emerald-400 light:text-emerald-600",
  "exit-fail": "text-red-400 light:text-red-600 font-medium",
  status: undefined,
};

/**
 * One rolled-up activity chain. Every agent status update and model thought
 * that happens between visible chat messages collapses into a single
 * expandable block instead of stacking one bubble per activity. Nodes are
 * either raw statusResponse history items or
 * `{ type: "thoughtChain", uuid, content }` entries split out of assistant
 * messages by buildMessages.
 *
 * @param {Object} props
 * @param {Array} props.messages - activity nodes, in arrival order
 * @param {boolean} props.isThinking - the agent run is live and this chain is last
 * @param {boolean} props.isLastGroup - this chain is the last compiled item
 */
export default function StatusResponse({
  messages = [],
  isThinking = false,
  isLastGroup = false,
}) {
  const { t } = useTranslation();
  const chainId = messages[0]?.uuid;
  const {
    expanded: persistedExpanded,
    setExpanded: setPersistedExpanded,
    touched: persistedTouched,
  } = useThoughtExpansion(chainId);
  const [localExpanded, setLocalExpanded] = useState(false);
  const [localTouched, setLocalTouched] = useState(false);

  const lastNode = messages[messages.length - 1];
  const lastIsThought = lastNode?.type === "thoughtChain";
  // Mid-thought is detected purely from the think tags - the server never
  // reports it. isLastGroup gates the animation so an aborted run loaded
  // from history cannot shimmer forever.
  const thoughtStreaming =
    lastIsThought &&
    !!lastNode.content?.match(THOUGHT_REGEX_OPEN) &&
    !lastNode.content?.match(THOUGHT_REGEX_CLOSE);
  const thinkingActive = isLastGroup && thoughtStreaming;
  // The run can be live without a streaming thought - e.g. a thought closed
  // and the agent is executing a tool with no new status yet. Stay animated
  // on the most recent status so the chain never looks finished mid-run.
  const workingActive = isThinking && !thinkingActive;
  const active = thinkingActive || workingActive;

  const { arrivals, finalizedAt } = useActivityTimestamps(messages, active);

  // A chain the user never toggled mirrors the run: open while work is in
  // flight so the activity is visible without clicking, auto-collapsed once
  // finished. An explicit toggle always wins afterwards.
  const touched = chainId ? persistedTouched : localTouched;
  const isExpanded = touched
    ? chainId
      ? persistedExpanded
      : localExpanded
    : active;
  const setIsExpanded = (next) => {
    if (chainId) {
      // Persisting the choice also marks the chain as user-toggled.
      setPersistedExpanded(next);
    } else {
      setLocalTouched(true);
      setLocalExpanded(next);
    }
  };

  const firstArrival = chainId ? arrivals[chainId] : null;
  const totalDuration =
    finalizedAt && firstArrival ? (finalizedAt - firstArrival) / 1000 : null;

  const lastStatusNode = workingActive
    ? messages.findLast((m) => m.type !== "thoughtChain")
    : null;
  const headerLabel = thinkingActive
    ? t("chat_window.thought_in_progress")
    : workingActive
      ? (humanizeAgentStatus(lastStatusNode?.content ?? "") ??
        t("chat_window.thought_in_progress"))
      : totalDuration
        ? thoughtLabel(false, totalDuration)
        : t("chat_window.thoughts");
  const hasStatusNodes = messages.some((m) => m.type !== "thoughtChain");

  // Pre-compute rendered steps: status lines are humanized and noise lines
  // (assembly dumps, JSON echoes) drop out entirely. Durations then span to
  // the next rendered step, absorbing the dropped lines' time. `full` keeps
  // the uncapped single-line text for the hover tooltip.
  const stepNodes = [];
  for (const node of messages) {
    if (node.type === "thoughtChain") {
      stepNodes.push({ node, label: null, full: null });
      continue;
    }
    const label = humanizeAgentStatus(node.content);
    if (label)
      stepNodes.push({
        node,
        label,
        full: singleLineStatus(node.content, Number.POSITIVE_INFINITY),
      });
  }

  return (
    <ChainOfThought open={isExpanded} onOpenChange={setIsExpanded}>
      <ChainOfThoughtHeader
        icon={
          <ActivityIcon
            active={active}
            thinking={thinkingActive || !hasStatusNodes}
            hasStatusNodes={hasStatusNodes}
          />
        }
        pending={active}
      >
        {headerLabel}
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {stepNodes.map(({ node, label, full }, index) => {
          const start = node.uuid ? arrivals[node.uuid] : null;
          const end = arrivals[stepNodes[index + 1]?.node.uuid] ?? finalizedAt;
          const seconds =
            start && end && end > start ? (end - start) / 1000 : null;
          const isThought = node.type === "thoughtChain";
          const kind = isThought ? null : classifyStatus(label);
          return (
            <ChainOfThoughtStep
              key={node.uuid || `activity-${index}`}
              icon={isThought ? Brain : STEP_KIND_ICON[kind]}
              status={
                active && index === stepNodes.length - 1 ? "active" : "complete"
              }
              label={isThought ? <ThoughtNode content={node.content} /> : label}
              labelClassName={isThought ? undefined : STEP_KIND_TONE[kind]}
              // Full command on hover; the visible row stays one line.
              title={isThought ? undefined : full}
              description={seconds ? formatDuration(seconds) : undefined}
            />
          );
        })}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}

/**
 * Times activity client-side. Status updates and thoughts carry no server
 * timestamps and are never persisted, so each node is stamped when it first
 * appears and the chain is stamped once more when it settles. A node's
 * duration runs to the next node's arrival (or the settle time for the last
 * one); a chain loaded from history was never active and shows no durations.
 * @param {Array} messages - activity nodes
 * @param {boolean} active - the chain is still doing work
 * @returns {{arrivals: Object<string, number>, finalizedAt: number|null}}
 */
function useActivityTimestamps(messages, active) {
  const [arrivals, setArrivals] = useState({});
  const [finalizedAt, setFinalizedAt] = useState(null);
  const [everActive, setEverActive] = useState(false);

  useEffect(() => {
    if (!messages.some((m) => m.uuid && arrivals[m.uuid] == null)) return;
    setArrivals((prev) => {
      const next = { ...prev };
      for (const m of messages) {
        if (m.uuid && next[m.uuid] == null) next[m.uuid] = Date.now();
      }
      return next;
    });
  }, [messages, arrivals]);

  useEffect(() => {
    if (active) {
      setEverActive(true);
      // A new node re-activated a settled chain - the settle time is stale.
      if (finalizedAt !== null) setFinalizedAt(null);
      return;
    }
    if (everActive && finalizedAt === null) setFinalizedAt(Date.now());
  }, [active, everActive, finalizedAt]);

  return { arrivals, finalizedAt };
}

const ThoughtNode = memo(function ThoughtNode({ content }) {
  const html = useMemo(
    () => DOMPurify.sanitize(renderThoughtMarkdown(stripThoughtTags(content))),
    [content]
  );
  return (
    <div
      className="break-words text-zinc-300 light:text-zinc-700 text-[13px] leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

function ActivityIcon({ active, thinking, hasStatusNodes }) {
  // Thought states use the same brain glyph as the expanded thought nodes;
  // the shimmering header label already signals activity while thinking.
  if (active && thinking) return <Brain className="size-5 flex-shrink-0" />;

  if (active)
    return (
      <video
        autoPlay
        loop
        muted
        playsInline
        className="w-5 h-5 flex-shrink-0 scale-[165%] light:invert light:opacity-50"
        aria-label="Agent is thinking..."
      >
        <source src={AgentAnimation} type="video/webm" />
      </video>
    );

  if (hasStatusNodes)
    return (
      <img
        src={AgentStatic}
        alt="Agent complete"
        className="w-5 h-5 flex-shrink-0 light:invert light:opacity-50"
      />
    );

  return <Brain className="size-5 flex-shrink-0" />;
}
