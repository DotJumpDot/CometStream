import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Sidebar from "@/components/SettingsSidebar";
import { isMobile } from "react-device-detect";
import System from "@/models/system";
import showToast from "@/utils/toast";
import CometStreamIcon from "@/media/logo/cometstream.svg";
import OpenAiLogo from "@/media/llmprovider/openai.png";
import GenericOpenAiLogo from "@/media/llmprovider/generic-openai.png";
import AzureOpenAiLogo from "@/media/llmprovider/azure.png";
import AnthropicLogo from "@/media/llmprovider/anthropic.png";
import GeminiLogo from "@/media/llmprovider/gemini.png";
import OllamaLogo from "@/media/llmprovider/ollama.png";
import NovitaLogo from "@/media/llmprovider/novita.png";
import LMStudioLogo from "@/media/llmprovider/lmstudio.png";
import LocalAiLogo from "@/media/llmprovider/localai.png";
import TogetherAILogo from "@/media/llmprovider/togetherai.png";
import FireworksAILogo from "@/media/llmprovider/fireworksai.jpeg";
import MistralLogo from "@/media/llmprovider/mistral.jpeg";
import PerplexityLogo from "@/media/llmprovider/perplexity.png";
import OpenRouterLogo from "@/media/llmprovider/openrouter.jpeg";
import GroqLogo from "@/media/llmprovider/groq.png";
import KoboldCPPLogo from "@/media/llmprovider/koboldcpp.png";
import TextGenWebUILogo from "@/media/llmprovider/text-generation-webui.png";
import CohereLogo from "@/media/llmprovider/cohere.png";
import LiteLLMLogo from "@/media/llmprovider/litellm.png";
import AWSBedrockLogo from "@/media/llmprovider/bedrock.png";
import VertexLogo from "@/media/llmprovider/vertex.png";
import DeepSeekLogo from "@/media/llmprovider/deepseek.png";
import APIPieLogo from "@/media/llmprovider/apipie.png";
import XAILogo from "@/media/llmprovider/xai.png";
import ZAiLogo from "@/media/llmprovider/zai.png";
import NvidiaNimLogo from "@/media/llmprovider/nvidia-nim.png";
import PPIOLogo from "@/media/llmprovider/ppio.png";
import MoonshotAiLogo from "@/media/llmprovider/moonshotai.png";
import CometApiLogo from "@/media/llmprovider/cometapi.png";
import FoundryLogo from "@/media/llmprovider/foundry-local.png";
import GiteeAILogo from "@/media/llmprovider/giteeai.png";
import LlmmanLogo from "@/media/llmprovider/llmman.png";
import PrivateModeLogo from "@/media/llmprovider/privatemode.png";
import SambaNovaLogo from "@/media/llmprovider/sambanova.png";
import LemonadeLogo from "@/media/llmprovider/lemonade.png";
import MinimaxLogo from "@/media/llmprovider/minimax.png";
import CerebrasLogo from "@/media/llmprovider/cerebras.png";
import OMLXLogo from "@/media/llmprovider/omlx.png";

