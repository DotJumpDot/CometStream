import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CaretDown,
  Check,
  MagnifyingGlass,
  SlidersHorizontal,
  Sparkle,
  Eye,
} from "@phosphor-icons/react";
import useUser from "@/hooks/useUser";
import showToast from "@/utils/toast";
import System from "@/models/system";
import Workspace from "@/models/workspace";
import CustomLlmProviders from "@/models/customLlmProviders";
import MonoProviderIcon from "@/components/lib/MonoProviderIcon";
import ContextRing from "./ContextRing";
import ManageModelsModal from "./ManageModelsModal";
import useAnchoredOverlay from "./useAnchoredOverlay";
import {
  SAVE_LLM_SELECTOR_EVENT,
  TOGGLE_LLM_SELECTOR_EVENT,
} from "../LLMSelector/action";
import {
  WORKSPACE_LLM_PROVIDERS,
  hasMissingCredentials,
} from "../LLMSelector/utils";

/**
 * Chat-bar model selector (ZCode-style): a pill next to the mic button that
 * opens a provider-grouped dropdown above the input. Only providers with
 * configured credentials are listed, plus custom providers from the Manage
 * models UI. The context-usage ring sits to its left.
 */

/** Normalize a model entry from System.customModels to {id, name}. */
function normalizeModel(model) {
  if (typeof model === "string") return { id: model, name: model };
  if (model && typeof model === "object" && model.id)
    return { id: model.id, name: model.name || model.id };
  return null;
}

