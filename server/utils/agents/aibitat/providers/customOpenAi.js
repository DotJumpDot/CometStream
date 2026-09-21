const OpenAI = require("openai");
const Provider = require("./ai-provider.js");
const InheritMultiple = require("./helpers/classes.js");
const UnTooled = require("./helpers/untooled.js");
const { tooledStream, tooledComplete } = require("./helpers/tooled.js");
const { fetchForBaseURL } = require("./helpers/localFetch.js");
const { RetryError } = require("../error.js");
const { getAnythingLLMUserAgent } = require("../../../../endpoints/utils");
const {
  CustomLlmProviders,
} = require("../../../../models/customLlmProviders.js");
const { attachmentToContentBlock } = require("../../../helpers/attachments");

/**
 * The agent provider for CometStream custom model providers
 * (OpenAI-compatible endpoints added via "Manage models", keyed "custom:<id>").
 *
 * Unlike built-in providers, connection details live in the
 * `custom_llm_providers` table instead of ENV, so the row is resolved lazily on
 * first use: AIbitat builds providers synchronously from `{provider, model}`
 * and cannot await a DB read at construction time. The lazy bootstrap also
 * re-attaches the session abort signal once the SDK client exists, since the
 * base attach ran before the client did.
 */
class CustomOpenAiProvider extends InheritMultiple([Provider, UnTooled]) {
  model;

  constructor(config = {}) {
    super();
    this.providerTag = "custom-openai";
    this.providerKey = String(config.provider ?? "");
    this.model = config.model ?? null;
    this.verbose = true;
    this._client = null;
    this._resolved = null;
  }

  /**
   * Resolve the provider row and model descriptor once, then build the client.
   * Falls back to the provider's first enabled model when none was given.
   */
  async #bootstrap() {
    if (this._resolved) return;
    const resolved = await CustomLlmProviders.resolveForChat(
      this.providerKey,
      this.model
    );
    if (!resolved)
      throw new Error(
        `Custom provider ${this.providerKey} not found or has no enabled models.`
      );
    this._resolved = resolved;
    this.model = resolved.model.id;
    this.maxTokens = toValidNumber(resolved.model.maxTokens, 1024);
    this._client = new OpenAI({
      baseURL: resolved.provider.baseUrl,
      apiKey: resolved.provider.apiKey ?? null,
      defaultHeaders: {
        "User-Agent": getAnythingLLMUserAgent(),
      },
      // Local inference servers close idle keep-alive sockets between agent
      // turns (ECONNRESET "socket hang up"); use fresh connections for them.
      fetch: fetchForBaseURL(resolved.provider.baseUrl),
    });
    // Re-bind the session abort signal now that the client exists (see class doc).
    this.attachAbortSignal(this.abortSignal);
  }

  get client() {
    return this._client;
  }

  abortableClients() {
    // The client only exists after the lazy bootstrap; binding before that is
    // a no-op handled by #bootstrap's re-attach.
    return this._client ? [this._client] : [];
  }

  /**
   * Custom-provider models carry their own capability metadata; honor the
   * tools flag unless the operator opted this provider tag out via ENV.
   * @returns {Promise<boolean>}
   */
  async supportsNativeToolCalling() {
    if (this.optsOutOfNativeToolCallingViaEnv(this.providerTag)) return false;
    await this.#bootstrap();
    return this._resolved.model.capabilities?.tools !== false;
  }

  /**
   * Custom OpenAI backends follow the OpenAI multimodal schema, so audio
   * attachments must be sent as `input_audio` blocks rather than `image_url`.
   * Mirrors the audio handling in the GenericOpenAi chat provider; images and
   * all other attachments keep the inherited `image_url` behavior.
   * @param {Object} message - The message to format
   * @returns {Object} - Message formatted for the API
   */
  formatMessageWithAttachments(message) {
    if (!message.attachments || message.attachments.length === 0)
      return message;

    const content = [{ type: "text", text: message.content }];
    for (const attachment of message.attachments) {
      content.push(attachmentToContentBlock(attachment));
    }

    const { attachments: _, ...rest } = message;
    return { ...rest, content };
  }

  get supportsAgentStreaming() {
    return true;
  }

  async #handleFunctionCallChat({ messages = [] }) {
    return await this.client.chat.completions
      .create({
        model: this.model,
        temperature: 0,
        messages,
        max_tokens: this.maxTokens,
      })
      .then((result) => {
        if (!result.hasOwnProperty("choices"))
          throw new Error("Custom provider chat: No results!");
        if (result.choices.length === 0)
          throw new Error("Custom provider chat: No results length!");
        return result.choices[0].message.content;
      })
      .catch((_) => {
        return null;
      });
  }

  async #handleFunctionCallStream({ messages = [] }) {
    return await this.client.chat.completions.create({
      model: this.model,
      stream: true,
      messages,
      max_tokens: this.maxTokens,
    });
  }

  /**
   * Stream a chat completion with tool calling support.
   * Uses native tool calling when supported, otherwise falls back to UnTooled.
   */
  async stream(messages, functions = [], eventHandler = null) {
    await this.#bootstrap();
    const useNative = await this.supportsNativeToolCalling();

    if (!useNative) {
      return await UnTooled.prototype.stream.call(
        this,
        messages,
        functions,
        this.#handleFunctionCallStream.bind(this),
        eventHandler
      );
    }

    this.providerLog(
      "Provider.stream (tooled) - will process this chat completion."
    );

    try {
      return await tooledStream(
        this.client,
        this.model,
        messages,
        functions,
        eventHandler,
        { provider: this, maxTokens: this.maxTokens }
      );
    } catch (error) {
      console.error(error.message, error);
      if (error instanceof OpenAI.AuthenticationError) throw error;
      if (
        error instanceof OpenAI.RateLimitError ||
        error instanceof OpenAI.InternalServerError ||
        error instanceof OpenAI.APIError
      ) {
        throw new RetryError(error.message);
      }
      throw error;
    }
  }

  /**
   * Create a non-streaming completion with tool calling support.
   * Uses native tool calling when supported, otherwise falls back to UnTooled.
   */
  async complete(messages, functions = []) {
    await this.#bootstrap();
    const useNative = await this.supportsNativeToolCalling();

    if (!useNative) {
      return await UnTooled.prototype.complete.call(
        this,
        messages,
        functions,
        this.#handleFunctionCallChat.bind(this)
      );
    }

    try {
      const result = await tooledComplete(
        this.client,
        this.model,
        messages,
        functions,
        this.getCost.bind(this),
        { provider: this, maxTokens: this.maxTokens }
      );

      if (result.retryWithError) {
        return this.complete([...messages, result.retryWithError], functions);
      }

      return result;
    } catch (error) {
      if (error instanceof OpenAI.AuthenticationError) throw error;
      if (
        error instanceof OpenAI.RateLimitError ||
        error instanceof OpenAI.InternalServerError ||
        error instanceof OpenAI.APIError
      ) {
        throw new RetryError(error.message);
      }
      throw error;
    }
  }

  /**
   * Get the cost of the completion.
   *
   * @param _usage The completion to get the cost for.
   * @returns The cost of the completion.
   */
  getCost(_usage) {
    return 0;
  }
}

function toValidNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

module.exports = CustomOpenAiProvider;
