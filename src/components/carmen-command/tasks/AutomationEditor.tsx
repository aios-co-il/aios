import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { asAutomationKey, automationMeta } from "@/lib/carmenAutomations";
import type { CronJobMeta } from "@/lib/cronJobsCatalog";
import {
  asSettingsAutomationKey,
  settingsAutomationMeta,
} from "@/lib/carmenSettingsAutomations";
import { requireTenantId } from "@/lib/requireTenantId";
import { carmenTasksKey, useCarmenTasks } from "../useCarmenTasks";
import { toggleAutomation } from "./automationSwitch";
import { CronSendsBadge } from "./CronSendsBadge";

/**
 * One of Carmen's automations for this org (AIO-315, AIO-316): what it does,
 * what it sends, and its on/off switch. The database decides who may change
 * it; a refused save shows its message. Automations kept in the heartbeat
 * settings also link to those full settings.
 */
export function AutomationEditor({
  tenantId,
  automationKey,
  onDone,
  onOpenSettings,
}: {
  tenantId: string | null;
  automationKey: string;
  onDone: () => void;
  onOpenSettings: () => void;
}) {
  const qc = useQueryClient();
  const meta = findAutomationMeta(automationKey);
  const inHeartbeatSettings = asSettingsAutomationKey(automationKey) !== null;
  const { data } = useCarmenTasks(tenantId);
  const row = data?.rows.find((r) => r.key === `automation:${automationKey}`);
  const save = useMutation({
    mutationFn: (enabled: boolean) =>
      toggleAutomation(requireTenantId(tenantId), automationKey, enabled),
    onSuccess: (_, enabled) => {
      qc.invalidateQueries({ queryKey: carmenTasksKey(tenantId) });
      toast.success(enabled ? "האוטומציה הופעלה" : "האוטומציה כובתה לארגון");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!meta) {
    return <p className="text-sm text-muted-foreground">האוטומציה לא נמצאה.</p>;
  }
  // The switch waits for the stored value; each kind has its own default.
  const enabled = row?.enabled === true;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="space-y-1">
        <p className="text-base font-medium">
          {meta.icon} {meta.label}
        </p>
        <p className="text-sm text-muted-foreground">{meta.description}</p>
        <CronSendsBadge meta={meta} />
        {meta.sendsNote && (
          <p className="text-xs text-muted-foreground">{meta.sendsNote}</p>
        )}
        {row && (
          <p className="text-xs text-muted-foreground">
            רץ: {row.scheduleLabel}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">פעילה בארגון הזה</p>
          <p className="text-xs text-muted-foreground">
            כיבוי עוצר את האוטומציה רק לארגון הזה. ריצות שפוספסו לא מושלמות
            בדיעבד.
          </p>
          {automationKey === "manager_round" && (
            <p className="text-xs text-muted-foreground">
              הדלקה כאן מחזירה למצב צפייה (דשבורד בלבד); מצב שליחה בוחרים בכל
              ההגדרות.
            </p>
          )}
        </div>
        <Switch
          checked={enabled}
          disabled={save.isPending || !row}
          onCheckedChange={(on) => save.mutate(on)}
          aria-label={enabled ? "כיבוי" : "הפעלה"}
        />
      </div>

      <div className="flex gap-2">
        {inHeartbeatSettings && (
          <Button variant="outline" onClick={onOpenSettings}>
            כל ההגדרות
          </Button>
        )}
        <Button variant="outline" onClick={onDone}>
          חזרה למשימות
        </Button>
      </div>
    </div>
  );
}

/** The catalog entry of either kind of automation, or null for an unknown id. */
function findAutomationMeta(id: string): CronJobMeta | null {
  const key = asAutomationKey(id);
  if (key) {
    return automationMeta(key);
  }
  const settingsKey = asSettingsAutomationKey(id);
  return settingsKey ? settingsAutomationMeta(settingsKey) : null;
}
