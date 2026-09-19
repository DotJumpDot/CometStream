const { reqBody } = require("../utils/http");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const { CustomLlmProviders } = require("../models/customLlmProviders");
const { assertSafeRemoteUrl } = require("../utils/ssrfGuard");
const { MODEL_MAP } = require("../utils/AiProviders/modelMap");
const { getAnythingLLMUserAgent } = require("./utils");

/**
 * Custom OpenAI-compatible LLM provider endpoints ("Manage models" UI).
 *
 * Reads of the provider list are available to every logged-in user (the chat
 * model picker renders them); creates/updates/deletes and model fetching are
 * admin-only. Model discovery fetches the provider's `/models` endpoint with
 * the SSRF guard applied first (http/https only; localhost, loopback,
 * private, and reserved hosts rejected before the request is sent).
 */

/** Fetch `${baseUrl}/models` from an OpenAI-compatible endpoint. */
async function fetchProviderModels(baseUrl, apiKey) {
  const url = await assertSafeRemoteUrl(
    `${String(baseUrl).replace(/\/+$/, "")}/models`
  );
  const result = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": getAnythingLLMUserAgent(),
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!result.ok)
    throw new Error(
      `The endpoint responded with status ${result.status}. Check the base URL and API key.`
    );

  const data = await result.json();
  const models = Array.isArray(data?.data) ? data.data : [];
  return models
    .map((model) => (typeof model?.id === "string" ? model.id : null))
    .filter(Boolean)
    .slice(0, 500);
}

function customLlmProvidersEndpoints(app) {
  if (!app) return;

  // Provider list for the model picker - any authenticated user, no API keys.
  app.get(
    "/custom-llm-providers",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (_request, response) => {
      try {
        return response.status(200).json({
          success: true,
          error: null,
          providers: await CustomLlmProviders.listSafe(),
        });
      } catch (error) {
        console.error("Error listing custom LLM providers:", error);
        return response
          .status(500)
          .json({ success: false, error: error.message, providers: [] });
      }
    }
  );

  // Context window for a provider/model pair - used by the chat context ring.
  // Custom providers read the stored model metadata; built-in providers use
  // the LiteLLM-backed model map (with the static legacy fallback).
  app.get(
    "/model-context-window",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (request, response) => {
      try {
        const provider = String(request.query.provider || "");
        const model = request.query.model ? String(request.query.model) : null;

        if (CustomLlmProviders.idFromProviderKey(provider) !== null) {
          const resolved = await CustomLlmProviders.resolveForChat(
            provider,
            model
          );
          if (!resolved)
            return response
              .status(200)
              .json({ success: true, error: null, contextWindow: null });
          return response.status(200).json({
            success: true,
            error: null,
            contextWindow: resolved.model.contextWindow,
          });
        }

        return response.status(200).json({
          success: true,
          error: null,
          contextWindow: MODEL_MAP.get(provider, model) ?? null,
        });
      } catch (error) {
        console.error("Error resolving model context window:", error);
        return response
          .status(500)
          .json({ success: false, error: error.message, contextWindow: null });
      }
    }
  );

  app.post(
    "/custom-llm-providers",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { name, baseUrl, apiKey } = reqBody(request);
        const provider = await CustomLlmProviders.create({
          name,
          baseUrl,
          apiKey,
        });
        return response.status(201).json({
          success: true,
          error: null,
          provider: { ...provider, apiKey: undefined },
        });
      } catch (error) {
        return response
          .status(400)
          .json({ success: false, error: error.message });
      }
    }
  );

  app.post(
    "/custom-llm-providers/:id",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { name, baseUrl, apiKey } = reqBody(request);
        const provider = await CustomLlmProviders.update(
          Number(request.params.id),
          {
            name,
            baseUrl,
            apiKey,
          }
        );
        return response.status(200).json({
          success: true,
          error: null,
          provider: { ...provider, apiKey: undefined },
        });
      } catch (error) {
        return response
          .status(400)
          .json({ success: false, error: error.message });
      }
    }
  );

  app.delete(
    "/custom-llm-providers/:id",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        await CustomLlmProviders.delete(Number(request.params.id));
        return response.status(200).json({ success: true, error: null });
      } catch (error) {
        return response
          .status(400)
          .json({ success: false, error: error.message });
      }
    }
  );

  // Discover models from the provider's OpenAI-compatible /models endpoint.
  app.post(
    "/custom-llm-providers/:id/fetch-models",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const provider = await CustomLlmProviders.get(
          Number(request.params.id)
        );
        if (!provider) throw new Error("Provider not found.");

        const { apiKey } = reqBody(request);
        const models = await fetchProviderModels(
          provider.baseUrl,
          apiKey || provider.apiKey
        );
        return response
          .status(200)
          .json({ success: true, error: null, models });
      } catch (error) {
        return response
          .status(400)
          .json({ success: false, error: error.message, models: [] });
      }
    }
  );

  app.post(
    "/custom-llm-providers/:id/models",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const descriptor = reqBody(request);
        const provider = await CustomLlmProviders.addModel(
          Number(request.params.id),
          descriptor
        );
        return response.status(201).json({
          success: true,
          error: null,
          provider: { ...provider, apiKey: undefined },
        });
      } catch (error) {
        return response
          .status(400)
          .json({ success: false, error: error.message });
      }
    }
  );

  app.post(
    "/custom-llm-providers/:id/models/:modelId",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const descriptor = reqBody(request);
        const provider = await CustomLlmProviders.updateModel(
          Number(request.params.id),
          request.params.modelId,
          descriptor
        );
        return response.status(200).json({
          success: true,
          error: null,
          provider: { ...provider, apiKey: undefined },
        });
      } catch (error) {
        return response
          .status(400)
          .json({ success: false, error: error.message });
      }
    }
  );

  app.delete(
    "/custom-llm-providers/:id/models/:modelId",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        await CustomLlmProviders.deleteModel(
          Number(request.params.id),
          request.params.modelId
        );
        return response.status(200).json({ success: true, error: null });
      } catch (error) {
        return response
          .status(400)
          .json({ success: false, error: error.message });
      }
    }
  );
}

module.exports = { customLlmProvidersEndpoints };
