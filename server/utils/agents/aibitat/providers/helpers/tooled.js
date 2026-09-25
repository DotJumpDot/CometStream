const { v4 } = require("uuid");
const { safeJsonParse } = require("../../../../http");
const { attachmentToContentBlock } = require("../../../../helpers/attachments");
const {
  ARGS_PARSE_ERROR_KEY,
  RAW_EXCERPT_CHARS,
} = require("../../utils/toolArgRepair.js");
const {
  extractReasoningContent,
} = require("../../../../helpers/chat/responses");
const {
  FILE_WRITE_TOOLS,
  PLAN_PROGRESS_TOOLS,
  guessPathFromArgs,
  guessLinesFromArgs,
} = require("../../plugins/tool-usage.js");

// Minimum gap between live file-write progress events for one call
// (see toolCallsByIndex loop below). Deltas arrive per token and the chat
// row re-renders per event - a few updates per second read as live without
// thrashing React. A byte gate would stall on slow models (small models
// stream args at ~20 tok/s, so 4KB is tens of seconds of silence).
const TOOL_PROGRESS_MS = 400;

/**
 * Shared native OpenAI-compatible tool calling utilities.
 * Any provider with an OpenAI-compatible client can use these functions
 * instead of the UnTooled prompt-based approach when the model supports
 * native tool calling.
 *
 * Usage in a provider:
 *   const { tooledStream, tooledComplete } = require("./helpers/tooled.js");
 *
 *   async stream(messages, functions, eventHandler) {
 *     if (await this.supportsNativeToolCalling()) {
 *       return tooledStream(this.client, this.model, messages, functions, eventHandler);
 *     }
 *     // ... fallback to UnTooled ...
 *   }
 */

/**
 * Convert aibitat function definitions to the OpenAI tools format.
 * @param {Array<{name: string, description: string, parameters: object}>} functions
 * @returns {Array<{type: "function", function: {name: string, description: string, parameters: object}}>}
 */
function formatFunctionsToTools(functions) {
  if (!Array.isArray(functions) || functions.length === 0) return [];
  return functions.map((func) => ({
    type: "function",
    function: {
      name: func.name,
      description: func.description,
      parameters: func.parameters,
    },
  }));
}

/**
 * Format message content with attachments (images) for multimodal support.
 * Transforms a message with attachments into the OpenAI-compatible format.
 * @param {Object} message - The message to format
 * @returns {Object} Message with content formatted for the API
 */
function formatMessageWithAttachments(message) {
  if (!message.attachments || message.attachments.length === 0) {
    return message;
  }

  // Transform message with attachments into multimodal format
  const content = [{ type: "text", text: message.content }];
  for (const attachment of message.attachments) {
    content.push(attachmentToContentBlock(attachment));
  }

  // Return message without attachments property, with content as array
  const { attachments: _, ...rest } = message;
  return {
    ...rest,
    content,
  };
}

/**
 * Convert the aibitat message history (which uses role:"function" with
 * `originalFunctionCall` metadata) into the OpenAI tool-calling message
 * format (assistant `tool_calls` + role:"tool" pairs).
 * Also handles image attachments for multimodal support.
 * @param {Array} messages
 * @param {{injectReasoningContent?: boolean}} options
 *   - injectReasoningContent: when true, ensures every assistant message has
 *     a `reasoning_content` field (required by DeepSeek thinking-mode models).
 * @returns {Array} Messages formatted for the OpenAI tools API
 */
