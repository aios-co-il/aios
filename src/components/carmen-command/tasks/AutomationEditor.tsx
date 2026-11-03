import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { asAutomationKey, automationMeta } from "@/lib/carmenAutomations";
import { carmenTasksKey, useCarmenTasks } from "../useCarmenTasks";
import { setAutomationEnabled } from "./automationSwitch";
import { CronSendsBadge } from "./CronSendsBadge";

/**
 * One of Carmen's automations for this org (AIO-315): what it does, what it
 * sends, and its on/off switch. Only owners can change it (RLS); for anyone
 * else the save fails with the database's message.
 */
export function AutomationEditor({
  tenantId,
  automationKey,
  onDone,
}: {
  tenantId: string | null;
  automationKey: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const key = asAutomationKey(automationKey);
  const { data } = useCarmenTasks(tenantId);
  const row = data?.rows.find((r) => r.key === `automation:${automationKey}`);
  const save = useMutation({
    mutationFn: (enabled: boolean) => {
      if (!tenantId || !key) {
        throw new Error("אין ארגון או אוטומציה");
      }
      return setAutomationEnabled(tenantId, key, enabled);
    },
    onSuccess: (_, enabled) => {
      qc.invalidateQueries({ queryKey: carmenTasksKey(tenantId) });
      toast.success(enabled ? "האוטומציה הופעלה" : "האוטומציה כובתה לארגון");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!key) {
    return <p className="text-sm text-muted-foreground">האוטומציה לא נמצאה.</p>;
  }
  const meta = automationMeta(key);
  const enabled = row?.enabled ?? true;

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
        </div>
        <Switch
          checked={enabled}
          disabled={save.isPending}
          onCheckedChange={(on) => save.mutate(on)}
          aria-label={enabled ? "כיבוי" : "הפעלה"}
        />
      </div>

      <Button variant="outline" onClick={onDone}>
        חזרה למשימות
      </Button>
    </div>
  );
}
