const prisma = require("../utils/prisma");

/**
 * User-defined OpenAI-compatible LLM providers ("Manage models" UI).
 *
 * Each row is an endpoint (base URL + optional API key) plus a list of model
 * descriptors. A provider is addressed in workspaces by the key
 * `custom:<id>` (stable across renames) and behaves like the built-in
 * generic-openai provider, but configured per row instead of via ENV.
 */

/** Provider key prefix used in workspace `chatProvider` values. */
const PROVIDER_KEY_PREFIX = "custom:";

/**
 * @typedef {Object} CustomModelDescriptor
 * @property {string} id - Model id sent to the API (`model` field).
 * @property {string} [displayName] - Optional friendlier name for the UI.
 * @property {number} contextWindow - Context window in tokens.
 * @property {number} [maxTokens] - Max output tokens (default 1024).
 * @property {{vision?: boolean, tools?: boolean, imageGeneration?: boolean}} [capabilities]
 * @property {string[]} [reasoningLevels] - Selectable effort levels; empty array = simple on/off.
 * @property {boolean} [enabled] - Disabled models stay configured but hidden from the picker.
 * @property {number} [temperature] - Sampling temperature 0-2. Omitted = backend default.
 * @property {number} [topP] - Nucleus sampling 0-1. Omitted = backend default.
 * @property {number} [timeoutMs] - Per-request timeout in ms (1000-600000). Omitted = SDK default.
 */

const MAX_NAME_LENGTH = 60;
const MAX_URL_LENGTH = 500;
const MAX_API_KEY_LENGTH = 500;
const MAX_MODELS = 100;
const MAX_LEVEL_NAME_LENGTH = 24;

function isValidHttpUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validate + normalize one model descriptor from user input.
 * @param {any} raw
 * @returns {CustomModelDescriptor}
 */
