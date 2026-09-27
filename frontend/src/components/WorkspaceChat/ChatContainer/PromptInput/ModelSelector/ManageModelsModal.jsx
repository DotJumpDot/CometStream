import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  ArrowsCounterClockwise,
  CaretRight,
  Eye,
  FloppyDisk,
  PencilSimple,
  Plus,
  Sparkle,
  Star,
  Trash,
  X,
} from "@phosphor-icons/react";
import paths from "@/utils/paths";
import showToast from "@/utils/toast";
import System from "@/models/system";
import useUser from "@/hooks/useUser";
import Modal, {
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHint,
  ModalInput,
} from "@/components/lib/Modal";
import Toggle from "@/components/lib/Toggle";
import MonoProviderIcon from "@/components/lib/MonoProviderIcon";
import CustomLlmProviders from "@/models/customLlmProviders";
import { shortTokenCount } from ".";
import {
  WORKSPACE_LLM_PROVIDERS,
  hasMissingCredentials,
} from "../LLMSelector/utils";

/**
 * Manage models (reference: ZCode model settings):
 * left column lists configured built-in providers and custom providers;
 * the right panel edits the selected custom provider's connection and models
 * (context window, capabilities, reasoning levels, enable toggle). Built-in
 * providers are read-only here - they are configured in system LLM settings.
 */

