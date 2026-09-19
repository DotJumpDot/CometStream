import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

/**
 * Frontend API model for CometStream custom LLM providers (Manage models UI).
 * Server endpoints live in server/endpoints/customLlmProviders.js.
 */
const CustomLlmProviders = {
  /**
   * List all custom providers with their models (any logged-in user; the
   * response never contains API keys).
   * @returns {Promise<{providers: Array, error: string|null}>}
   */
  list: async function () {
    const { providers, error } = await fetch(
      `${API_BASE}/custom-llm-providers`,
      { method: "GET", cache: "no-cache", headers: baseHeaders() }
    )
      .then((res) => res.json())
      .catch((e) => ({ providers: [], error: e.message }));
    return { providers: providers ?? [], error: error ?? null };
  },

  create: async function ({ name, baseUrl, apiKey }) {
    return fetch(`${API_BASE}/custom-llm-providers`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ name, baseUrl, apiKey: apiKey || null }),
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success)
          throw new Error(json.error || "Failed to create provider");
        return json.provider;
      })
      .catch((e) => {
        throw new Error(e.message);
      });
  },

  update: async function (id, { name, baseUrl, apiKey }) {
    return fetch(`${API_BASE}/custom-llm-providers/${id}`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({
        name,
        baseUrl,
        apiKey: apiKey === undefined ? null : apiKey,
      }),
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success)
          throw new Error(json.error || "Failed to update provider");
        return json.provider;
      })
      .catch((e) => {
        throw new Error(e.message);
      });
  },

  delete: async function (id) {
    return fetch(`${API_BASE}/custom-llm-providers/${id}`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success)
          throw new Error(json.error || "Failed to delete provider");
        return true;
      })
      .catch((e) => {
        throw new Error(e.message);
      });
  },

  /** Discover model ids from the provider's OpenAI-compatible /models endpoint. */
  fetchModels: async function (id) {
    return fetch(`${API_BASE}/custom-llm-providers/${id}/fetch-models`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({}),
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success)
          throw new Error(json.error || "Failed to fetch models");
        return json.models ?? [];
      })
      .catch((e) => {
        throw new Error(e.message);
      });
  },

  addModel: async function (id, descriptor) {
    return fetch(`${API_BASE}/custom-llm-providers/${id}/models`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(descriptor),
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success)
          throw new Error(json.error || "Failed to add model");
        return json.provider;
      })
      .catch((e) => {
        throw new Error(e.message);
      });
  },

  updateModel: async function (id, modelId, descriptor) {
    return fetch(
      `${API_BASE}/custom-llm-providers/${id}/models/${encodeURIComponent(modelId)}`,
      {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify(descriptor),
      }
    )
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success)
          throw new Error(json.error || "Failed to update model");
        return json.provider;
      })
      .catch((e) => {
        throw new Error(e.message);
      });
  },

  deleteModel: async function (id, modelId) {
    return fetch(
      `${API_BASE}/custom-llm-providers/${id}/models/${encodeURIComponent(modelId)}`,
      {
        method: "DELETE",
        headers: baseHeaders(),
      }
    )
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success)
          throw new Error(json.error || "Failed to remove model");
        return true;
      })
      .catch((e) => {
        throw new Error(e.message);
      });
  },

  /**
   * Context window (tokens) for a provider/model pair - custom provider
   * metadata first, then the LiteLLM-backed map for built-in providers.
   * @returns {Promise<number|null>}
   */
  contextWindow: async function (provider, model) {
    const params = new URLSearchParams({
      provider: provider ?? "",
      model: model ?? "",
    });
    const { contextWindow } = await fetch(
      `${API_BASE}/model-context-window?${params.toString()}`,
      { method: "GET", cache: "no-cache", headers: baseHeaders() }
    )
      .then((res) => res.json())
      .catch(() => ({ contextWindow: null }));
    return contextWindow ?? null;
  },
};

export default CustomLlmProviders;