import PreLoader from "@/components/Preloader";
import ModelRouterOptions from "@/components/LLMSelection/ModelRouterOptions";
import OpenAiOptions from "@/components/LLMSelection/OpenAiOptions";
import GenericOpenAiOptions from "@/components/LLMSelection/GenericOpenAiOptions";
import AzureAiOptions from "@/components/LLMSelection/AzureAiOptions";
import AnthropicAiOptions from "@/components/LLMSelection/AnthropicAiOptions";
import LMStudioOptions from "@/components/LLMSelection/LMStudioOptions";
import LocalAiOptions from "@/components/LLMSelection/LocalAiOptions";
import GeminiLLMOptions from "@/components/LLMSelection/GeminiLLMOptions";
import OllamaLLMOptions from "@/components/LLMSelection/OllamaLLMOptions";
import NovitaLLMOptions from "@/components/LLMSelection/NovitaLLMOptions";
import CometApiLLMOptions from "@/components/LLMSelection/CometApiLLMOptions";
import TogetherAiOptions from "@/components/LLMSelection/TogetherAiOptions";
import FireworksAiOptions from "@/components/LLMSelection/FireworksAiOptions";
import MistralOptions from "@/components/LLMSelection/MistralOptions";
import PerplexityOptions from "@/components/LLMSelection/PerplexityOptions";
import OpenRouterOptions from "@/components/LLMSelection/OpenRouterOptions";
import GroqAiOptions from "@/components/LLMSelection/GroqAiOptions";
import CohereAiOptions from "@/components/LLMSelection/CohereAiOptions";
import KoboldCPPOptions from "@/components/LLMSelection/KoboldCPPOptions";
import TextGenWebUIOptions from "@/components/LLMSelection/TextGenWebUIOptions";
import LiteLLMOptions from "@/components/LLMSelection/LiteLLMOptions";
import AWSBedrockLLMOptions from "@/components/LLMSelection/AwsBedrockLLMOptions";
import VertexLLMOptions from "@/components/LLMSelection/VertexLLMOptions";
import DeepSeekOptions from "@/components/LLMSelection/DeepSeekOptions";
import ApiPieLLMOptions from "@/components/LLMSelection/ApiPieOptions";
import XAILLMOptions from "@/components/LLMSelection/XAiLLMOptions";
import ZAiLLMOptions from "@/components/LLMSelection/ZAiLLMOptions";
import NvidiaNimOptions from "@/components/LLMSelection/NvidiaNimOptions";
import PPIOLLMOptions from "@/components/LLMSelection/PPIOLLMOptions";
import MoonshotAiOptions from "@/components/LLMSelection/MoonshotAiOptions";
import FoundryOptions from "@/components/LLMSelection/FoundryOptions";
import GiteeAIOptions from "@/components/LLMSelection/GiteeAIOptions/index.jsx";
import LlmmanOptions from "@/components/LLMSelection/LlmmanOptions";
import PrivateModeOptions from "@/components/LLMSelection/PrivateModeOptions";
import SambaNovaOptions from "@/components/LLMSelection/SambaNovaOptions";
import LemonadeOptions from "@/components/LLMSelection/LemonadeOptions";
import MinimaxOptions from "@/components/LLMSelection/MinimaxOptions";
import CerebrasLLMOptions from "@/components/LLMSelection/CerebrasLLMOptions";

import { MagnifyingGlass, X } from "@phosphor-icons/react";
import CTAButton from "@/components/lib/CTAButton";
import OMLXOptions from "@/components/LLMSelection/OMLXOptions";
import { hasMissingCredentials } from "@/components/WorkspaceChat/ChatContainer/PromptInput/LLMSelector/utils";
import { parseHiddenBuiltinModels } from "@/components/WorkspaceChat/ChatContainer/PromptInput/LLMSelector/utils";

export const MODEL_ROUTER_PROVIDER = {
  name: "Model Router",
  value: "anythingllm-router",
  logo: CometStreamIcon,
  options: (settings) => <ModelRouterOptions settings={settings} />,
  description:
    "Route messages to different LLM providers based on rules you define.",
  requiredConfig: [],
};

/**
 * All LLM providers that are available to the user.
 * This **never** includes the model router provider.
 */