export default function ManageModelsModal({ isOpen, closeModal, onChanged }) {
  const { t } = useTranslation();
  const { user } = useUser();
  const navigate = useNavigate();
  const isAdmin = !user || user.role === "admin";

  const [customProviders, setCustomProviders] = useState([]);
  const [configuredBuiltIns, setConfiguredBuiltIns] = useState([]);
  const [systemLLMProvider, setSystemLLMProvider] = useState(null);
  const [selected, setSelected] = useState(null); // {type:"custom", id} | {type:"builtin", value} | null
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [showAddModel, setShowAddModel] = useState(false);
  const [editingModel, setEditingModel] = useState(null);

  const selectedCustom = useMemo(
    () =>
      selected?.type === "custom"
        ? customProviders.find((provider) => provider.id === selected.id)
        : null,
    [selected, customProviders]
  );

  const reload = useCallback(async () => {
    if (!isAdmin) return;
    const [{ providers }, settings] = await Promise.all([
      CustomLlmProviders.list(),
      System.keys().catch(() => null),
    ]);
    setCustomProviders(providers);
    setSystemLLMProvider(settings?.LLMProvider ?? null);
    setConfiguredBuiltIns(
      settings
        ? WORKSPACE_LLM_PROVIDERS.filter(
            (provider) =>
              provider.value !== "anythingllm-router" &&
              !hasMissingCredentials(settings, provider.value)
          )
        : []
    );
  }, [isAdmin]);

  useEffect(() => {
    if (isOpen) {
      reload();
      setSelected(null);
    }
  }, [isOpen, reload]);

  const afterChange = () => {
    reload();
    onChanged?.();
  };

  const setSystemDefault = async (providerId) => {
    const { error } = await System.updateSystem({
      LLMProvider: `custom:${providerId}`,
    });
    if (error) {
      showToast(error, "error");
      return;
    }
    showToast(t("manage_models.default_set"), "success");
    reload();
  };

  const disconnectBuiltIn = async (providerValue) => {
    const entry = WORKSPACE_LLM_PROVIDERS.find(
      (provider) => provider.value === providerValue
    );
    if (!entry) return;
    if (
      !window.confirm(
        t("manage_models.disconnect_builtin_confirm", { name: entry.name })
      )
    )
      return;
    const { success, error, resetDefault } = await System.disconnectProvider(
      providerValue,
      entry.requiredConfig ?? []
    );
    if (!success) {
      showToast(error || t("manage_models.disconnect_failed"), "error");
      return;
    }
    showToast(
      resetDefault
        ? t("manage_models.builtin_disconnected_reset_default")
        : t("manage_models.builtin_disconnected"),
      "success"
    );
    setSelected(null);
    afterChange();
  };

  if (!isAdmin) return null;

  return (
    <>
      <Modal isOpen={isOpen} onClose={closeModal} size="xl">
        <ModalHeader
          title={t("manage_models.title")}
          subtitle={t("manage_models.subtitle")}
          onClose={closeModal}
        />
        <ModalBody>
          <div className="flex gap-x-4 min-h-[420px]">
            {/* Provider list */}
            <div className="w-[220px] shrink-0 flex flex-col gap-y-4">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-theme-text-secondary px-2 mb-1">
                  {t("manage_models.providers")}
                </div>
                {configuredBuiltIns.map((provider) => (
                  <ProviderRow
                    key={provider.value}
                    active={
                      selected?.type === "builtin" &&
                      selected.value === provider.value
                    }
                    onClick={() =>
                      setSelected({ type: "builtin", value: provider.value })
                    }
                    icon={
                      <MonoProviderIcon
                        provider={provider.value}
                        match="exact"
                        size={16}
                      />
                    }
                    label={provider.name}
                    connected
                  />
                ))}
                {configuredBuiltIns.length === 0 && (
                  <div className="px-2 py-1 text-[11px] text-theme-text-secondary">
                    {t("manage_models.no_builtin_providers")}
                  </div>
                )}
              </div>

              <div>
                <div className="text-[11px] font-medium uppercase tracking-wide text-theme-text-secondary px-2 mb-1">
                  {t("manage_models.custom_providers")}
                </div>
                {customProviders.map((provider) => (
                  <ProviderRow
                    key={provider.id}
                    active={
                      selected?.type === "custom" && selected.id === provider.id
                    }
                    onClick={() =>
                      setSelected({ type: "custom", id: provider.id })
                    }
                    icon={
                      <MonoProviderIcon
                        provider={provider.name}
                        match="exact"
                        size={16}
                      />
                    }
                    label={provider.name}
                    connected={provider.models.length > 0}
                    isDefault={systemLLMProvider === `custom:${provider.id}`}
                  />
                ))}
                {customProviders.length === 0 && (
                  <div className="px-2 py-1 text-[11px] text-theme-text-secondary">
                    {t("manage_models.no_custom_providers")}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowAddProvider(true)}
                  className="w-full flex items-center gap-x-2 px-2 py-1.5 rounded-lg text-xs text-theme-text-secondary hover:text-theme-text-primary hover:bg-white/5 transition-colors duration-100"
                >
                  <Plus size={13} />
                  {t("manage_models.add_provider")}
                </button>
              </div>
            </div>

            {/* Detail panel */}
            <div className="flex-1 min-w-0 border-l border-white/10 pl-4">
              {!selected && (
                <div className="h-full flex items-center justify-center text-xs text-theme-text-secondary">
                  {t("manage_models.select_provider")}
                </div>
              )}

              {selected?.type === "builtin" && (
                <BuiltInPanel
                  value={selected.value}
                  onOpenSettings={() =>
                    navigate(paths.settings.llmPreference())
                  }
                  onDisconnect={() => disconnectBuiltIn(selected.value)}
                />
              )}

              {selectedCustom && (
                <CustomProviderPanel
                  key={selectedCustom.id}
                  provider={selectedCustom}
                  isDefault={
                    systemLLMProvider === `custom:${selectedCustom.id}`
                  }
                  onSetDefault={() => setSystemDefault(selectedCustom.id)}
                  onSaved={afterChange}
                  onAddModel={() => setShowAddModel(true)}
                  onEditModel={(model) => setEditingModel(model)}
                  onDeleteModel={async (modelId) => {
                    await CustomLlmProviders.deleteModel(
                      selectedCustom.id,
                      modelId
                    )
                      .then(afterChange)
                      .catch((e) => showToast(e.message, "error"));
                  }}
                  onToggleModel={async (modelId, enabled) => {
                    await CustomLlmProviders.updateModel(
                      selectedCustom.id,
                      modelId,
                      { enabled }
                    )
                      .then(afterChange)
                      .catch((e) => showToast(e.message, "error"));
                  }}
                  onDeleteProvider={async () => {
                    if (
                      !window.confirm(
                        t("manage_models.delete_provider_confirm", {
                          name: selectedCustom.name,
                        })
                      )
                    )
                      return;
                    await CustomLlmProviders.delete(selectedCustom.id)
                      .then(() => {
                        setSelected(null);
                        afterChange();
                        showToast(
                          t("manage_models.provider_deleted"),
                          "success"
                        );
                      })
                      .catch((e) => showToast(e.message, "error"));
                  }}
                />
              )}
            </div>
          </div>
        </ModalBody>
      </Modal>

      {showAddProvider && (
        <AddProviderDialog
          closeModal={() => setShowAddProvider(false)}
          onCreated={(provider) => {
            setShowAddProvider(false);
            afterChange();
            setSelected({ type: "custom", id: provider.id });
            showToast(t("manage_models.provider_created"), "success");
          }}
        />
      )}

      {showAddModel && selectedCustom && (
        <AddModelDialog
          provider={selectedCustom}
          closeModal={() => setShowAddModel(false)}
          onAdded={() => {
            setShowAddModel(false);
            afterChange();
            showToast(t("manage_models.model_added"), "success");
          }}
        />
      )}

      {editingModel && selectedCustom && (
        <EditModelDialog
          provider={selectedCustom}
          model={editingModel}
          closeModal={() => setEditingModel(null)}
          onSaved={() => {
            setEditingModel(null);
            afterChange();
            showToast(t("manage_models.model_updated"), "success");
          }}
        />
      )}
    </>
  );
}

function ProviderRow({ active, onClick, icon, label, connected, isDefault }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-x-2 px-2 py-1.5 rounded-lg text-left transition-colors duration-100 ${
        active ? "bg-white/10" : "hover:bg-white/5"
      }`}
    >
      {icon ?? <span className="w-4 h-4" />}
      <span className="text-xs text-theme-text-primary truncate flex-1">
        {label}
      </span>
      {isDefault && (
        <span
          title={t("manage_models.default_badge")}
          className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-cta-button/15 text-cta-button shrink-0"
        >
          {t("manage_models.default_badge")}
        </span>
      )}
      <span
        title={
          connected
            ? t("manage_models.connected")
            : t("manage_models.no_models")
        }
        className={`h-1.5 w-1.5 rounded-full shrink-0 ${
          connected ? "bg-emerald-400/80" : "bg-amber-400/70"
        }`}
      />
    </button>
  );
}

function BuiltInPanel({ value, onOpenSettings, onDisconnect }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex items-center gap-x-2">
        <MonoProviderIcon provider={value} match="exact" size={18} />
        <span className="text-sm font-medium text-theme-text-primary">
          {value}
        </span>
      </div>
      <p className="text-xs text-theme-text-secondary leading-relaxed">
        {t("manage_models.builtin_description")}
      </p>
      <div className="flex items-center gap-x-3">
        <button
          type="button"
          onClick={onOpenSettings}
          className="w-fit flex items-center gap-x-1.5 text-xs text-cta-button hover:underline"
        >
          {t("manage_models.open_llm_settings")}
          <CaretRight size={11} />
        </button>
        {onDisconnect && (
          <button
            type="button"
            onClick={onDisconnect}
            className="w-fit text-xs text-red-400 hover:bg-red-400/10 px-2 py-1 rounded-lg transition-colors duration-100"
          >
            {t("manage_models.disconnect_builtin")}
          </button>
        )}
      </div>
    </div>
  );
}

function CustomProviderPanel({
  provider,
  isDefault = false,
  onSetDefault,
  onSaved,
  onAddModel,
  onEditModel,
  onDeleteModel,
  onToggleModel,
  onDeleteProvider,
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(provider.name);
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl);
  const [apiKey, setApiKey] = useState("");

  const saveConnection = async () => {
    await CustomLlmProviders.update(provider.id, {
      name,
      baseUrl,
      apiKey: apiKey === "" ? undefined : apiKey,
    })
      .then(() => {
        onSaved();
        showToast(t("manage_models.connection_saved"), "success");
      })
      .catch((e) => showToast(e.message, "error"));
  };

  return (
    <div className="flex flex-col gap-y-5 h-full">
      {/* Connection */}
      <div className="flex flex-col gap-y-3">
        <ModalInput
          label={t("manage_models.field_name")}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <ModalInput
          label={t("manage_models.field_base_url")}
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          placeholder="https://api.example.com/v1"
        />
        <ModalInput
          type="password"
          label={t("manage_models.field_api_key")}
          optional
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={
            provider.hasApiKey ? t("manage_models.api_key_unchanged") : ""
          }
        />
        <div className="flex items-center gap-x-2">
          <button
            type="button"
            onClick={saveConnection}
            className="flex items-center gap-x-1.5 px-3 py-1.5 rounded-lg bg-cta-button text-black text-xs font-medium hover:opacity-90 transition-opacity duration-100"
          >
            <FloppyDisk size={13} />
            {t("manage_models.save")}
          </button>
          {onSetDefault && (
            <button
              type="button"
              onClick={onSetDefault}
              disabled={isDefault}
              title={t("manage_models.set_default_hint")}
              className={`flex items-center gap-x-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors duration-100 disabled:cursor-default ${
                isDefault
                  ? "bg-cta-button/15 text-cta-button"
                  : "border border-white/15 text-theme-text-secondary hover:text-theme-text-primary hover:bg-white/5"
              }`}
            >
              <Star size={13} weight={isDefault ? "fill" : "regular"} />
              {isDefault
                ? t("manage_models.default_badge")
                : t("manage_models.set_default")}
            </button>
          )}
          <button
            type="button"
            onClick={onDeleteProvider}
            className="flex items-center gap-x-1.5 px-3 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-400/10 transition-colors duration-100"
          >
            <Trash size={13} />
            {t("manage_models.delete_provider")}
          </button>
        </div>
      </div>

      {/* Models */}
      <div className="flex items-center justify-between pt-2 border-t border-white/10">
        <span className="text-xs font-medium text-theme-text-primary">
          {t("manage_models.models")}
        </span>
        <button
          type="button"
          onClick={onAddModel}
          className="flex items-center gap-x-1.5 px-2.5 py-1 rounded-lg text-xs text-theme-text-secondary hover:text-theme-text-primary hover:bg-white/5 transition-colors duration-100"
        >
          <Plus size={12} />
          {t("manage_models.add_model")}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-y-1.5 pr-1">
        {provider.models.length === 0 && (
          <div className="text-[11px] text-theme-text-secondary">
            {t("manage_models.no_models")}
          </div>
        )}
        {provider.models.map((model) => (
          <div
            key={model.id}
            className="flex items-center gap-x-2 px-3 py-2 rounded-lg bg-white/5"
          >
            <div className="flex-1 min-w-0">
              <div className="text-xs text-theme-text-primary truncate">
                {model.displayName || model.id}
              </div>
              {model.displayName && (
                <div className="text-[10px] text-theme-text-secondary truncate">
                  {model.id}
                </div>
              )}
            </div>
            {model.contextWindow && (
              <span className="text-[10px] text-theme-text-secondary shrink-0">
                {shortTokenCount(model.contextWindow)}
              </span>
            )}
            {model.capabilities?.vision && (
              <span className="flex items-center text-[10px] text-theme-text-secondary shrink-0">
                <Eye size={11} />
              </span>
            )}
            {model.reasoningLevels?.length > 0 && (
              <span className="flex items-center text-[10px] text-theme-text-secondary shrink-0">
                <Sparkle size={11} />
              </span>
            )}
            <Toggle
              enabled={model.enabled !== false}
              onChange={(enabled) => onToggleModel(model.id, enabled)}
            />
            <button
              type="button"
              onClick={() => onEditModel?.(model)}
              aria-label={t("manage_models.edit_model")}
              className="text-theme-text-secondary hover:text-theme-text-primary transition-colors duration-100 shrink-0"
            >
              <PencilSimple size={13} />
            </button>
            <button
              type="button"
              onClick={() => onDeleteModel(model.id)}
              aria-label={t("manage_models.remove_model")}
              className="text-theme-text-secondary hover:text-red-400 transition-colors duration-100 shrink-0"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddProviderDialog({ closeModal, onCreated }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    await CustomLlmProviders.create({ name, baseUrl, apiKey })
      .then((provider) => onCreated(provider))
      .catch((e) => showToast(e.message, "error"))
      .finally(() => setLoading(false));
  };

  return (
    <Modal isOpen={true} onClose={closeModal} size="md">
      <ModalHeader
        title={t("manage_models.add_provider")}
        subtitle={t("manage_models.add_provider_subtitle")}
        onClose={closeModal}
      />
      <form onSubmit={submit}>
        <ModalBody>
          <div className="flex flex-col gap-y-3">
            <ModalInput
              label={t("manage_models.field_name")}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Z.ai"
              required
            />
            <ModalInput
              label={t("manage_models.field_base_url")}
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.example.com/v1"
              required
            />
            <ModalInput
              type="password"
              label={t("manage_models.field_api_key")}
              optional
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
            <ModalHint>{t("manage_models.ssrf_note")}</ModalHint>
          </div>
        </ModalBody>
        <ModalFooter>
          <button
            type="submit"
            disabled={loading || !name || !baseUrl}
            className="px-3 py-2 rounded-lg bg-cta-button text-black text-xs font-medium hover:opacity-90 transition-opacity duration-100 disabled:opacity-50"
          >
            {loading ? t("manage_models.creating") : t("manage_models.create")}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

function AddModelDialog({ provider, closeModal, onAdded }) {
  const { t } = useTranslation();
  return (
    <ModelFormDialog
      provider={provider}
      initial={null}
      title={t("manage_models.add_model")}
      submitLabel={t("manage_models.add")}
      submittingLabel={t("manage_models.adding")}
      closeModal={closeModal}
      onSubmit={async (payload) => {
        await CustomLlmProviders.addModel(provider.id, payload);
        onAdded();
      }}
    />
  );
}

function EditModelDialog({ provider, model, closeModal, onSaved }) {
  const { t } = useTranslation();
  return (
    <ModelFormDialog
      key={model.id}
      provider={provider}
      initial={model}
      title={t("manage_models.edit_model")}
      submitLabel={t("manage_models.save_changes")}
      submittingLabel={t("manage_models.saving")}
      closeModal={closeModal}
      onSubmit={async (payload) => {
        await CustomLlmProviders.updateModel(provider.id, model.id, payload);
        onSaved();
      }}
    />
  );
}

/**
 * Shared add/edit form for one custom model descriptor. Add mode fetches the
 * endpoint's model list and leaves the ID editable; edit mode locks the ID
 * (rename via display name) and pre-fills every field including Advanced.
 */
function ModelFormDialog({
  provider,
  initial,
  title,
  submitLabel,
  submittingLabel,
  closeModal,
  onSubmit,
}) {
  const { t } = useTranslation();
  const isEdit = !!initial;
  const [modelId, setModelId] = useState(initial?.id ?? "");
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [contextWindow, setContextWindow] = useState(
    String(initial?.contextWindow ?? "128000")
  );
  const [maxTokens, setMaxTokens] = useState(
    initial?.maxTokens ? String(initial.maxTokens) : ""
  );
  const [vision, setVision] = useState(initial?.capabilities?.vision ?? false);
  const [tools, setTools] = useState(initial?.capabilities?.tools ?? true);
  const [reasoningLevels, setReasoningLevels] = useState(
    (initial?.reasoningLevels ?? []).join(", ")
  );
  const [temperature, setTemperature] = useState(
    initial?.temperature !== undefined ? String(initial.temperature) : ""
  );
  const [topP, setTopP] = useState(
    initial?.topP !== undefined ? String(initial.topP) : ""
  );
  const [timeoutSeconds, setTimeoutSeconds] = useState(
    initial?.timeoutMs ? String(Math.round(initial.timeoutMs / 1000)) : ""
  );
  const [showAdvanced, setShowAdvanced] = useState(isEdit);
  const [discovered, setDiscovered] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchFromApi = async () => {
    setFetching(true);
    await CustomLlmProviders.fetchModels(provider.id)
      .then((models) => {
        setDiscovered(models);
        if (models.length === 0)
          showToast(t("manage_models.fetch_empty"), "info");
      })
      .catch((e) => showToast(e.message, "error"))
      .finally(() => setFetching(false));
  };

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    await onSubmit({
      id: modelId,
      displayName: displayName || undefined,
      contextWindow: Number(contextWindow),
      maxTokens: maxTokens ? Number(maxTokens) : undefined,
      capabilities: { vision, tools },
      reasoningLevels: reasoningLevels
        .split(",")
        .map((level) => level.trim())
        .filter(Boolean),
      // Empty = backend default; the sanitizer drops out-of-range values.
      temperature: temperature === "" ? undefined : Number(temperature),
      topP: topP === "" ? undefined : Number(topP),
      timeoutMs:
        timeoutSeconds === "" ? undefined : Number(timeoutSeconds) * 1000,
    })
      .catch((e) => showToast(e.message, "error"))
      .finally(() => setLoading(false));
  };

  return (
    <Modal isOpen={true} onClose={closeModal} size="md">
      <ModalHeader title={title} onClose={closeModal} />
      <form onSubmit={submit}>
        <ModalBody>
          <div className="flex flex-col gap-y-3">
            {!isEdit && Array.isArray(discovered) && discovered.length > 0 && (
              <div className="flex flex-col gap-y-1 max-h-[140px] overflow-y-auto rounded-lg bg-white/5 p-2">
                {discovered.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setModelId(id)}
                    className={`text-left text-[11px] px-2 py-1 rounded-md transition-colors duration-100 ${
                      modelId === id
                        ? "bg-cta-button text-black"
                        : "text-theme-text-secondary hover:bg-white/10"
                    }`}
                  >
                    {id}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-end gap-x-2">
              <div className="flex-1">
                <ModalInput
                  label={t("manage_models.field_model_id")}
                  value={modelId}
                  onChange={(event) => setModelId(event.target.value)}
                  placeholder="glm-4.7"
                  required
                  disabled={isEdit}
                />
              </div>
              {!isEdit && (
                <button
                  type="button"
                  onClick={fetchFromApi}
                  disabled={fetching}
                  title={t("manage_models.fetch_models")}
                  className="h-[34px] px-2.5 rounded-lg border border-white/15 text-theme-text-secondary hover:text-theme-text-primary hover:bg-white/5 transition-colors duration-100 disabled:opacity-50"
                >
                  <ArrowsCounterClockwise
                    size={14}
                    className={fetching ? "animate-spin" : ""}
                  />
                </button>
              )}
            </div>
            <ModalInput
              label={t("manage_models.field_display_name")}
              optional
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
            <div className="flex gap-x-3">
              <div className="flex-1">
                <ModalInput
                  label={t("manage_models.field_context_window")}
                  type="number"
                  min={512}
                  value={contextWindow}
                  onChange={(event) => setContextWindow(event.target.value)}
                  required
                />
              </div>
              <div className="flex-1">
                <ModalInput
                  label={t("manage_models.field_max_output")}
                  optional
                  type="number"
                  min={1}
                  value={maxTokens}
                  onChange={(event) => setMaxTokens(event.target.value)}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced((value) => !value)}
              className="w-fit text-[11px] text-theme-text-secondary hover:text-theme-text-primary transition-colors duration-100"
            >
              {showAdvanced ? "▾" : "▸"} {t("manage_models.advanced")}
            </button>
            {showAdvanced && (
              <div className="flex flex-col gap-y-3 rounded-lg bg-white/5 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-theme-text-primary">
                    {t("manage_models.capability_vision")}
                  </span>
                  <Toggle enabled={vision} onChange={setVision} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-theme-text-primary">
                    {t("manage_models.capability_tools")}
                  </span>
                  <Toggle enabled={tools} onChange={setTools} />
                </div>
                <ModalInput
                  label={t("manage_models.field_reasoning_levels")}
                  optional
                  value={reasoningLevels}
                  onChange={(event) => setReasoningLevels(event.target.value)}
                  placeholder="low, medium, high"
                />
                <ModalHint>
                  {t("manage_models.reasoning_levels_hint")}
                </ModalHint>
                <div className="flex gap-x-3">
                  <div className="flex-1">
                    <ModalInput
                      label={t("manage_models.field_temperature")}
                      optional
                      type="number"
                      min={0}
                      max={2}
                      step={0.1}
                      value={temperature}
                      onChange={(event) => setTemperature(event.target.value)}
                      placeholder="0.7"
                    />
                  </div>
                  <div className="flex-1">
                    <ModalInput
                      label={t("manage_models.field_top_p")}
                      optional
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={topP}
                      onChange={(event) => setTopP(event.target.value)}
                      placeholder="0.9"
                    />
                  </div>
                </div>
                <ModalHint>{t("manage_models.temperature_hint")}</ModalHint>
                <ModalInput
                  label={t("manage_models.field_timeout")}
                  optional
                  type="number"
                  min={1}
                  value={timeoutSeconds}
                  onChange={(event) => setTimeoutSeconds(event.target.value)}
                  placeholder="120"
                />
                <ModalHint>{t("manage_models.timeout_hint")}</ModalHint>
              </div>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <button
            type="submit"
            disabled={loading || !modelId}
            className="px-3 py-2 rounded-lg bg-cta-button text-black text-xs font-medium hover:opacity-90 transition-opacity duration-100 disabled:opacity-50"
          >
            {loading ? submittingLabel : submitLabel}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
