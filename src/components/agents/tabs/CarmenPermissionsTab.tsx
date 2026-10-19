import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { useUserRole } from "@/hooks/useUserRole";
import { useTeamMembersForMeeting } from "@/hooks/useTeamMembersForMeeting";
import {
  BUGFIX_CAPABLE_PROVIDERS,
  parseLevel,
  type BrainLevel,
} from "../../../../supabase/functions/_shared/carmen-brain-access";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Route = {
  id: string;
  slug: string;
  label: string;
  route_type: string;
  provider: string | null;
};
type AccessRow = {
  id: string;
  user_id: string | null;
  enabled: boolean;
  brain_access: Record<string, unknown>;
  dev_escalation_tier: "full" | "bugfix" | null;
};

const NONE = "none";
const LEVEL_LABEL: Record<string, string> = {
  [NONE]: "אין גישה",
  full: "גישה מלאה",
  bugfix: "תיקונים בלבד",
};

const canBugfix = (r: Route) =>
  r.route_type === "direct_channel" &&
  BUGFIX_CAPABLE_PROVIDERS.includes(String(r.provider || r.slug));

/**
 * Carmen settings → הרשאות: who may use Carmen, which of her brains, and at
 * what level. A member with no row is unrestricted (today's behaviour).
 */
export function CarmenPermissionsTab({ agent }: { agent: { id: string } }) {
  const { tenantId } = useCurrentTenant();
  const qc = useQueryClient();
  const { isOwner, isAgencyOwner, isSuperAdmin, isTeamManager } = useUserRole();
  const canManage = isOwner || isAgencyOwner || isSuperAdmin || isTeamManager;
  const { data: members = [], isLoading: membersLoading } =
    useTeamMembersForMeeting(tenantId);

  const routesQuery = useQuery({
    queryKey: ["carmen-perm-routes", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Route[]> => {
      const { data, error } = await (supabase as any)
        .from("agent_brain_routes")
        .select("id,slug,label,route_type,provider")
        .eq("tenant_id", tenantId)
        .eq("active", true)
        .order("route_type")
        .order("label");
      if (error) throw error;
      return data ?? [];
    },
  });

  const rowsKey = ["carmen-perm-rows", tenantId, agent.id];
  const rowsQuery = useQuery({
    queryKey: rowsKey,
    enabled: !!tenantId,
    queryFn: async (): Promise<AccessRow[]> => {
      const { data, error } = await (supabase as any)
        .from("carmen_command_center_access")
        .select("id,user_id,enabled,brain_access,dev_escalation_tier")
        .eq("tenant_id", tenantId)
        .eq("agent_id", agent.id)
        .not("user_id", "is", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const byUser = useMemo(() => {
    const m = new Map<string, AccessRow>();
    for (const r of rowsQuery.data ?? []) if (r.user_id) m.set(r.user_id, r);
    return m;
  }, [rowsQuery.data]);

  const save = useMutation({
    mutationFn: async (args: {
      userId: string;
      patch: Partial<Omit<AccessRow, "id" | "user_id">> | null;
    }) => {
      const existing = byUser.get(args.userId);
      if (args.patch === null) {
        if (!existing) return;
        const { error } = await (supabase as any)
          .from("carmen_command_center_access")
          .delete()
          .eq("id", existing.id);
        if (error) throw error;
        return;
      }
      if (existing) {
        const { error } = await (supabase as any)
          .from("carmen_command_center_access")
          .update({ ...args.patch, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("carmen_command_center_access")
          .insert({
            tenant_id: tenantId,
            agent_id: agent.id,
            user_id: args.userId,
            enabled: true,
            brain_access: { internal: "full" },
            ...args.patch,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: rowsKey }),
    onError: (e: any) =>
      toast.error("שמירת ההרשאה נכשלה: " + (e?.message || e)),
  });

  const routes = routesQuery.data ?? [];
  const loading =
    membersLoading || routesQuery.isLoading || rowsQuery.isLoading;

  if (loading)
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex items-start gap-2 rounded-lg border p-3 text-right text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>
          לכל איש צוות אפשר לקבוע אם הוא עובד עם כרמן, ובאילו מוחות: גישה מלאה,
          תיקונים בלבד (למוחות קוד כמו Cursor ו-Claude), או בלי גישה. מי שלא
          הוגדר לו כלום עובד כמו היום, בלי הגבלה.
          {!canManage && " רק מנהלים יכולים לשנות הרשאות."}
        </p>
      </div>

      {members.map((m) => {
        const row = byUser.get(m.id);
        const restricted = !!row;
        return (
          <Card key={m.id} className="space-y-3 p-3 text-right">
            <div className="flex items-center gap-2">
              <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.full_name || m.email}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {restricted
                    ? row.enabled
                      ? "הרשאות מוגדרות"
                      : "אין גישה לכרמן"
                    : "ללא הגבלה (ברירת מחדל)"}
                </p>
              </div>
              {restricted ? (
                <>
                  <label className="flex items-center gap-2 text-xs">
                    גישה לכרמן
                    <Switch
                      checked={row.enabled}
                      disabled={!canManage || save.isPending}
                      onCheckedChange={(v) =>
                        save.mutate({ userId: m.id, patch: { enabled: v } })
                      }
                    />
                  </label>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    disabled={!canManage || save.isPending}
                    onClick={() => save.mutate({ userId: m.id, patch: null })}
                  >
                    הסר הגבלות
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={!canManage || save.isPending}
                  onClick={() => save.mutate({ userId: m.id, patch: {} })}
                >
                  הגדרת הרשאות
                </Button>
              )}
            </div>

            {restricted && row.enabled && (
              <div className="grid gap-2 sm:grid-cols-2">
                {routes.map((r) => {
                  const level = parseLevel(row.brain_access?.[r.slug]);
                  return (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
                    >
                      <span className="truncate text-xs">{r.label}</span>
                      <Select
                        dir="rtl"
                        value={level ?? NONE}
                        disabled={!canManage || save.isPending}
                        onValueChange={(v) => {
                          const next = { ...(row.brain_access ?? {}) };
                          if (v === NONE) delete next[r.slug];
                          else next[r.slug] = v as BrainLevel;
                          save.mutate({
                            userId: m.id,
                            patch: { brain_access: next },
                          });
                        }}
                      >
                        <SelectTrigger className="h-7 w-[8.5rem] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>
                            {LEVEL_LABEL[NONE]}
                          </SelectItem>
                          <SelectItem value="full">
                            {LEVEL_LABEL.full}
                          </SelectItem>
                          {canBugfix(r) && (
                            <SelectItem value="bugfix">
                              {LEVEL_LABEL.bugfix}
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between gap-2 rounded-md border border-dashed px-2 py-1.5 sm:col-span-2">
                  <span className="text-xs">משימות פיתוח שכרמן שולחת בשמו</span>
                  <Select
                    dir="rtl"
                    value={row.dev_escalation_tier ?? NONE}
                    disabled={!canManage || save.isPending}
                    onValueChange={(v) =>
                      save.mutate({
                        userId: m.id,
                        patch: {
                          dev_escalation_tier:
                            v === NONE ? null : (v as "full" | "bugfix"),
                        },
                      })
                    }
                  >
                    <SelectTrigger className="h-7 w-[8.5rem] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{LEVEL_LABEL[NONE]}</SelectItem>
                      <SelectItem value="bugfix">
                        {LEVEL_LABEL.bugfix}
                      </SelectItem>
                      <SelectItem value="full">{LEVEL_LABEL.full}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
