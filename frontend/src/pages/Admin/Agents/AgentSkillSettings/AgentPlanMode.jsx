import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleNotch } from "@phosphor-icons/react";
import Toggle from "@/components/lib/Toggle";
import System from "@/models/system";
import Admin from "@/models/admin";

/**
 * Plan-mode auto-approval toggle. Default ON (the server treats an unset
 * value as approved): long runs exit plan mode without parking on a click.
 * Turn it off to gate every design behind a manual Approve/Reject.
 */
export default function AgentPlanMode() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    System.keys()
      .then((res) => {
        // Unset reads back true from the server default - only an explicit
        // false flips the toggle off.
        setEnabled(res.PlanModeAutoApprove !== false);
      })
      .finally(() => setLoading(false));
  }, []);

  async function toggleEnabled(next) {
    setEnabled(next);
    await Admin.updateSystemPreferences({
      plan_mode_auto_approve: String(next),
    });
  }

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex items-center gap-x-1">
        <label className="block text-md font-medium text-zinc-50 light:text-slate-900 flex items-center gap-x-1">
          {t("agent.settings.plan-mode.title")}
        </label>
      </div>
      <div className="flex items-center gap-x-4">
        <p className="text-xs text-zinc-400 light:text-slate-600">
          {t("agent.settings.plan-mode.description")}
        </p>
        {loading ? (
          <CircleNotch
            size={16}
            className="shrink-0 animate-spin text-zinc-400 light:text-slate-600"
          />
        ) : (
          <Toggle
            size="lg"
            name="planModeAutoApprove"
            enabled={enabled}
            onChange={toggleEnabled}
          />
        )}
      </div>
    </div>
  );
}
