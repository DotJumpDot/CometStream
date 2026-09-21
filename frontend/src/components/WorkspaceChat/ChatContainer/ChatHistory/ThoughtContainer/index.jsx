import { useState, createContext, useContext, useCallback } from "react";
import { formatDuration } from "@/utils/numbers";

/**
 * Context to persist activity-chain expansion state across component
 * transitions (e.g., from PromptReply to HistoricalMessage)
 */
const ThoughtExpansionContext = createContext(null);

export function ThoughtExpansionProvider({ children }) {
  const [expansionStates, setExpansionStates] = useState({});

  const getExpanded = useCallback(
    (messageId) => {
      if (!messageId) return false;
      return expansionStates[messageId] ?? false;
    },
    [expansionStates]
  );

  const setExpanded = useCallback((messageId, expanded) => {
    if (!messageId) return;
    setExpansionStates((prev) => ({
      ...prev,
      [messageId]: expanded,
    }));
  }, []);

  // Whether the user ever toggled this chain. Untouched chains mirror the
  // run instead: open while working, collapsed once finished.
  const hasToggled = useCallback(
    (messageId) => {
      if (!messageId) return false;
      return Object.prototype.hasOwnProperty.call(expansionStates, messageId);
    },
    [expansionStates]
  );

  return (
    <ThoughtExpansionContext.Provider
      value={{ getExpanded, setExpanded, hasToggled }}
    >
      {children}
    </ThoughtExpansionContext.Provider>
  );
}

export function useThoughtExpansion(messageId) {
  const context = useContext(ThoughtExpansionContext);
  const contextSetExpanded = context?.setExpanded;
  // Stable across renders so consumers can safely memoize on it.
  const setExpanded = useCallback(
    (value) => contextSetExpanded?.(messageId, value),
    [contextSetExpanded, messageId]
  );
  // No provider - fall back to never-expanded local behavior.
  if (!context) return { expanded: false, setExpanded, touched: false };
  return {
    expanded: context.getExpanded(messageId),
    setExpanded,
    touched: context.hasToggled(messageId),
  };
}

/**
 * @param {boolean} isThinking
 * @param {number|null} duration - seconds spent working, when it was observed
 * @returns {string}
 */
export function thoughtLabel(isThinking, duration) {
  if (isThinking) return "Thinking...";
  if (duration) return `Thought for ${formatDuration(duration)}`;
  return "Thoughts";
}

const THOUGHT_KEYWORDS = ["thought", "thinking", "think", "thought_chain"];
const CLOSING_TAGS = [...THOUGHT_KEYWORDS, "response", "answer"];
export const THOUGHT_REGEX_OPEN = new RegExp(
  THOUGHT_KEYWORDS.map((keyword) => `<${keyword}\\s*(?:[^>]*?)?\\s*>`).join("|")
);
export const THOUGHT_REGEX_CLOSE = new RegExp(
  CLOSING_TAGS.map((keyword) => `</${keyword}\\s*(?:[^>]*?)?>`).join("|")
);
export const THOUGHT_REGEX_COMPLETE = new RegExp(
  THOUGHT_KEYWORDS.map(
    (keyword) =>
      `<${keyword}\\s*(?:[^>]*?)?\\s*>[\\s\\S]*?<\\/${keyword}\\s*(?:[^>]*?)?>`
  ).join("|")
);

/**
 * Removes the wrapping think tags from a thought segment.
 * @param {string} content
 * @returns {string}
 */
export function stripThoughtTags(content = "") {
  return content
    .replace(THOUGHT_REGEX_OPEN, "")
    .replace(THOUGHT_REGEX_CLOSE, "");
}

// Agent turns stream raw `<tool_call>...</tool_call>` protocol blocks inside
// the assistant text. The activity chain already logs each call as a
// one-line "Called X" step, so the blocks are stripped from visible chat -
// they are calling convention, not prose.
export const TOOL_CALL_REGEX = /<tool_call>[\s\S]*?<\/tool_call>/gi;

/**
 * Removes raw tool-call protocol blocks from assistant text.
 * @param {string} content
 * @returns {string}
 */
export function stripToolCalls(content = "") {
  return content.replace(TOOL_CALL_REGEX, "");
}