function sanitizeModelDescriptor(raw = {}) {
  const id = typeof raw.id === "string" ? raw.id.trim().slice(0, 200) : "";
  if (!id) throw new Error("Model id is required.");

  const contextWindow = Number(raw.contextWindow);
  if (
    !Number.isFinite(contextWindow) ||
    contextWindow < 512 ||
    contextWindow > 100_000_000
  )
    throw new Error(
      "Context window must be a number between 512 and 100000000."
    );

  const maxTokensRaw = Number(raw.maxTokens);
  const maxTokens =
    Number.isFinite(maxTokensRaw) && maxTokensRaw > 0
      ? Math.min(Math.floor(maxTokensRaw), 1_000_000)
      : undefined;

  const displayName =
    typeof raw.displayName === "string" && raw.displayName.trim()
      ? raw.displayName.trim().slice(0, 120)
      : undefined;

  const rawCaps =
    raw.capabilities && typeof raw.capabilities === "object"
      ? raw.capabilities
      : {};
  const capabilities = {
    vision: rawCaps.vision === true,
    tools: rawCaps.tools !== false, // opt-out, like built-in providers
    imageGeneration: rawCaps.imageGeneration === true,
  };

  const reasoningLevels = Array.isArray(raw.reasoningLevels)
    ? raw.reasoningLevels
        .filter((level) => typeof level === "string" && level.trim())
        .map((level) => level.trim().slice(0, MAX_LEVEL_NAME_LENGTH))
        .slice(0, 10)
    : [];

  // Sampling + transport knobs are optional: omitted means "backend default",
  // so pre-existing rows behave exactly as before.
  const temperatureRaw = Number(raw.temperature);
  const temperature =
    Number.isFinite(temperatureRaw) &&
    temperatureRaw >= 0 &&
    temperatureRaw <= 2
      ? temperatureRaw
      : undefined;

  const topPRaw = Number(raw.topP);
  const topP =
    Number.isFinite(topPRaw) && topPRaw > 0 && topPRaw <= 1
      ? topPRaw
      : undefined;

  const timeoutRaw = Number(raw.timeoutMs);
  const timeoutMs =
    Number.isFinite(timeoutRaw) && timeoutRaw >= 1000
      ? Math.min(Math.floor(timeoutRaw), 600_000)
      : undefined;

  return {
    id,
    ...(displayName ? { displayName } : {}),
    contextWindow: Math.floor(contextWindow),
    ...(maxTokens ? { maxTokens } : {}),
    capabilities,
    reasoningLevels,
    ...(temperature !== undefined ? { temperature } : {}),
    ...(topP !== undefined ? { topP } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    enabled: raw.enabled !== false,
  };
}

function parseModelsJson(modelsJson) {
  try {
    const parsed = JSON.parse(modelsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const CustomLlmProviders = {
  PROVIDER_KEY_PREFIX,

  /**
   * Build the provider key for a row id.
   * @param {number} id
   */
  providerKey(id) {
    return `${PROVIDER_KEY_PREFIX}${id}`;
  },

  /** @param {string} key @returns {number|null} row id */
  idFromProviderKey(key) {
    if (typeof key !== "string" || !key.startsWith(PROVIDER_KEY_PREFIX))
      return null;
    const id = Number(key.slice(PROVIDER_KEY_PREFIX.length));
    return Number.isInteger(id) && id > 0 ? id : null;
  },

  /**
   * All providers with their models, safe for any authenticated user:
   * no API keys are included.
   */
  async listSafe() {
    const rows = await prisma.custom_llm_providers.findMany({
      orderBy: { id: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      providerKey: this.providerKey(row.id),
      baseUrl: row.baseUrl,
      hasApiKey: !!row.apiKey,
      models: parseModelsJson(row.modelsJson),
      createdAt: row.createdAt,
    }));
  },

  async get(id) {
    return prisma.custom_llm_providers.findUnique({
      where: { id: Number(id) },
    });
  },

  async getByName(name) {
    return prisma.custom_llm_providers.findUnique({
      where: { name: String(name) },
    });
  },

  /**
   * Create a provider.
   * @param {{name: string, baseUrl: string, apiKey?: string|null}} input
   */
  async create({ name, baseUrl, apiKey = null }) {
    const cleanName =
      typeof name === "string" ? name.trim().slice(0, MAX_NAME_LENGTH) : "";
    if (!cleanName) throw new Error("Provider name is required.");
    if (!isValidHttpUrl(baseUrl))
      throw new Error("Base URL must be a valid http(s) URL.");
    if (await this.getByName(cleanName))
      throw new Error(`A provider named "${cleanName}" already exists.`);

    return prisma.custom_llm_providers.create({
      data: {
        name: cleanName,
        baseUrl: String(baseUrl).trim().slice(0, MAX_URL_LENGTH),
        ...(apiKey
          ? { apiKey: String(apiKey).slice(0, MAX_API_KEY_LENGTH) }
          : {}),
      },
    });
  },

  /**
   * Update provider connection details. `apiKey: null` keeps the existing key
   * (the UI sends null unless the user typed a new one); empty string clears it.
   * @param {number} id
   * @param {{name?: string, baseUrl?: string, apiKey?: string|null}} updates
   */
  async update(id, { name, baseUrl, apiKey } = {}) {
    const existing = await this.get(id);
    if (!existing) throw new Error("Provider not found.");

    const data = {};
    if (name !== undefined) {
      const cleanName =
        typeof name === "string" ? name.trim().slice(0, MAX_NAME_LENGTH) : "";
      if (!cleanName) throw new Error("Provider name is required.");
      const clash = await this.getByName(cleanName);
      if (clash && clash.id !== existing.id)
        throw new Error(`A provider named "${cleanName}" already exists.`);
      data.name = cleanName;
    }
    if (baseUrl !== undefined) {
      if (!isValidHttpUrl(baseUrl))
        throw new Error("Base URL must be a valid http(s) URL.");
      data.baseUrl = String(baseUrl).trim().slice(0, MAX_URL_LENGTH);
    }
    if (apiKey !== undefined && apiKey !== null) {
      data.apiKey =
        String(apiKey) === ""
          ? null
          : String(apiKey).slice(0, MAX_API_KEY_LENGTH);
    }

    return prisma.custom_llm_providers.update({
      where: { id: existing.id },
      data,
    });
  },

  async delete(id) {
    const existing = await this.get(id);
    if (!existing) throw new Error("Provider not found.");
    await prisma.custom_llm_providers.delete({ where: { id: existing.id } });
    return true;
  },

  /**
   * Add a model to a provider.
   * @param {number} id
   * @param {any} descriptor - Raw model descriptor (sanitized here).
   */
  async addModel(id, descriptor) {
    const existing = await this.get(id);
    if (!existing) throw new Error("Provider not found.");
    const models = parseModelsJson(existing.modelsJson);
    if (models.length >= MAX_MODELS)
      throw new Error("Model limit reached for this provider.");
    if (models.some((model) => model.id === String(descriptor?.id)))
      throw new Error("That model id is already added to this provider.");

    const sanitized = sanitizeModelDescriptor(descriptor);
    models.push(sanitized);
    return prisma.custom_llm_providers.update({
      where: { id: existing.id },
      data: { modelsJson: JSON.stringify(models) },
    });
  },

  /**
   * Update a model's descriptor (e.g. toggle enabled, edit metadata).
   * @param {number} id
   * @param {string} modelId
   * @param {any} descriptor
   */
  async updateModel(id, modelId, descriptor) {
    const existing = await this.get(id);
    if (!existing) throw new Error("Provider not found.");
    const models = parseModelsJson(existing.modelsJson);
    const index = models.findIndex((model) => model.id === String(modelId));
    if (index === -1) throw new Error("Model not found on this provider.");

    // Partial updates are allowed for `enabled` alone.
    if (
      descriptor &&
      Object.keys(descriptor).length === 1 &&
      "enabled" in descriptor
    ) {
      models[index] = {
        ...models[index],
        enabled: descriptor.enabled !== false,
      };
    } else {
      // Keep the same id even if the payload differs (rename via displayName).
      const sanitized = sanitizeModelDescriptor({
        ...descriptor,
        id: models[index].id,
      });
      models[index] = sanitized;
    }
    return prisma.custom_llm_providers.update({
      where: { id: existing.id },
      data: { modelsJson: JSON.stringify(models) },
    });
  },

  /**
   * Remove a model from a provider.
   * @param {number} id
   * @param {string} modelId
   */
  async deleteModel(id, modelId) {
    const existing = await this.get(id);
    if (!existing) throw new Error("Provider not found.");
    const models = parseModelsJson(existing.modelsJson).filter(
      (model) => model.id !== String(modelId)
    );
    return prisma.custom_llm_providers.update({
      where: { id: existing.id },
      data: { modelsJson: JSON.stringify(models) },
    });
  },

  /**
   * Resolve the active model descriptor for a provider key + model id.
   * @param {string} providerKey - e.g. "custom:3"
   * @param {string|null} model - Model id, or null to use the first enabled model.
   * @returns {Promise<{provider: object, model: CustomModelDescriptor}|null>}
   */
  async resolveForChat(providerKey, model = null) {
    const id = this.idFromProviderKey(providerKey);
    if (id === null) return null;
    const provider = await this.get(id);
    if (!provider) return null;

    const models = parseModelsJson(provider.modelsJson);
    const enabled = models.filter((model) => model.enabled !== false);
    const active =
      enabled.find((entry) => entry.id === model) ?? enabled[0] ?? null;
    if (!active) return null;
    return { provider, model: active };
  },
};

module.exports = { CustomLlmProviders };
