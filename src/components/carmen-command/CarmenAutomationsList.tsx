import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  Loader2,
  Pencil,
  Plus,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import FlowEditor from "@/components/automations/FlowEditor";

// Trigger/step action type of a Carmen WhatsApp session (flow builder).
const CARMEN_SESSION_TYPE = "carmen_whatsapp_session";

type CarmenAutomationRow = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  keywords: string[];
  /** Labels of the WhatsApp connections the Carmen trigger is pinned to. */
  connections: string[];
  /** True when a flow trigger step of type carmen_whatsapp_session exists. */
  hasCarmenTrigger: boolean;
};

type StepConfig = Record<string, unknown>;

function asConfig(value: unknown): StepConfig {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as StepConfig;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as StepConfig;
      }
    } catch {
      // ignore malformed legacy configuration
    }
  }
  return {};
}

function keywordsFromConfig(cfg: StepConfig): string[] {
  if (Array.isArray(cfg.trigger_keywords) && cfg.trigger_keywords.length > 0) {
    return cfg.trigger_keywords
      .map((k: unknown) => String(k ?? "").trim())
      .filter(Boolean);
  }
  return cfg.trigger_keyword ? [String(cfg.trigger_keyword).trim()] : [];
}

// Same label shape as CarmenSessionConfig (StepConfigPanel) uses for connections.
function connectionLabel(c: {
  integration_type: string;
  display_name: string | null;
  instance_id: string | null;
  settings: unknown;
}): string {
  const settings = asConfig(c.settings);
  const displayName =
    c.display_name ||
    settings.display_name ||
    settings.phone_number ||
    settings.display_phone_number ||
    settings.instance_id ||
    c.instance_id;
  const providerLabel =
    c.integration_type === "manus_wa"
      ? "מאנוס"
      : c.integration_type === "meta_whatsapp"
        ? "Meta WhatsApp API"
        : "Green API";
  return displayName ? `${providerLabel} — ${displayName}` : providerLabel;
}