function formatMessagesForTools(messages, options = {}) {
  const formattedMessages = [];
  const { injectReasoningContent = false } = options;

  for (const message of messages) {
    if (message.role === "function") {
      if (message.originalFunctionCall?.id) {
        const prevMsg = formattedMessages[formattedMessages.length - 1];
        if (!prevMsg || prevMsg.role !== "assistant" || !prevMsg.tool_calls) {
          formattedMessages.push({
            role: "assistant",
            content: null,
            ...(injectReasoningContent ? { reasoning_content: "" } : {}),
            tool_calls: [
              {
                id: message.originalFunctionCall.id,
                type: "function",
                // Some providers require provider-specific tool call metadata
                // to be echoed back on subsequent turns (eg: Gemini 3 models
                // on Vertex 400 when `extra_content.google.thought_signature`
                // is missing from replayed function calls).
                ...(message.originalFunctionCall.extra_content
                  ? {
                      extra_content: message.originalFunctionCall.extra_content,
                    }
                  : {}),
                function: {
                  name: message.originalFunctionCall.name,
                  arguments:
                    typeof message.originalFunctionCall.arguments === "string"
                      ? message.originalFunctionCall.arguments
                      : JSON.stringify(message.originalFunctionCall.arguments),
                },
              },
            ],
          });
        }
        formattedMessages.push({
          role: "tool",
          tool_call_id: message.originalFunctionCall.id,
          content:
            typeof message.content === "string"
              ? message.content
              : JSON.stringify(message.content),
        });
      } else {
        const toolCallId = `call_${v4()}`;
        formattedMessages.push({
          role: "assistant",
          content: null,
          ...(injectReasoningContent ? { reasoning_content: "" } : {}),
          tool_calls: [
            {
              id: toolCallId,
              type: "function",
              function: {
                name: message.name,
                arguments: "{}",
              },
            },
          ],
        });
        formattedMessages.push({
          role: "tool",
          tool_call_id: toolCallId,
          content:
            typeof message.content === "string"
              ? message.content
              : JSON.stringify(message.content),
        });
      }
    } else if (
      injectReasoningContent &&
      message.role === "assistant" &&
      !("reasoning_content" in message)
    ) {
      formattedMessages.push(
        formatMessageWithAttachments({ ...message, reasoning_content: "" })
      );
    } else {
      formattedMessages.push(formatMessageWithAttachments(message));
    }
  }

  return formattedMessages;
}

/**
 * Build the `max_tokens` request field from an explicit output budget passed
 * in the tooled options. This is opt-in per provider: only providers that pass
 * `maxTokens` in options get the field, every other provider keeps sending no
 * `max_tokens` so the backend's own default applies unchanged.
 * @param {unknown} maxTokens
 * @returns {{max_tokens?: number}}
 */
function maxTokensParam(maxTokens) {
  if (
    typeof maxTokens !== "number" ||
    !Number.isFinite(maxTokens) ||
    maxTokens <= 0
  )
    return {};
  return { max_tokens: maxTokens };
}

/**
 * Build the `service_tier` request field from the tooled options. Only providers
 * that pass `serviceTier` get the field, every other provider keeps sending no
 * `service_tier` at all.
 * @param {string} serviceTier
 * @param {((text: string) => void)|null} log - Optional provider logger.
 * @returns {{service_tier?: string}}
 */
function serviceTierParam(serviceTier, log = null) {
  if (typeof serviceTier !== "string" || !serviceTier.length) return {};
  if (typeof log === "function") log(`Requesting service tier: ${serviceTier}`);
  return { service_tier: serviceTier };
}

/**
 * Stream a chat completion using native OpenAI-compatible tool calling.
 * Tracks each streamed tool call by its index and returns ALL of them in
 * `functionCalls` (a model may request several tools in one turn), with
 * `functionCall` kept as the first call for provider/agent paths that
 * predate batching.
 *
 * @param {import("openai").OpenAI} client - OpenAI-compatible client
 * @param {string} model - Model identifier
 * @param {Array} messages - Raw aibitat message history
 * @param {Array} functions - Aibitat function definitions
 * @param {function|null} eventHandler - Stream event handler
 * @param {{injectReasoningContent?: boolean, provider?: object, maxTokens?: number, serviceTier?: string}} options - Provider-specific options
 *   - provider: If passed, automatically handles usage tracking via provider.resetUsage()/recordUsage()
 *   - maxTokens: If passed as a positive number, sent as `max_tokens` on the request
 *   - serviceTier: If passed, sent as `service_tier` on the request
 * @returns {Promise<{textResponse: string, functionCall: object|null, functionCalls: Array<object>, uuid: string, usage: object|null}>}
 */
