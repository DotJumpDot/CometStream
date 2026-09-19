const AIbitat = require("../../../utils/agents/aibitat");
const {
  CustomLlmProviders,
} = require("../../../models/customLlmProviders");

jest.mock("../../../models/customLlmProviders", () => ({
  CustomLlmProviders: {
    resolveForChat: jest.fn(),
  },
}));

describe("CustomOpenAiProvider (agent runtime)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("is built by AIbitat for custom:<id> provider keys", () => {
    const provider = new AIbitat({
      provider: "custom:2",
      model: "test-model",
    }).getProviderForConfig({ provider: "custom:2", model: "test-model" });
    expect(provider.constructor.name).toBe("CustomOpenAiProvider");
    expect(provider.providerSlug).toBe("custom:2");
  });

  it("bootstraps the client from the resolved provider row", async () => {
    CustomLlmProviders.resolveForChat.mockResolvedValue({
      provider: { baseUrl: "https://example.com/v1", apiKey: "sk-test" },
      model: {
        id: "test-model",
        maxTokens: 4096,
        capabilities: { tools: true },
      },
    });

    const provider = new AIbitat({
      provider: "custom:2",
      model: "test-model",
    }).getProviderForConfig({ provider: "custom:2", model: "test-model" });
    await provider.stream([{ role: "user", content: "hi" }]).catch(() => {});
    expect(CustomLlmProviders.resolveForChat).toHaveBeenCalledWith(
      "custom:2",
      "test-model"
    );
    expect(provider.client.baseURL).toBe("https://example.com/v1");
    expect(provider.model).toBe("test-model");
    expect(provider.maxTokens).toBe(4096);
  });

  it("falls back to the first enabled model when none is given", async () => {
    CustomLlmProviders.resolveForChat.mockResolvedValue({
      provider: { baseUrl: "https://example.com/v1", apiKey: null },
      model: {
        id: "first-model",
        maxTokens: null,
        capabilities: {},
      },
    });

    const provider = new AIbitat({
      provider: "custom:2",
      model: null,
    }).getProviderForConfig({ provider: "custom:2", model: null });
    await provider.stream([{ role: "user", content: "hi" }]).catch(() => {});
    expect(CustomLlmProviders.resolveForChat).toHaveBeenCalledWith(
      "custom:2",
      null
    );
    expect(provider.model).toBe("first-model");
    expect(provider.maxTokens).toBe(1024);
  });

  it("reports no native tool calling when the model metadata disables tools", async () => {
    CustomLlmProviders.resolveForChat.mockResolvedValue({
      provider: { baseUrl: "https://example.com/v1", apiKey: null },
      model: { id: "test-model", capabilities: { tools: false } },
    });

    const provider = new AIbitat({
      provider: "custom:2",
      model: "test-model",
    }).getProviderForConfig({ provider: "custom:2", model: "test-model" });
    await expect(provider.supportsNativeToolCalling()).resolves.toBe(false);
  });

  it("reports native tool calling when the model metadata enables tools", async () => {
    CustomLlmProviders.resolveForChat.mockResolvedValue({
      provider: { baseUrl: "https://example.com/v1", apiKey: null },
      model: { id: "test-model", capabilities: { tools: true } },
    });

    const provider = new AIbitat({
      provider: "custom:2",
      model: "test-model",
    }).getProviderForConfig({ provider: "custom:2", model: "test-model" });
    await expect(provider.supportsNativeToolCalling()).resolves.toBe(true);
  });

  it("throws a clear error when the provider row cannot be resolved", async () => {
    CustomLlmProviders.resolveForChat.mockResolvedValue(null);
    const provider = new AIbitat({
      provider: "custom:99",
      model: "test-model",
    }).getProviderForConfig({ provider: "custom:99", model: "test-model" });
    await expect(
      provider.supportsNativeToolCalling()
    ).rejects.toThrow(/custom:99/);
  });
});