export const AVAILABLE_LLM_PROVIDERS = [
  {
    name: "OpenAI",
    value: "openai",
    logo: OpenAiLogo,
    options: (settings) => <OpenAiOptions settings={settings} />,
    description: "The standard option for most non-commercial use.",
    requiredConfig: ["OpenAiKey"],
  },
  {
    name: "Azure OpenAI",
    value: "azure",
    logo: AzureOpenAiLogo,
    options: (settings) => <AzureAiOptions settings={settings} />,
    description: "The enterprise option of OpenAI hosted on Azure services.",
    requiredConfig: ["AzureOpenAiEndpoint"],
  },
  {
    name: "Anthropic",
    value: "anthropic",
    logo: AnthropicLogo,
    options: (settings) => <AnthropicAiOptions settings={settings} />,
    description: "A friendly AI Assistant hosted by Anthropic.",
    requiredConfig: ["AnthropicApiKey"],
  },
  {
    name: "Gemini",
    value: "gemini",
    logo: GeminiLogo,
    options: (settings) => <GeminiLLMOptions settings={settings} />,
    description: "Google's largest and most capable AI model",
    requiredConfig: ["GeminiLLMApiKey"],
  },
  {
    name: "NVIDIA NIM",
    value: "nvidia-nim",
    logo: NvidiaNimLogo,
    options: (settings) => <NvidiaNimOptions settings={settings} />,
    description:
      "Run full parameter LLMs directly on your NVIDIA RTX GPU using NVIDIA NIM.",
    requiredConfig: ["NvidiaNimLLMBasePath"],
  },
  {
    name: "Ollama",
    value: "ollama",
    logo: OllamaLogo,
    options: (settings) => <OllamaLLMOptions settings={settings} />,
    description: "Run LLMs locally on your own machine.",
    requiredConfig: ["OllamaLLMBasePath"],
  },
  {
    name: "LM Studio",
    value: "lmstudio",
    logo: LMStudioLogo,
    options: (settings) => <LMStudioOptions settings={settings} />,
    description:
      "Discover, download, and run thousands of cutting edge LLMs in a few clicks.",
    requiredConfig: ["LMStudioBasePath"],
  },
  {
    name: "llmman",
    value: "llmman",
    logo: LlmmanLogo,
    options: (settings) => <LlmmanOptions settings={settings} />,
    description: "Run LLMs locally using llmman.",
    requiredConfig: ["LlmmanBasePath", "LlmmanModelPref", "LlmmanTokenLimit"],
  },
  {
    name: "Lemonade",
    value: "lemonade",
    logo: LemonadeLogo,
    options: (settings) => <LemonadeOptions settings={settings} />,
    description:
      "Run local LLMs, ASR, TTS, and more in a single unified AI runtime.",
    requiredConfig: ["LemonadeLLMBasePath"],
  },
  {
    name: "SambaNova",
    value: "sambanova",
    logo: SambaNovaLogo,
    options: (settings) => <SambaNovaOptions settings={settings} />,
    description: "Run open source models from SambaNova.",
    requiredConfig: ["SambaNovaLLMApiKey"],
  },
  {
    name: "Local AI",
    value: "localai",
    logo: LocalAiLogo,
    options: (settings) => <LocalAiOptions settings={settings} />,
    description: "Run LLMs locally on your own machine.",
    requiredConfig: ["LocalAiApiKey", "LocalAiBasePath"],
  },
  {
    name: "Together AI",
    value: "togetherai",
    logo: TogetherAILogo,
    options: (settings) => <TogetherAiOptions settings={settings} />,
    description: "Run open source models from Together AI.",
    requiredConfig: ["TogetherAiApiKey"],
  },

  {
    name: "Fireworks AI",
    value: "fireworksai",
    logo: FireworksAILogo,
    options: (settings) => <FireworksAiOptions settings={settings} />,
    description:
      "The fastest and most efficient inference engine to build production-ready, compound AI systems.",
    requiredConfig: ["FireworksAiLLMApiKey"],
  },
  {
    name: "Mistral",
    value: "mistral",
    logo: MistralLogo,
    options: (settings) => <MistralOptions settings={settings} />,
    description: "Run open source models from Mistral AI.",
    requiredConfig: ["MistralApiKey"],
  },
  {
    name: "Perplexity AI",
    value: "perplexity",
    logo: PerplexityLogo,
    options: (settings) => <PerplexityOptions settings={settings} />,
    description:
      "Run powerful and internet-connected models hosted by Perplexity AI.",
    requiredConfig: ["PerplexityApiKey"],
  },
  {
    name: "OpenRouter",
    value: "openrouter",
    logo: OpenRouterLogo,
    options: (settings) => <OpenRouterOptions settings={settings} />,
    description: "A unified interface for LLMs.",
    requiredConfig: ["OpenRouterApiKey"],
  },
  {
    name: "Groq",
    value: "groq",
    logo: GroqLogo,
    options: (settings) => <GroqAiOptions settings={settings} />,
    description:
      "The fastest LLM inferencing available for real-time AI applications.",
    requiredConfig: ["GroqApiKey"],
  },
  {
    name: "KoboldCPP",
    value: "koboldcpp",
    logo: KoboldCPPLogo,
    options: (settings) => <KoboldCPPOptions settings={settings} />,
    description: "Run local LLMs using koboldcpp.",
    requiredConfig: ["KoboldCPPBasePath"],
  },
  {
    name: "Oobabooga Web UI",
    value: "textgenwebui",
    logo: TextGenWebUILogo,
    options: (settings) => <TextGenWebUIOptions settings={settings} />,
    description: "Run local LLMs using Oobabooga's Text Generation Web UI.",
    requiredConfig: ["TextGenWebUIBasePath", "TextGenWebUITokenLimit"],
  },
  {
    name: "Cohere",
    value: "cohere",
    logo: CohereLogo,
    options: (settings) => <CohereAiOptions settings={settings} />,
    description: "Run Cohere's powerful Command models.",
    requiredConfig: ["CohereApiKey"],
  },
  {
    name: "LiteLLM",
    value: "litellm",
    logo: LiteLLMLogo,
    options: (settings) => <LiteLLMOptions settings={settings} />,
    description: "Run LiteLLM's OpenAI compatible proxy for various LLMs.",
    requiredConfig: ["LiteLLMBasePath"],
  },
  {
    name: "DeepSeek",
    value: "deepseek",
    logo: DeepSeekLogo,
    options: (settings) => <DeepSeekOptions settings={settings} />,
    description: "Run DeepSeek's powerful LLMs.",
    requiredConfig: ["DeepSeekApiKey"],
  },
  {
    name: "PPIO",
    value: "ppio",
    logo: PPIOLogo,
    options: (settings) => <PPIOLLMOptions settings={settings} />,
    description:
      "Run stable and cost-efficient open-source LLM APIs, such as DeepSeek, Llama, Qwen etc.",
    requiredConfig: ["PPIOApiKey"],
  },
  {
    name: "AWS Bedrock",
    value: "bedrock",
    logo: AWSBedrockLogo,
    options: (settings) => <AWSBedrockLLMOptions settings={settings} />,
    description: "Run powerful foundation models privately with AWS Bedrock.",
    requiredConfig: [
      "AwsBedrockLLMApiKey",
      "AwsBedrockLLMRegion",
      "AwsBedrockLLMModel",
    ],
  },
  {
    name: "Google Vertex AI",
    value: "vertex",
    logo: VertexLogo,
    options: (settings) => <VertexLLMOptions settings={settings} />,
    description: "Run Gemini models through your Google Cloud project.",
    requiredConfig: [
      "VertexAiLLMApiKey",
      "VertexAiLLMProjectId",
      "VertexAiLLMRegion",
      "VertexAiLLMModelPref",
    ],
  },
  {
    name: "APIpie",
    value: "apipie",
    logo: APIPieLogo,
    options: (settings) => <ApiPieLLMOptions settings={settings} />,
    description: "A unified API of AI services from leading providers",
    requiredConfig: ["ApipieLLMApiKey", "ApipieLLMModelPref"],
  },
  {
    name: "Moonshot AI",
    value: "moonshotai",
    logo: MoonshotAiLogo,
    options: (settings) => <MoonshotAiOptions settings={settings} />,
    description: "Run Moonshot AI's powerful LLMs.",
    requiredConfig: ["MoonshotAiApiKey"],
  },
  {
    name: "Privatemode",
    value: "privatemode",
    logo: PrivateModeLogo,
    options: (settings) => <PrivateModeOptions settings={settings} />,
    description: "Run LLMs with end-to-end encryption.",
    requiredConfig: ["PrivateModeBasePath"],
  },
  {
    name: "Novita AI",
    value: "novita",
    logo: NovitaLogo,
    options: (settings) => <NovitaLLMOptions settings={settings} />,
    description:
      "Reliable, Scalable, and Cost-Effective for LLMs from Novita AI",
    requiredConfig: ["NovitaLLMApiKey"],
  },
  {
    name: "CometAPI",
    value: "cometapi",
    logo: CometApiLogo,
    options: (settings) => <CometApiLLMOptions settings={settings} />,
    description: "500+ AI Models all in one API.",
    requiredConfig: ["CometApiLLMApiKey"],
  },
  {
    name: "Microsoft Foundry Local",
    value: "foundry",
    logo: FoundryLogo,
    options: (settings) => <FoundryOptions settings={settings} />,
    description: "Run Microsoft's Foundry models locally.",
    requiredConfig: [
      "FoundryBasePath",
      "FoundryModelPref",
      "FoundryModelTokenLimit",
    ],
  },
  {
    name: "xAI",
    value: "xai",
    logo: XAILogo,
    options: (settings) => <XAILLMOptions settings={settings} />,
    description: "Run xAI's powerful LLMs like Grok-2 and more.",
    requiredConfig: ["XAIApiKey", "XAIModelPref"],
  },
  {
    name: "Z.AI",
    value: "zai",
    logo: ZAiLogo,
    options: (settings) => <ZAiLLMOptions settings={settings} />,
    description: "Run Z.AI's powerful GLM models.",
    requiredConfig: ["ZAiApiKey"],
  },
  {
    name: "GiteeAI",
    value: "giteeai",
    logo: GiteeAILogo,
    options: (settings) => <GiteeAIOptions settings={settings} />,
    description: "Run GiteeAI's powerful LLMs.",
    requiredConfig: ["GiteeAIApiKey"],
  },
  {
    name: "Minimax",
    value: "minimax",
    logo: MinimaxLogo,
    options: (settings) => <MinimaxOptions settings={settings} />,
    description: "Run Minimax's powerful M2 LLMs.",
    requiredConfig: ["MinimaxApiKey"],
  },
  {
    name: "Cerebras",
    value: "cerebras",
    logo: CerebrasLogo,
    options: (settings) => <CerebrasLLMOptions settings={settings} />,
    description: "Run models at instant speed on Cerebras inference.",
    requiredConfig: ["CerebrasApiKey"],
  },
  {
    name: "oMLX",
    value: "omlx",
    logo: OMLXLogo,
    options: (settings) => <OMLXOptions settings={settings} />,
    description: "Run MLX models on Apple Silicon with smart caching.",
    requiredConfig: ["OMLXLLMBasePath"],
  },
  {
    name: "Generic OpenAI",
    value: "generic-openai",
    logo: GenericOpenAiLogo,
    options: (settings) => <GenericOpenAiOptions settings={settings} />,
    description:
      "Connect to any OpenAi-compatible service via a custom configuration",
    requiredConfig: ["GenericOpenAiBasePath", "GenericOpenAiModelPref"],
    connectionConfig: ["GenericOpenAiBasePath"],
  },
];