async function tooledStream(
  client,
  model,
  messages,
  functions = [],
  eventHandler = null,
  options = {}
) {
  const { provider, maxTokens, serviceTier, ...formatOptions } = options;

  // Auto-reset usage if provider is passed
  if (provider?.resetUsage) {
    try {
      provider.resetUsage();
    } catch {}
  }

  const msgUUID = v4();
  const formattedMessages = formatMessagesForTools(messages, formatOptions);
  const tools = formatFunctionsToTools(functions);

  const stream = await client.chat.completions.create({
    model,
    stream: true,
    stream_options: { include_usage: true },
    messages: formattedMessages,
    ...maxTokensParam(maxTokens),
    ...serviceTierParam(serviceTier, provider?.providerLog?.bind(provider)),
    ...(tools.length > 0 ? { tools } : {}),
  });

  const result = {
    functionCall: null,
    textResponse: "",
  };

  const toolCallsByIndex = {};
  // Live file-write progress: per-slot timestamp of the last throttled
  // `toolCallProgress` event (see TOOL_PROGRESS_MS).
  const toolProgressMarks = {};
  let usage = null;
  let time_info = null;
  let timings = null;
  let reasoningText = "";

  for await (const chunk of stream) {
    // Capture usage from final chunk (some providers send usage after finish_reason)
    if (chunk?.usage) usage = chunk.usage;
    if (chunk?.time_info) time_info = chunk.time_info;
    // llama.cpp reports server timings (incl. prefix-cache hits) on the
    // final streamed chunk - forwarded to recordUsage below.
    if (chunk?.timings) timings = chunk.timings;

    if (!chunk?.choices?.[0]) continue;
    const choice = chunk.choices[0];

    const reasoningToken = extractReasoningContent(choice.delta);
    if (reasoningToken) {
      if (reasoningText.length === 0) {
        eventHandler?.("reportStreamEvent", {
          type: "textResponseChunk",
          uuid: msgUUID,
          content: `<think>${reasoningToken}`,
        });
      } else {
        eventHandler?.("reportStreamEvent", {
          type: "textResponseChunk",
          uuid: msgUUID,
          content: reasoningToken,
        });
      }
      reasoningText += reasoningToken;
    }

    if (choice.delta?.content) {
      if (reasoningText.length > 0 && !result.textResponse) {
        eventHandler?.("reportStreamEvent", {
          type: "textResponseChunk",
          uuid: msgUUID,
          content: "</think>",
        });
      }
      result.textResponse += choice.delta.content;
      eventHandler?.("reportStreamEvent", {
        type: "textResponseChunk",
        uuid: msgUUID,
        content: choice.delta.content,
      });
    }

    if (choice.delta?.tool_calls) {
      for (const toolCall of choice.delta.tool_calls) {
        const idx = toolCall.index ?? 0;

        // Initialize tool call entry if it doesn't exist yet.
        // Some providers (e.g. mlx-server) send id as null, so we generate one.
        if (!toolCallsByIndex[idx]) {
          toolCallsByIndex[idx] = {
            id: toolCall.id || `call_${v4()}`,
            name: toolCall.function?.name || "",
            arguments: toolCall.function?.arguments || "",
            ...(toolCall.extra_content
              ? { extra_content: toolCall.extra_content }
              : {}),
          };
        } else {
          // Update existing entry with streamed data
          if (toolCall.id && !toolCallsByIndex[idx].id.startsWith("call_")) {
            toolCallsByIndex[idx].id = toolCall.id;
          }
          if (toolCall.function?.name) {
            toolCallsByIndex[idx].name += toolCall.function.name;
          }
          if (toolCall.function?.arguments) {
            toolCallsByIndex[idx].arguments += toolCall.function.arguments;
          }
          if (toolCall.extra_content) {
            toolCallsByIndex[idx].extra_content = toolCall.extra_content;
          }
        }

        if (toolCallsByIndex[idx]) {
          eventHandler?.("reportStreamEvent", {
            uuid: `${msgUUID}:tool_call_invocation`,
            type: "toolCallInvocation",
            content: `Assembling Tool Call: ${toolCallsByIndex[idx].name}(${toolCallsByIndex[idx].arguments})`,
          });
          // Structured progress for file-write tools only: the chat renders
          // a pending file row that ticks up as args stream in, then the
          // completion's fileChangeCard replaces it. Plan proposals
          // (exit-plan-mode) ride the same channel with a "receiving plan"
          // row until the completion's planCard replaces it. Other tools
          // keep the existing (hidden) assembly notice - a progress row for
          // every `ls` would be noise.
          try {
            const entry = toolCallsByIndex[idx];
            const isPlanProposal = PLAN_PROGRESS_TOOLS.has(entry.name);
            if (
              entry.name &&
              (FILE_WRITE_TOOLS.has(entry.name) || isPlanProposal) &&
              typeof entry.arguments === "string"
            ) {
              const now = Date.now();
              const last = toolProgressMarks[idx] ?? -1;
              if (last < 0 || now - last >= TOOL_PROGRESS_MS) {
                toolProgressMarks[idx] = now;
                eventHandler?.("reportStreamEvent", {
                  uuid: `${msgUUID}:tool_call_progress:${idx}`,
                  type: "toolCallProgress",
                  name: entry.name,
                  argChars: entry.arguments.length,
                  linesGuess: guessLinesFromArgs(entry.arguments),
                  pathGuess: guessPathFromArgs(entry.arguments),
                });
              }
            }
          } catch {
            // Progress is best-effort UI - assembly continues regardless.
          }
        }
      }
    }
  }

  // Auto-record usage if provider is passed and usage is available
  if (provider?.recordUsage && usage) {
    try {
      provider.recordUsage(usage, time_info, timings);
    } catch {}
  }

  if (reasoningText.length > 0 && !result.textResponse) {
    eventHandler?.("reportStreamEvent", {
      type: "textResponseChunk",
      uuid: msgUUID,
      content: "</think>",
    });
  }

  // Index order = the order the model requested the calls in. Sorted
  // numerically because Object.keys() returns strings ("10" < "2" lexically).
  const toolCallIndices = Object.keys(toolCallsByIndex)
    .map(Number)
    .sort((a, b) => a - b);
  const functionCalls = toolCallIndices
    .map((idx) => {
      const call = toolCallsByIndex[idx];
      // Malformed streamed arguments used to coerce silently to `{}` and the
      // tool would execute with empty args - the model then debugged a
      // phantom failure. Flag it instead: the execution loop turns the flag
      // into a repair turn (see utils/toolArgRepair.js) and never executes.
      // Empty argument strings are normal for parameterless tools, not errors.
      let parsedArgs = {};
      let argsParseError;
      const rawArgs = call.arguments || "";
      if (rawArgs.trim()) {
        try {
          const parsed = JSON.parse(rawArgs);
          if (
            parsed !== null &&
            typeof parsed === "object" &&
            !Array.isArray(parsed)
          ) {
            parsedArgs = parsed;
          } else {
            argsParseError = rawArgs.slice(0, RAW_EXCERPT_CHARS);
          }
        } catch {
          argsParseError = rawArgs.slice(0, RAW_EXCERPT_CHARS);
        }
      }
      return {
        id: call.id,
        name: call.name,
        arguments: parsedArgs,
        ...(argsParseError !== undefined
          ? { [ARGS_PARSE_ERROR_KEY]: argsParseError }
          : {}),
        ...(call.extra_content ? { extra_content: call.extra_content } : {}),
      };
    })
    // A streaming glitch can leave a slot with an id but no name - executing
    // a nameless call would only confuse the model with a "not found" round.
    .filter((call) => !!call.name);

  result.functionCall = functionCalls[0] ?? null;
  result.functionCalls = functionCalls;

  let textResponse = result.textResponse;
  if (reasoningText.trim().length > 0) {
    // Wrapped on tool-call turns too: the execution loop discards
    // textResponse when tools ran, but the run-trace recorder extracts the
    // turn's reasoning from it - without the wrap, batched turns would lose
    // their thoughts on reload.
    textResponse = `<think>${reasoningText}</think>${textResponse}`;
  }

  return {
    textResponse,
    functionCall: result.functionCall,
    functionCalls: result.functionCalls,
    uuid: msgUUID,
    usage,
  };
}

