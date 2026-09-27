/**
 * Tests for CustomLlmProviders model-descriptor sanitizing (via addModel /
 * updateModel): sampling + transport knobs are optional and validated, and
 * omitting them keeps pre-existing rows byte-identical in behavior.
 */
jest.mock("../../utils/prisma", () => ({
  custom_llm_providers: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
}));

const prisma = require("../../utils/prisma");
const {
  CustomLlmProviders,
} = require("../../models/customLlmProviders");

beforeEach(() => {
  jest.clearAllMocks();
});

function rowWith(models) {
  return { id: 3, name: "p", baseUrl: "https://api.example.com/v1", modelsJson: JSON.stringify(models) };
}

describe("CustomLlmProviders.addModel sampling knobs", () => {
  it("stores valid temperature, topP and timeoutMs", async () => {
    prisma.custom_llm_providers.findUnique.mockResolvedValue(rowWith([]));
    let saved = null;
    prisma.custom_llm_providers.update.mockImplementation(async ({ data }) => {
      saved = JSON.parse(data.modelsJson);
      return {};
    });
    await CustomLlmProviders.addModel(3, {
      id: "m",
      contextWindow: 128000,
      temperature: 0.7,
      topP: 0.9,
      timeoutMs: 60000,
    });
    expect(saved[0]).toMatchObject({
      id: "m",
      temperature: 0.7,
      topP: 0.9,
      timeoutMs: 60000,
    });
  });

  it("drops out-of-range knobs instead of throwing", async () => {
    prisma.custom_llm_providers.findUnique.mockResolvedValue(rowWith([]));
    let saved = null;
    prisma.custom_llm_providers.update.mockImplementation(async ({ data }) => {
      saved = JSON.parse(data.modelsJson);
      return {};
    });
    await CustomLlmProviders.addModel(3, {
      id: "m",
      contextWindow: 128000,
      temperature: 9,
      topP: 0,
      timeoutMs: 50,
    });
    expect(saved[0]).not.toHaveProperty("temperature");
    expect(saved[0]).not.toHaveProperty("topP");
    expect(saved[0]).not.toHaveProperty("timeoutMs");
  });

  it("omits knobs entirely when absent (backward compatible)", async () => {
    prisma.custom_llm_providers.findUnique.mockResolvedValue(rowWith([]));
    let saved = null;
    prisma.custom_llm_providers.update.mockImplementation(async ({ data }) => {
      saved = JSON.parse(data.modelsJson);
      return {};
    });
    await CustomLlmProviders.addModel(3, { id: "m", contextWindow: 128000 });
    expect(saved[0]).not.toHaveProperty("temperature");
    expect(saved[0]).not.toHaveProperty("topP");
    expect(saved[0]).not.toHaveProperty("timeoutMs");
  });
});

describe("CustomLlmProviders.updateModel full edit", () => {
  it("keeps the model id and stores edited knobs", async () => {
    prisma.custom_llm_providers.findUnique.mockResolvedValue(
      rowWith([{ id: "m", contextWindow: 32000, capabilities: {}, reasoningLevels: [], enabled: true }])
    );
    let saved = null;
    prisma.custom_llm_providers.update.mockImplementation(async ({ data }) => {
      saved = JSON.parse(data.modelsJson);
      return {};
    });
    await CustomLlmProviders.updateModel(3, "m", {
      id: "renamed-attempt",
      displayName: "Nice",
      contextWindow: 64000,
      temperature: 0.2,
    });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      id: "m",
      displayName: "Nice",
      contextWindow: 64000,
      temperature: 0.2,
    });
  });

  it("still allows enabled-only partial updates", async () => {
    prisma.custom_llm_providers.findUnique.mockResolvedValue(
      rowWith([{ id: "m", contextWindow: 32000, temperature: 0.5, capabilities: {}, reasoningLevels: [], enabled: true }])
    );
    let saved = null;
    prisma.custom_llm_providers.update.mockImplementation(async ({ data }) => {
      saved = JSON.parse(data.modelsJson);
      return {};
    });
    await CustomLlmProviders.updateModel(3, "m", { enabled: false });
    expect(saved[0]).toMatchObject({ id: "m", enabled: false, temperature: 0.5 });
  });
});