/**
 * All LLM providers that are available to the user.
 * This **always** includes the model router provider.
 */
export const ALL_LLM_PROVIDERS = [
  MODEL_ROUTER_PROVIDER,
  ...AVAILABLE_LLM_PROVIDERS,
];

export const LLM_PREFERENCE_CHANGED_EVENT = "llm-preference-changed";
export default function GeneralLLMPreference() {
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredLLMs, setFilteredLLMs] = useState([]);
  const [selectedLLM, setSelectedLLM] = useState(null);
  const [hiddenMap, setHiddenMap] = useState({});
  const [providerModels, setProviderModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const { t } = useTranslation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = { LLMProvider: selectedLLM };
    const formData = new FormData(form);

    for (var [key, value] of formData.entries()) data[key] = value;
    const { error } = await System.updateSystem(data);
    setSaving(true);

    if (error) {
      showToast(`Failed to save LLM settings: ${error}`, "error");
    } else {
      showToast("LLM preferences saved successfully.", "success");
    }
    setSaving(false);
    setHasChanges(!!error);
  };

  const updateLLMChoice = (selection) => {
    setSelectedLLM(selection);
    setHasChanges(true);
  };

  useEffect(() => {
    async function fetchKeys() {
      const _settings = await System.keys();
      setSettings(_settings);
      setSelectedLLM(_settings?.LLMProvider);
      setHiddenMap(parseHiddenBuiltinModels(_settings));
      setLoading(false);
    }
    fetchKeys();
  }, []);

  // Discovered models for the selected provider (drives the Models
  // curation list). Uses stored credentials; a bad key still resolves the
  // static fallback list so curation never depends on a live endpoint.
  useEffect(() => {
    if (!selectedLLM) {
      setProviderModels([]);
      return;
    }
    let cancelled = false;
    setModelsLoading(true);
    System.customModels(selectedLLM)
      .then(({ models }) => {
        if (cancelled) return;
        setProviderModels(
          (models ?? [])
            .map((model) =>
              typeof model === "string"
                ? { id: model, name: model }
                : model?.id
                  ? { id: model.id, name: model.name || model.id }
                  : null
            )
            .filter(Boolean)
        );
      })
      .catch(() => {
        if (!cancelled) setProviderModels([]);
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedLLM]);

  const toggleModelHidden = (modelId, hidden) => {
    setHiddenMap((prev) => {
      const next = { ...prev };
      const list = new Set(next[selectedLLM] ?? []);
      if (hidden) list.add(modelId);
      else list.delete(modelId);
      if (list.size) next[selectedLLM] = [...list];
      else delete next[selectedLLM];
      return next;
    });
    setHasChanges(true);
  };

  const disconnectSelected = async () => {
    if (!selectedLLMObject) return;
    if (
      !window.confirm(
        t("llm.disconnect_confirm", { name: selectedLLMObject.name })
      )
    )
      return;
    const { success, error, resetDefault } = await System.disconnectProvider(
      selectedLLM,
      selectedLLMObject.requiredConfig ?? []
    );
    if (!success) {
      showToast(error || t("llm.disconnect_failed"), "error");
      return;
    }
    showToast(
      resetDefault
        ? t("llm.disconnected_reset_default")
        : t("llm.disconnected"),
      "success"
    );
    const fresh = await System.keys();
    setSettings(fresh);
    setHasChanges(false);
  };
  // Some more complex LLM options do not bubble up the change event, so we need to listen to the custom event
  // we can emit from the LLM options component using window.dispatchEvent(new Event(LLM_PREFERENCE_CHANGED_EVENT));
  useEffect(() => {
    function updateHasChanges() {
      setHasChanges(true);
    }
    window.addEventListener(LLM_PREFERENCE_CHANGED_EVENT, updateHasChanges);
    return () => {
      window.removeEventListener(
        LLM_PREFERENCE_CHANGED_EVENT,
        updateHasChanges
      );
    };
  }, []);

  useEffect(() => {
    const filtered = AVAILABLE_LLM_PROVIDERS.filter((llm) =>
      llm.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredLLMs(filtered);
  }, [searchQuery, selectedLLM]);

  const selectedLLMObject = AVAILABLE_LLM_PROVIDERS.find(
    (llm) => llm.value === selectedLLM
  );
  return (
    <div className="w-screen h-screen overflow-hidden bg-theme-bg-container flex">
      <Sidebar />
      {loading ? (
        <div
          style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
          className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
        >
          <div className="w-full h-full flex justify-center items-center">
            <PreLoader />
          </div>
        </div>
      ) : (
        <div
          style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
          className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
        >
          <form onSubmit={handleSubmit} className="flex w-full">
            <div className="flex flex-col w-full px-1 md:pl-6 md:pr-[50px] md:py-6 py-16">
              <div className="w-full flex flex-col gap-y-1 pb-6 border-white light:border-theme-sidebar-border border-b-2 border-opacity-10">
                <div className="flex gap-x-4 items-center">
                  <p className="text-lg leading-6 font-bold text-white">
                    {t("llm.title")}
                  </p>
                </div>
                <p className="text-xs leading-[18px] font-base text-white text-opacity-60">
                  {t("llm.description")}
                </p>
              </div>
              <div className="w-full justify-end flex">
                {hasChanges && (
                  <CTAButton
                    onClick={() => handleSubmit()}
                    className="mt-3 mr-0 -mb-14 z-10"
                  >
                    {saving ? "Saving..." : "Save changes"}
                  </CTAButton>
                )}
              </div>
              <div className="flex gap-x-4 mt-6 min-h-[480px]">
                {/* Provider rail */}
                <div className="w-[260px] shrink-0 flex flex-col gap-y-2">
                  <div className="relative flex items-center">
                    <MagnifyingGlass
                      size={15}
                      className="absolute left-2.5 text-theme-text-secondary pointer-events-none"
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      autoComplete="off"
                      placeholder={t("llm.search_placeholder")}
                      className="w-full h-[34px] rounded-lg bg-theme-settings-input-bg pl-8 pr-8 text-xs outline-none text-theme-text-primary placeholder:text-theme-text-secondary border border-transparent focus:border-primary-button transition-colors duration-150"
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.preventDefault();
                      }}
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        aria-label="Clear search"
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2 text-theme-text-secondary hover:text-theme-text-primary transition-colors duration-100"
                      >
                        <X size={14} weight="bold" />
                      </button>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto flex flex-col gap-y-0.5 pr-1 min-h-[200px] max-h-[560px]">
                    {filteredLLMs.map((llm) => {
                      const active = selectedLLM === llm.value;
                      const configured = !hasMissingCredentials(
                        settings,
                        llm.value
                      );
                      return (
                        <button
                          key={llm.value}
                          type="button"
                          onClick={() => updateLLMChoice(llm.value)}
                          className={`w-full flex items-center gap-x-2 px-2 py-1.5 rounded-lg text-left transition-colors duration-100 ${
                            active ? "bg-white/10" : "hover:bg-white/5"
                          }`}
                        >
                          <img
                            src={llm.logo}
                            alt=""
                            className="w-5 h-5 rounded shrink-0"
                          />
                          <span className="text-xs text-theme-text-primary truncate flex-1">
                            {llm.name}
                          </span>
                          <span
                            title={
                              configured
                                ? t("llm.configured")
                                : t("llm.not_configured")
                            }
                            className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                              configured
                                ? "bg-emerald-400/80"
                                : "bg-zinc-500/70"
                            }`}
                          />
                        </button>
                      );
                    })}
                    {filteredLLMs.length === 0 && (
                      <div className="px-2 py-1 text-[11px] text-theme-text-secondary">
                        {t("llm.no_results")}
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] leading-4 text-theme-text-secondary px-1">
                    {t("llm.custom_hint")}
                  </p>
                </div>
                {/* Config panel */}
                <div
                  onChange={() => setHasChanges(true)}
                  className="flex-1 min-w-0 border-l border-white/10 pl-4"
                >
                  {selectedLLMObject ? (
                    <>
                      <input
                        type="hidden"
                        name="HiddenBuiltinModels"
                        value={JSON.stringify(hiddenMap)}
                      />
                      <div className="flex gap-x-3 items-center mb-4">
                        <img
                          src={selectedLLMObject.logo || CometStreamIcon}
                          alt=""
                          className="w-8 h-8 rounded-md"
                        />
                        <div className="flex flex-col flex-1 min-w-0">
                          <div className="text-sm font-semibold text-white">
                            {selectedLLMObject.name}
                          </div>
                          <div className="text-xs text-description">
                            {selectedLLMObject.description}
                          </div>
                        </div>
                        {!hasMissingCredentials(settings, selectedLLM) && (
                          <button
                            type="button"
                            onClick={disconnectSelected}
                            className="shrink-0 px-2.5 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-400/10 transition-colors duration-100"
                          >
                            {t("llm.disconnect")}
                          </button>
                        )}
                      </div>
                      {selectedLLM &&
                        AVAILABLE_LLM_PROVIDERS.find(
                          (llm) => llm.value === selectedLLM
                        )?.options?.(settings)}
                      <ProviderModelCuration
                        models={providerModels}
                        loading={modelsLoading}
                        hidden={new Set(hiddenMap[selectedLLM] ?? [])}
                        onToggle={toggleModelHidden}
                      />
                    </>
                  ) : (
                    <div className="h-full min-h-[200px] flex items-center justify-center text-xs text-theme-text-secondary">
                      {t("llm.select_provider")}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

/**
 * Per-provider model curation: checkboxes decide which discovered models
 * stay visible in the chat model picker. State lives in the page's hidden
 * form input, so curation saves with the normal Save button.
 */
function ProviderModelCuration({ models, loading, hidden, onToggle }) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="mt-4 text-[11px] text-theme-text-secondary">
        {t("llm.models_loading")}
      </div>
    );
  }
  if (models.length === 0) return null;
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-theme-text-primary">
          {t("llm.models_title")}
        </span>
        {hidden.size > 0 && (
          <span className="text-[11px] text-theme-text-secondary">
            {t("llm.models_hidden_count", { count: hidden.size })}
          </span>
        )}
      </div>
      <p className="text-[11px] leading-4 text-theme-text-secondary mb-2">
        {t("llm.models_description")}
      </p>
      <div className="flex flex-col gap-y-0.5 max-h-[220px] overflow-y-auto rounded-lg bg-white/5 p-1.5">
        {models.map((model) => {
          const isHidden = hidden.has(model.id);
          return (
            <button
              key={model.id}
              type="button"
              onClick={() => onToggle(model.id, !isHidden)}
              className={`w-full flex items-center gap-x-2 px-2 py-1.5 rounded-md text-left transition-colors duration-100 ${
                isHidden ? "opacity-50 hover:bg-white/5" : "hover:bg-white/10"
              }`}
            >
              <span
                className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 text-[10px] ${
                  isHidden
                    ? "border-white/20 text-transparent"
                    : "border-cta-button bg-cta-button text-black"
                }`}
              >
                ✓
              </span>
              <span className="text-xs text-theme-text-primary truncate flex-1">
                {model.name}
              </span>
              {model.name !== model.id && (
                <span className="text-[10px] text-theme-text-secondary truncate max-w-[180px]">
                  {model.id}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