/**
 * Non-streaming chat completion using native OpenAI-compatible tool calling.
 * Returns every tool call the model requested in `functionCalls` (with
 * `functionCall` kept as the first for pre-batching callers); when no tools
 * were requested, the text response is returned.
 *
 * @param {import("openai").OpenAI} client - OpenAI-compatible client
 * @param {string} model - Model identifier
 * @param {Array} messages - Raw aibitat message history
 * @param {Array} functions - Aibitat function definitions
 * @param {function} getCostFn - Provider's getCost function
 * @param {{injectReasoningContent?: boolean, provider?: object, maxTokens?: number}} options - Provider-specific options
 *   - provider: If passed, automatically handles usage tracking via provider.resetUsage()/recordUsage()
 *   - maxTokens: If passed as a positive number, sent as `max_tokens` on the request
 * @returns {Promise<{textResponse: string|null, functionCall: object|null, functionCalls: Array<object>, cost: number, usage: object|null}>}
 */
async function tooledComplete(
  client,
  model,
  messages,
  functions = [],
  getCostFn = () => 0,
  options = {}
) {
  const { provider, maxTokens, serviceTier, ...formatOptions } = options;

  // Auto-reset usage if provider is passed
  if (provider?.resetUsage) {
    try {
      provider.resetUsage();
    } catch {}
  }

  const formattedMessages = formatMessagesForTools(messages, formatOptions);
  const tools = formatFunctionsToTools(functions);

  const response = await client.chat.completions.create({
    model,
    stream: false,
    messages: formattedMessages,
    ...maxTokensParam(maxTokens),
    ...serviceTierParam(serviceTier, provider?.providerLog?.bind(provider)),
    ...(tools.length > 0 ? { tools } : {}),
  });

  const completion = response.choices[0].message;
  const cost = getCostFn(response.usage);
  const usage = response.usage || null;

  // Auto-record usage if provider is passed and usage is available
  if (provider?.recordUsage && usage) {
    try {
      provider.recordUsage(usage, null, response.timings ?? null);
    } catch {}
  }

  if (completion.tool_calls && completion.tool_calls.length > 0) {
    const functionCalls = [];
    for (const toolCall of completion.tool_calls) {
      const functionArgs = safeJsonParse(toolCall.function.arguments, null);

      if (functionArgs === null) {
        return {
          textResponse: null,
          retryWithError: {
            role: "function",
            name: toolCall.function.name,
            content: `Failed to parse tool call arguments as JSON. Raw arguments: ${toolCall.function.arguments}`,
            originalFunctionCall: {
              id: toolCall.id,
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
              ...(toolCall.extra_content
                ? { extra_content: toolCall.extra_content }
                : {}),
            },
          },
          cost,
          usage,
        };
      }

      functionCalls.push({
        id: toolCall.id,
        name: toolCall.function.name,
        arguments: functionArgs,
        ...(toolCall.extra_content
          ? { extra_content: toolCall.extra_content }
          : {}),
      });
    }

    return {
      textResponse: null,
      functionCall: functionCalls[0] ?? null,
      functionCalls,
      cost,
      usage,
    };
  }

  const reasoning = extractReasoningContent(completion);
  let textResponse = completion.content;
  if (reasoning && reasoning.trim().length > 0) {
    textResponse = `<think>${reasoning}</think>${textResponse}`;
  }

  return {
    textResponse,
    cost,
    usage,
  };
}

module.exports = {
  formatFunctionsToTools,
  formatMessagesForTools,
  tooledStream,
  tooledComplete,
  serviceTierParam,
};