export function CarmenAutomationsList({
  tenantId,
}: {
  tenantId: string | null;
}) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);

  const {
    data: automations = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["carmen-automations", tenantId],
    queryFn: async (): Promise<CarmenAutomationRow[]> => {
      if (!tenantId) return [];

      const [
        { data: autos, error: autosError },
        { data: steps, error: stepsError },
      ] = await Promise.all([
        supabase
          .from("automations")
          .select(
            "id, name, description, active, trigger_type, configuration, created_at",
          )
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false }),
        supabase
          .from("automation_flow_steps")
          .select("automation_id, step_type, configuration")
          .eq("tenant_id", tenantId)
          .eq("action_type", CARMEN_SESSION_TYPE),
      ]);
      if (autosError) throw autosError;
      if (stepsError) throw stepsError;

      const stepsByAutomation = new Map<
        string,
        { step_type: string; configuration: StepConfig }[]
      >();
      for (const s of steps || []) {
        const list = stepsByAutomation.get(s.automation_id) || [];
        list.push({
          step_type: s.step_type,
          configuration: asConfig(s.configuration),
        });
        stepsByAutomation.set(s.automation_id, list);
      }

      // Carmen automations: the flow trigger type (current), the legacy
      // whatsapp_message_received + carmen_session_mode header (as created by
      // Automations.tsx), or any flow step of the Carmen session type.
      const carmenAutos = (autos || []).filter(
        (a) =>
          a.trigger_type === CARMEN_SESSION_TYPE ||
          asConfig(a.configuration).carmen_session_mode === true ||
          stepsByAutomation.has(a.id),
      );

      const integrationIds = [
        ...new Set(
          carmenAutos.flatMap((a) =>
            (stepsByAutomation.get(a.id) || [])
              .map((s) => s.configuration.carmen_integration_id)
              .filter((id): id is string => typeof id === "string" && !!id),
          ),
        ),
      ];
      const labels = new Map<string, string>();
      if (integrationIds.length > 0) {
        const { data: integrations, error: intError } = await supabase
          .from("tenant_integrations")
          .select("id, integration_type, display_name, instance_id, settings")
          .in("id", integrationIds);
        if (intError) throw intError;
        for (const c of integrations || []) {
          labels.set(c.id, connectionLabel(c));
        }
      }

      return carmenAutos.map((a) => {
        const carmenSteps = stepsByAutomation.get(a.id) || [];
        // Trigger steps are what the WhatsApp webhook actually matches on.
        const triggerSteps = carmenSteps.filter(
          (s) => s.step_type === "trigger",
        );
        const sourceSteps = triggerSteps.length ? triggerSteps : carmenSteps;
        const stepKeywords = sourceSteps.flatMap((s) =>
          keywordsFromConfig(s.configuration),
        );
        const keywords = [
          ...new Set(
            stepKeywords.length
              ? stepKeywords
              : keywordsFromConfig(asConfig(a.configuration)),
          ),
        ];
        const connections = [
          ...new Set(
            sourceSteps
              .map((s) => s.configuration.carmen_integration_id)
              .filter((id): id is string => typeof id === "string" && !!id)
              .map(
                (id) => labels.get(id) || `חיבור לא זמין (${id.slice(0, 8)})`,
              ),
          ),
        ];
        return {
          id: a.id,
          name: a.name,
          description: a.description,
          active: a.active ?? true,
          keywords,
          connections,
          hasCarmenTrigger: triggerSteps.length > 0,
        };
      });
    },
    enabled: !!tenantId,
  });

  const invalidateLists = () => {
    queryClient.invalidateQueries({
      queryKey: ["carmen-automations", tenantId],
    });
    queryClient.invalidateQueries({ queryKey: ["automations", tenantId] });
  };

  // Same update as the Automations page toggle (scoped to the active tenant).
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      if (!tenantId) throw new Error("Missing tenant");
      const { error } = await supabase
        .from("automations")
        .update({ active })
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: (_, { active }) => {
      invalidateLists();
      toast.success(active ? "האוטומציה הופעלה" : "האוטומציה הושהתה");
    },
    onError: (err) => {
      toast.error("שגיאה בעדכון האוטומציה", { description: err?.message });
    },
  });

  // Mirrors createCarmenFlowMutation in src/pages/Automations.tsx — the flow is
  // then opened in the embedded editor instead of navigating to its route.
  const createCarmenFlowMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("No tenant");
      const { data, error } = await supabase
        .from("automations")
        .insert({
          name: "שיחת כרמן ב-WhatsApp",
          description:
            'שיחה אינטראקטיבית עם כרמן ב-WhatsApp - מתחילה במילת "כרמן", מסתיימת ב"סיימנו כרמן"',
          tenant_id: tenantId,
          trigger_type: "whatsapp_message_received",
          action_type: "send_greenapi_message",
          configuration: {
            carmen_session_mode: true,
            trigger_keyword: "כרמן",
            end_keyword: "סיימנו כרמן",
          },
          is_flow: true,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      invalidateLists();
      toast.success("נוצרה אוטומציית כרמן", {
        description:
          'בחרו בטריגר "שיחת כרמן ב-WhatsApp", הגדירו מילות הפעלה וחיבור, ושמרו.',
      });
      setEditingId(data.id);
    },
    onError: (err) => {
      toast.error("שגיאה ביצירת האוטומציה", { description: err?.message });
    },
  });

  const closeEditor = () => {
    setEditingId(null);
    invalidateLists();
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          אוטומציות כרמן קובעות מתי כרמן פותחת שיחה ב-WhatsApp: באילו מילות
          הפעלה, דרך איזה חיבור WhatsApp, והאם האוטומציה פעילה. לחיצה על
          &quot;ערוך&quot; פותחת את עורך הפלוו כאן, בלי לצאת מהמסך.
        </p>
      </div>

      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => createCarmenFlowMutation.mutate()}
          disabled={!tenantId || createCarmenFlowMutation.isPending}
        >
          {createCarmenFlowMutation.isPending ? (
            <Loader2 className="h-4 w-4 ml-1 animate-spin" />
          ) : (
            <Plus className="h-4 w-4 ml-1" />
          )}
          אוטומציית כרמן חדשה
        </Button>
      </div>

      {!tenantId ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          לא נבחר ארגון פעיל.
        </p>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            לא הצלחנו לטעון את אוטומציות כרמן.
          </p>
          <p className="text-xs text-muted-foreground font-mono break-all">
            {(error as Error)?.message || "שגיאה לא ידועה"}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            נסה שוב
          </Button>
        </div>
      ) : automations.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Bot className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            עדיין אין אוטומציות כרמן בארגון הזה.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {automations.map((automation) => {
            const togglingThis =
              toggleActiveMutation.isPending &&
              toggleActiveMutation.variables?.id === automation.id;
            return (
              <li
                key={automation.id}
                className={cn(
                  "rounded-lg border p-3 space-y-2 transition-opacity",
                  !automation.active && "opacity-70",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-sm font-semibold truncate">
                      {automation.name}
                    </p>
                    {automation.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {automation.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {automation.active ? "פעיל" : "מושהה"}
                    </span>
                    <Switch
                      checked={automation.active}
                      disabled={togglingThis}
                      onCheckedChange={(checked) =>
                        toggleActiveMutation.mutate({
                          id: automation.id,
                          active: checked,
                        })
                      }
                      aria-label={`הפעלה של ${automation.name}`}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">מילות הפעלה:</span>
                  {automation.keywords.length > 0 ? (
                    automation.keywords.map((keyword) => (
                      <Badge
                        key={keyword}
                        variant="outline"
                        className="text-[11px] font-normal"
                      >
                        {keyword}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground">לא הוגדרו</span>
                  )}
                </div>

                <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Smartphone className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span className="break-words">
                    {automation.connections.length > 0
                      ? automation.connections.join(" · ")
                      : "לא מוצמדת לחיבור WhatsApp מסוים"}
                  </span>
                </div>

                {!automation.hasCarmenTrigger && (
                  <div className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      הטריגר עדיין לא הוגדר בפלוו — כרמן לא תגיב דרך האוטומציה
                      הזו עד שתבחרו טריגר &quot;שיחת כרמן ב-WhatsApp&quot;
                      ותשמרו.
                    </span>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    onClick={() => setEditingId(automation.id)}
                  >
                    <Pencil className="h-3 w-3 ml-1" />
                    ערוך
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={!!editingId}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
      >
        <DialogContent
          dir="rtl"
          className="max-w-[100vw] w-screen h-[100dvh] max-h-[100dvh] p-0 gap-0 overflow-hidden rounded-none sm:rounded-none [&>button:last-child]:hidden"
          // Close only through the editor's own "סגירה" button so unsaved flow
          // edits are not lost to a stray Escape / outside click (e.g. a toast).
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogTitle className="sr-only">עריכת אוטומציית כרמן</DialogTitle>
          <DialogDescription className="sr-only">
            עורך הפלוו של אוטומציית כרמן
          </DialogDescription>
          {editingId && (
            <FlowEditor
              key={editingId}
              automationId={editingId}
              onClose={closeEditor}
              className="flex-1 min-h-0"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
