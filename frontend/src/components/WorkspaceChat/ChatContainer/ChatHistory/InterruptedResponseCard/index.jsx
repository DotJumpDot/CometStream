import { useTranslation } from "react-i18next";
import { WarningCircle } from "@phosphor-icons/react";

/**
 * Placeholder for an assistant turn that never produced output. Killed or
 * aborted runs leave a response-less chat row behind; the history endpoints
 * surface it as `type: "interrupted"` so the thread reads as history with a
 * failed turn instead of a blank new-chat page. No actions - there is no
 * stored reply to edit or regenerate, but the user prompt above stays
 * editable so the turn can simply be sent again.
 */
export default function InterruptedResponseCard() {
  const { t } = useTranslation();
  return (
    <div className="not-prose w-full flex justify-start my-2">
      <div className="max-w-[85%] flex items-start gap-x-2 rounded-xl border border-amber-400/20 light:border-amber-600/30 bg-amber-400/[0.07] light:bg-amber-600/[0.06] px-3.5 py-2.5">
        <WarningCircle
          size={15}
          weight="fill"
          className="shrink-0 mt-0.5 text-amber-300/90 light:text-amber-700"
        />
        <div className="flex flex-col gap-y-0.5">
          <span className="text-xs font-medium text-amber-200/90 light:text-amber-800">
            {t("chat_window.interrupted.title")}
          </span>
          <span className="text-[11px] leading-4 text-amber-200/60 light:text-amber-700/80">
            {t("chat_window.interrupted.body")}
          </span>
        </div>
      </div>
    </div>
  );
}