/** Compact human form of a token count: 1000 -> 1K, 1000000 -> 1M. */
export function shortTokenCount(tokens) {
  const value = Number(tokens);
  if (!Number.isFinite(value)) return "";
  if (value >= 1_000_000 && value % 1_000_000 === 0)
    return `${value / 1_000_000}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return `${value}`;
}

export default function ModelSelector({ workspace, chatHistory = [] }) {
  const { t } = useTranslation();
  const { user } = useUser();
  const slug = workspace?.slug;
  const canEdit = !user || ["admin", "manager"].includes(user.role);
  const isAdmin = !user || user.role === "admin";

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [manageOpen, setManageOpen] = useState(false);
  const [groups, setGroups] = useState([]); // [{key, name, isCustom, models:[{id,name,meta?}]}]
  const [current, setCurrent] = useState({
    provider: workspace?.chatProvider ?? null,
    model: workspace?.chatModel ?? null,
    reasoningEffort: workspace?.chatReasoningEffort ?? null,
  });
  const [systemSettings, setSystemSettings] = useState(null);
  const rootRef = useRef(null);
  // Fixed-position panel anchored above the trigger; escapes the chat input
  // box's overflow-hidden clipping (see useAnchoredOverlay).
  const panelStyle = useAnchoredOverlay(open, rootRef, "right");

  /** Effective provider/model with system-default fallbacks. */
  const effective = useMemo(() => {
    const provider = current.provider ?? systemSettings?.LLMProvider ?? null;
    const model = current.model ?? systemSettings?.LLMModel ?? null;
    return { provider, model };
  }, [current, systemSettings]);

  const activeCustomGroup = useMemo(
    () =>
      effective.provider?.startsWith("custom:")
        ? groups.find((group) => group.key === effective.provider)
        : null,
    [groups, effective.provider]
  );
  const activeCustomModel = useMemo(
    () =>
      activeCustomGroup?.models.find((model) => model.id === effective.model) ??
      null,
    [activeCustomGroup, effective.model]
  );
  const reasoningLevels = activeCustomModel?.meta?.reasoningLevels ?? null;

  const refreshSelection = useCallback(async () => {
    if (!slug) return;
    const fresh = await Workspace.bySlug(slug).catch(() => null);
    if (!fresh) return;
    setCurrent({
      provider: fresh.chatProvider ?? null,
      model: fresh.chatModel ?? null,
      reasoningEffort: fresh.chatReasoningEffort ?? null,
    });
  }, [slug]);

  // Load provider groups on mount (so the pill can show the model's display
  // name right away) and again whenever the dropdown opens, so the list stays
  // fresh. Search filters the same data client-side.
  const bootstrappedRef = useRef(false);
  useEffect(() => {
    if (!open && bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    let cancelled = false;
    setLoading(true);

    (async () => {
      const settings = await System.keys().catch(() => null);
      if (cancelled) return;
      setSystemSettings(settings);

      // Custom providers are visible to every logged-in user.
      const { providers: customProviders } = await CustomLlmProviders.list();
      if (cancelled) return;

      const customGroups = customProviders.map((provider) => ({
        key: provider.providerKey,
        name: provider.name,
        isCustom: true,
        models: provider.models
          .filter((model) => model.enabled !== false)
          .map((model) => ({
            id: model.id,
            name: model.displayName || model.id,
            meta: model,
          })),
      }));

      // Built-in providers: only those with credentials configured, and the
      // model list endpoint is admin-only so non-admins get a label-only view.
      const builtInGroups = [];
      if (isAdmin && settings) {
        const configured = WORKSPACE_LLM_PROVIDERS.filter(
          (provider) =>
            provider.value !== "anythingllm-router" &&
            !hasMissingCredentials(settings, provider.value)
        );
        await Promise.all(
          configured.map(async (provider) => {
            const { models } = await System.customModels(provider.value).catch(
              () => ({ models: [] })
            );
            if (cancelled) return;
            builtInGroups.push({
              key: provider.value,
              name: provider.name,
              isCustom: false,
              models: (models ?? [])
                .map(normalizeModel)
                .filter(Boolean)
                .map((model) => ({ ...model, meta: null })),
            });
          })
        );
      }

      if (cancelled) return;
      setGroups([...customGroups, ...builtInGroups]);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, isAdmin, slug, manageOpen]);

  // Keyboard shortcut (Ctrl/Cmd+Shift+L) still opens the picker.
  useEffect(() => {
    const toggle = () => setOpen((value) => !value);
    window.addEventListener(TOGGLE_LLM_SELECTOR_EVENT, toggle);
    return () => window.removeEventListener(TOGGLE_LLM_SELECTOR_EVENT, toggle);
  }, []);

  // Esc closes the dropdown.
  useEffect(() => {
    if (!open) return;
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const selectModel = async (group, model) => {
    setOpen(false);
    if (!canEdit || !slug) return;
    if (group.key === effective.provider && model.id === effective.model)
      return;

    const { message } = await Workspace.update(slug, {
      chatProvider: group.key,
      chatModel: model.id,
    }).catch(() => ({ message: "Failed to update model" }));

    if (message) {
      showToast(message, "error", { clearOnRouteChange: false });
      return;
    }
    setCurrent((state) => ({ ...state, provider: group.key, model: model.id }));
    window.dispatchEvent(new Event(SAVE_LLM_SELECTOR_EVENT));
    showToast(
      t("model_selector.switched_toast", { model: model.name }),
      "success",
      { clearOnRouteChange: false }
    );
  };

  const setReasoning = async (value) => {
    if (!canEdit || !slug) return;
    setCurrent((state) => ({ ...state, reasoningEffort: value }));
    await Workspace.update(slug, { chatReasoningEffort: value }).catch(
      () => {}
    );
  };

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    return groups
      .map((group) => ({
        ...group,
        models: group.models.filter((model) =>
          !query ? true : model.name.toLowerCase().includes(query)
        ),
      }))
      .filter((group) => group.models.length > 0);
  }, [groups, search]);

  const pillLabel = useMemo(() => {
    if (effective.provider === "anythingllm-router")
      return t("model_selector.model_router");
    if (activeCustomModel) return activeCustomModel.name;
    if (effective.provider?.startsWith("custom:"))
      return effective.model || t("model_selector.custom_provider");
    return effective.model || t("model_selector.select_model");
  }, [effective, activeCustomModel, t]);

  return (
    <div ref={rootRef} className="relative flex items-center gap-x-1">
      <ContextRing
        provider={effective.provider}
        model={effective.model}
        workspace={workspace}
        chatHistory={chatHistory}
      />

      <button
        type="button"
        disabled={!canEdit}
        onClick={() => setOpen((value) => !value)}
        aria-label={t("model_selector.select_model")}
        className={`group border-none cursor-pointer px-2 py-1 flex items-center gap-x-1 rounded-lg transition-colors duration-150 ${
          canEdit ? "hover:bg-white/10" : "cursor-default opacity-70"
        }`}
      >
        {activeCustomGroup ? (
          <MonoProviderIcon
            provider={activeCustomGroup.name}
            match="exact"
            size={14}
            className="shrink-0"
            fallbackIconKey={null}
          />
        ) : effective.provider === "anythingllm-router" ? (
          <SlidersHorizontal
            size={13}
            className="text-theme-text-secondary shrink-0"
          />
        ) : (
          <MonoProviderIcon
            provider={effective.provider}
            match="exact"
            size={14}
            className="shrink-0"
          />
        )}
        <span className="text-xs text-theme-text-secondary group-hover:text-theme-text-primary transition-colors duration-150 max-w-[180px] truncate">
          {pillLabel}
        </span>
        <CaretDown
          size={10}
          className={`text-theme-text-secondary transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && panelStyle && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="cs-pop-in z-40 w-[340px] max-w-[calc(100vw-16px)] rounded-xl border border-theme-modal-border bg-theme-bg-popup-menu shadow-2xl overflow-hidden"
            style={{ ...panelStyle, transformOrigin: "bottom right" }}
          >
            {/* Search */}
            <div className="p-2 border-b border-white/10">
              <div className="flex items-center gap-x-2 rounded-lg bg-white/5 px-2.5 py-1.5">
                <MagnifyingGlass
                  size={13}
                  className="text-theme-text-secondary shrink-0"
                />
                <input
                  autoFocus
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("model_selector.search_models")}
                  className="bg-transparent border-none outline-none text-xs text-theme-text-primary placeholder:text-theme-text-placeholder w-full"
                />
              </div>
            </div>

            {/* Provider groups */}
            <div className="max-h-[320px] overflow-y-auto py-1">
              {loading && (
                <div className="px-3 py-4 text-xs text-theme-text-secondary">
                  {t("model_selector.loading")}
                </div>
              )}
              {!loading && filteredGroups.length === 0 && (
                <div className="px-3 py-4 text-xs text-theme-text-secondary">
                  {isAdmin
                    ? t("model_selector.no_models")
                    : t("model_selector.admin_only_models")}
                </div>
              )}
              {!loading &&
                filteredGroups.map((group) => (
                  <div key={group.key} className="mb-1">
                    <div className="flex items-center gap-x-2 px-3 pt-2 pb-1">
                      <MonoProviderIcon
                        provider={group.isCustom ? group.name : group.key}
                        match="exact"
                        size={13}
                      />
                      <span className="text-[11px] font-medium uppercase tracking-wide text-theme-text-secondary">
                        {group.name}
                      </span>
                      {group.isCustom && (
                        <span className="text-[10px] px-1.5 py-px rounded-full border border-white/15 text-theme-text-secondary">
                          {t("model_selector.custom_badge")}
                        </span>
                      )}
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400/80" />
                    </div>
                    {group.models.map((model) => {
                      const isActive =
                        group.key === effective.provider &&
                        model.id === effective.model;
                      return (
                        <button
                          key={model.id}
                          type="button"
                          onClick={() => selectModel(group, model)}
                          className={`w-full flex items-center gap-x-2 px-3 py-1.5 text-left transition-colors duration-100 ${
                            isActive ? "bg-white/10" : "hover:bg-white/5"
                          }`}
                        >
                          <span className="text-xs text-theme-text-primary truncate flex-1">
                            {model.name}
                          </span>
                          {model.meta?.capabilities?.vision && (
                            <span className="flex items-center gap-x-0.5 text-[10px] text-theme-text-secondary">
                              <Eye size={11} />
                              {t("model_selector.vision_badge")}
                            </span>
                          )}
                          {model.meta?.reasoningLevels?.length > 0 && (
                            <span className="flex items-center gap-x-0.5 text-[10px] text-theme-text-secondary">
                              <Sparkle size={11} />
                              {t("model_selector.reasoning_badge")}
                            </span>
                          )}
                          {model.meta?.contextWindow && (
                            <span className="text-[10px] text-theme-text-secondary">
                              {shortTokenCount(model.meta.contextWindow)}
                            </span>
                          )}
                          {isActive && (
                            <Check
                              size={13}
                              className="text-cta-button shrink-0"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
            </div>

            {/* Reasoning preference for the active custom model */}
            {reasoningLevels !== null && canEdit && (
              <div className="px-3 py-2 border-t border-white/10 flex items-center justify-between gap-x-2">
                <span className="text-[11px] text-theme-text-secondary">
                  {t("model_selector.reasoning")}
                </span>
                <div className="flex items-center gap-x-1">
                  {[
                    "off",
                    ...(reasoningLevels.length > 0 ? reasoningLevels : ["on"]),
                  ].map((value) => {
                    // No stored preference defaults to "on" for simple
                    // on/off models so thinking models think out of the box
                    // (the server sends nothing either way - the template
                    // default). Named-level models default to off until a
                    // level is picked.
                    const effective =
                      current.reasoningEffort ??
                      (reasoningLevels.length === 0 ? "on" : "off");
                    const active = value === effective;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setReasoning(value)}
                        className={`px-2 py-0.5 rounded-md text-[11px] transition-colors duration-100 ${
                          active
                            ? "bg-cta-button text-black"
                            : "text-theme-text-secondary hover:bg-white/10"
                        }`}
                      >
                        {t(`model_selector.reasoning_value_${value}`, value)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Footer */}
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setManageOpen(true);
                }}
                className="w-full flex items-center gap-x-2 px-3 py-2.5 border-t border-white/10 text-xs text-theme-text-secondary hover:text-theme-text-primary hover:bg-white/5 transition-colors duration-100"
              >
                <SlidersHorizontal size={13} />
                {t("model_selector.manage_models")}
              </button>
            )}
          </div>
        </>
      )}

      {manageOpen && (
        <ManageModelsModal
          isOpen={manageOpen}
          closeModal={() => setManageOpen(false)}
          onChanged={() => {
            // Re-run the group loader + pick up selection changes.
            setOpen(false);
            refreshSelection();
          }}
        />
      )}
    </div>
  );
}
