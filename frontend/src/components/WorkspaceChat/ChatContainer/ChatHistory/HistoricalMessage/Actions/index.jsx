import React, { memo, useEffect } from "react";
import useCopyText from "@/hooks/useCopyText";
import { Check, Stack, ArrowsClockwise, Copy } from "@phosphor-icons/react";
import { EditMessageAction } from "./EditMessage";
import RenderMetrics from "./RenderMetrics";
import ActionMenu from "./ActionMenu";
import { useTranslation } from "react-i18next";
import { useSourcesSidebar } from "@/components/WorkspaceChat/ChatContainer/ChatSidebar";
import { setLatestSources } from "@/utils/chat/sourcesStore";

const Actions = ({
  message,
  sources = [],
  chatId,
  slug,
  isLastMessage,
  regenerateMessage,
  forkThread,
  isEditing,
  role,
  metrics = {},
}) => {
  return (
    <div
      className={`flex w-full flex-wrap items-center gap-y-1 ${role === "user" ? "justify-end" : "justify-between"}`}
    >
      <div className="flex justify-start items-center gap-x-[8px]">
        <div className="md:group-hover:opacity-100 transition-all duration-300 md:opacity-0 flex justify-start items-center gap-x-[8px]">
          <div
            className={`flex justify-start items-center gap-x-[8px] ${role === "user" ? "flex-row-reverse" : ""}`}
          >
            <CopyMessage message={message} />
            <EditMessageAction
              chatId={chatId}
              role={role}
              isEditing={isEditing}
            />
          </div>
          {isLastMessage && !isEditing && (
            <RegenerateMessage
              regenerateMessage={regenerateMessage}
              slug={slug}
              chatId={chatId}
            />
          )}
          {chatId && role !== "user" && !isEditing && (
            <SourcesAction sources={sources} />
          )}
          <ActionMenu
            chatId={chatId}
            forkThread={forkThread}
            isEditing={isEditing}
            role={role}
          />
        </div>
      </div>
      <RenderMetrics metrics={metrics} />
    </div>
  );
};

/**
 * Opens the Sources side panel with this message's citations. Renders only
 * when the message actually has sources. As a side effect it also publishes
 * the sources to the sources store so the Agent panel's Sources section can
 * list them — mounted messages update it in order, so the latest message
 * with sources wins.
 */
function SourcesAction({ sources }) {
  const { t } = useTranslation();
  const {
    sidebarOpen,
    openSidebar,
    closeSidebar,
    sources: currentSources,
  } = useSourcesSidebar();

  useEffect(() => {
    if (sources.length > 0) setLatestSources(sources);
  }, [sources]);

  if (sources.length === 0) return null;
  const isCurrent = sidebarOpen && sources === currentSources;

  return (
    <div className="mt-3 relative">
      <button
        onClick={() => (isCurrent ? closeSidebar() : openSidebar(sources))}
        data-tooltip-id="sources-action-btn"
        data-tooltip-content={t("chat_window.sources")}
        className="text-zinc-300 light:text-slate-500"
        aria-label={t("chat_window.sources")}
      >
        <Stack
          size={20}
          className="mb-1"
          weight={isCurrent ? "fill" : "regular"}
        />
      </button>
    </div>
  );
}

function CopyMessage({ message }) {
  const { copied, copyText } = useCopyText();
  const { t } = useTranslation();

  return (
    <>
      <div className="mt-3 relative">
        <button
          onClick={() => copyText(message)}
          data-tooltip-id="copy-assistant-text"
          data-tooltip-content={t("chat_window.copy")}
          className="text-zinc-300 light:text-slate-500"
          aria-label={t("chat_window.copy")}
        >
          {copied ? (
            <Check size={20} className="mb-1" />
          ) : (
            <Copy size={20} className="mb-1" />
          )}
        </button>
      </div>
    </>
  );
}

function RegenerateMessage({ regenerateMessage, chatId }) {
  const { t } = useTranslation();
  if (!chatId) return null;
  return (
    <div className="mt-3 relative">
      <button
        onClick={() => regenerateMessage(chatId)}
        data-tooltip-id="regenerate-assistant-text"
        data-tooltip-content={t("chat_window.regenerate_response")}
        className="border-none text-zinc-300 light:text-slate-500"
        aria-label={t("chat_window.regenerate")}
      >
        <ArrowsClockwise size={20} className="mb-1" weight="fill" />
      </button>
    </div>
  );
}

export default memo(Actions);
