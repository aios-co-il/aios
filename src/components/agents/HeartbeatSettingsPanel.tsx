import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Heart,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { MANAGER_ROUND_RUN_KIND } from "../../../supabase/functions/_shared/manager-round/run-kind.ts";
import { PulseAlertRulesButton } from "./PulseAlertRulesButton";
import { CarmenReportRecipientsSection } from "./CarmenReportRecipients/CarmenReportRecipientsSection";

const DEFAULT_ALLOWED_ACTIONS = ["reminders", "status_update", "daily_summary"];

const ALLOWED_ACTION_OPTIONS = [
  { key: "reminders", label: "תזכורות WhatsApp", icon: "💬" },
  { key: "status_update", label: "עדכון סטטוס", icon: "🔄" },
  { key: "daily_summary", label: "סיכום יומי", icon: "📊" },
];

// Generated Supabase types lag behind the pulse delivery/rules columns.
type HeartbeatSettingsRow = Tables<"tenant_heartbeat_settings"> & {
  campaign_pulse_deliver_to_campaigners?: boolean | null;
  campaign_pulse_deliver_to_team_managers?: boolean | null;
  pulse_alert_rules?: unknown;
};

type HeartbeatSettingsInput = {
  enabled: boolean;
  interval_hours: number;
  active_hours_start: number;
  active_hours_end: number;
  allowed_actions: string[];
  campaign_pulse_enabled?: boolean;
  campaign_pulse_deliver_to_campaigners?: boolean;
  campaign_pulse_deliver_to_team_managers?: boolean;
  // The full stored JSON: alert rules plus keys this screen does not edit.
  pulse_alert_rules?: Record<string, unknown>;
};

/**
 * Carmen heartbeat settings (tenant_heartbeat_settings) + recent heartbeat runs.
 * Self-contained: resolves the tenant itself, has no page chrome and no
 * viewport-height containers, so it can live in a page tab or a side panel.
 */
export function HeartbeatSettingsPanel() {
  const { tenantId } = useCurrentTenant();
  const queryClient = useQueryClient();

  const { data: heartbeatSettings } = useQuery({
    queryKey: ["heartbeat_settings", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("tenant_heartbeat_settings")
        .select("*")
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      return data as HeartbeatSettingsRow | null;
    },
    enabled: !!tenantId,
  });

  const { data: heartbeatLogs = [] } = useQuery({
    queryKey: ["heartbeat_logs", tenantId],
    queryFn: tenantId
      ? async () => {
          const { data, error } = await supabase
            .from("heartbeat_logs")
            .select("*")
            .eq("tenant_id", tenantId)
            // Carmen's manager round logs every run; this list is the heartbeat's.
            .neq("run_kind", MANAGER_ROUND_RUN_KIND)
            .order("triggered_at", { ascending: false })
            .limit(10);
          if (error) {
            throw error;
          }
          return data;
        }
      : skipToken,
  });

  const saveHeartbeatSettings = useMutation({
    mutationFn: async (settings: HeartbeatSettingsInput) => {
      const { error } = await supabase
        .from("tenant_heartbeat_settings")
        .upsert({
          tenant_id: tenantId!,
          ...settings,
          updated_at: new Date().toISOString(),
        } as TablesInsert<"tenant_heartbeat_settings">);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["heartbeat_settings", tenantId],
      });
      toast.success("הגדרות Heartbeat נשמרו");
    },
    onError: () => toast.error("שגיאה בשמירת הגדרות"),
  });

  const allowedActions =
    (heartbeatSettings?.allowed_actions as string[]) || DEFAULT_ALLOWED_ACTIONS;

  // Fields sent with every save (same fallbacks as the stored defaults).
  const coreSettings = () => ({
    enabled: heartbeatSettings?.enabled || false,
    interval_hours: heartbeatSettings?.interval_hours || 8,
    active_hours_start: heartbeatSettings?.active_hours_start || 7,
    active_hours_end: heartbeatSettings?.active_hours_end || 22,
    allowed_actions: allowedActions,
  });

  // Campaign pulse fields, sent by the campaign-pulse controls only.
  const campaignPulseSettings = () => ({
    campaign_pulse_enabled: heartbeatSettings?.campaign_pulse_enabled || false,
  });

  const campaignPulseDelivery = () => ({
    campaign_pulse_deliver_to_campaigners:
      heartbeatSettings?.campaign_pulse_deliver_to_campaigners === true,
    campaign_pulse_deliver_to_team_managers:
      heartbeatSettings?.campaign_pulse_deliver_to_team_managers === true,
  });

  return (
    <div className="space-y-4" dir="rtl">
      {/* Heartbeat Settings */}
      <div className="bg-muted/30 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Heart className="h-4 w-4 text-red-500" />
            הגדרות Heartbeat
          </h3>
          <Switch
            checked={heartbeatSettings?.enabled || false}
            onCheckedChange={(enabled) => {
              saveHeartbeatSettings.mutate({ ...coreSettings(), enabled });
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          כרמן סוקרת אוטומטית משימות פתוחות, מזהה חסומות, ושולחת תזכורות
        </p>

        <div className="rounded-lg border bg-background p-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Label className="text-xs font-medium">
                בדיקת דופק שבועית + קישור לדשבורד (ראשון 07:30)
              </Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                נתוני הדשבורד מתרעננים פעמיים ביום (07:00, 16:00) **בלי WA**.
                בראשון 07:30 — דופק (WA) + תקינות (WA); קמפיינרים scoped מכרמן
                הארגון.
              </p>
            </div>
            <Switch
              className="shrink-0"
              checked={heartbeatSettings?.campaign_pulse_enabled || false}
              onCheckedChange={(campaignPulseEnabled) => {
                saveHeartbeatSettings.mutate({
                  ...coreSettings(),
                  ...campaignPulseSettings(),
                  campaign_pulse_enabled: campaignPulseEnabled,
                });
              }}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2">
              <div className="min-w-0">
                <Label className="text-xs font-medium">שליחה לקמפיינרים</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  דופק scoped לפי client_team
                </p>
              </div>
              <Switch
                className="shrink-0"
                checked={
                  heartbeatSettings?.campaign_pulse_deliver_to_campaigners ===
                  true
                }
                onCheckedChange={(deliverToCampaigners) => {
                  saveHeartbeatSettings.mutate({
                    ...coreSettings(),
                    ...campaignPulseSettings(),
                    ...campaignPulseDelivery(),
                    campaign_pulse_deliver_to_campaigners: deliverToCampaigners,
                  });
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2">
              <div className="min-w-0">
                <Label className="text-xs font-medium">שליחה למנהלי PMM</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  דופק scoped לפי סוכנות — כבוי כברירת מחדל
                </p>
              </div>
              <Switch
                className="shrink-0"
                checked={
                  heartbeatSettings?.campaign_pulse_deliver_to_team_managers ===
                  true
                }
                onCheckedChange={(deliverToManagers) => {
                  saveHeartbeatSettings.mutate({
                    ...coreSettings(),
                    ...campaignPulseSettings(),
                    ...campaignPulseDelivery(),
                    campaign_pulse_deliver_to_team_managers: deliverToManagers,
                  });
                }}
              />
            </div>
          </div>
          <CarmenReportRecipientsSection />
          <PulseAlertRulesButton
            stored={heartbeatSettings?.pulse_alert_rules}
            saving={saveHeartbeatSettings.isPending}
            save={(pulseAlertRules, onSuccess) =>
              saveHeartbeatSettings.mutate(
                {
                  ...coreSettings(),
                  ...campaignPulseSettings(),
                  pulse_alert_rules: pulseAlertRules,
                },
                // The mutation's own onError shows a failure.
                { onSuccess },
              )
            }
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">תדירות (שעות)</Label>
            <Select
              value={String(heartbeatSettings?.interval_hours || 8)}
              onValueChange={(v) => {
                saveHeartbeatSettings.mutate({
                  ...coreSettings(),
                  interval_hours: parseInt(v),
                });
              }}
            >
              <SelectTrigger className="h-8 text-xs mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="4">כל 4 שעות</SelectItem>
                <SelectItem value="8">כל 8 שעות</SelectItem>
                <SelectItem value="12">כל 12 שעות</SelectItem>
                <SelectItem value="24">פעם ביום</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">שעת התחלה</Label>
            <Input
              type="number"
              min={0}
              max={23}
              value={heartbeatSettings?.active_hours_start || 7}
              onChange={(e) => {
                saveHeartbeatSettings.mutate({
                  ...coreSettings(),
                  active_hours_start: parseInt(e.target.value),
                });
              }}
              className="h-8 text-xs mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">שעת סיום</Label>
            <Input
              type="number"
              min={0}
              max={23}
              value={heartbeatSettings?.active_hours_end || 22}
              onChange={(e) => {
                saveHeartbeatSettings.mutate({
                  ...coreSettings(),
                  active_hours_end: parseInt(e.target.value),
                });
              }}
              className="h-8 text-xs mt-1"
            />
          </div>
        </div>

        <div>
          <Label className="text-xs mb-2 block">פעולות מותרות</Label>
          <div className="flex flex-wrap gap-2">
            {ALLOWED_ACTION_OPTIONS.map((action) => {
              const isActive = allowedActions.includes(action.key);
              return (
                <button
                  key={action.key}
                  type="button"
                  onClick={() => {
                    const newActions = isActive
                      ? allowedActions.filter((a: string) => a !== action.key)
                      : [...allowedActions, action.key];
                    saveHeartbeatSettings.mutate({
                      ...coreSettings(),
                      allowed_actions: newActions,
                    });
                  }}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                    isActive
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-muted border-border text-muted-foreground"
                  }`}
                >
                  {action.icon} {action.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Heartbeat Logs */}
      <div className="bg-muted/30 rounded-xl p-4">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4" />
          הרצות אחרונות
        </h3>
        {heartbeatLogs.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            אין הרצות עדיין
          </p>
        ) : (
          <div className="space-y-2">
            {heartbeatLogs.map((log: any) => (
              <div
                key={log.id}
                className="border rounded-lg p-3 bg-background text-xs space-y-1"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-medium">
                    {format(new Date(log.triggered_at), "dd/MM/yyyy HH:mm")}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {log.tasks_reviewed} משימות נסקרו
                  </Badge>
                </div>
                <p className="text-muted-foreground whitespace-pre-wrap break-words">
                  {log.summary}
                </p>
                {log.actions_taken &&
                  (log.actions_taken as any[]).length > 0 && (
                    <div className="mt-1 pt-1 border-t">
                      {(log.actions_taken as any[]).map(
                        (action: any, i: number) => (
                          <div
                            key={i}
                            className="flex items-center gap-1 text-[11px]"
                          >
                            {action.type === "reminder_sent" ? (
                              <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                            ) : action.type === "stale_task_released" ? (
                              <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                            ) : (
                              <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                            )}
                            <span className="min-w-0 truncate">
                              {action.task_title || action.type}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
