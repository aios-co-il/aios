import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { AccessRow, AccessPatch, Route } from "./types";

/** Brain routes, permission rows and the save mutation for the הרשאות tab. */
export function useCarmenPermissions(
  tenantId: string | null | undefined,
  agentId: string,
) {
  const qc = useQueryClient();

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

  const rowsKey = ["carmen-perm-rows", tenantId, agentId];
  const rowsQuery = useQuery({
    queryKey: rowsKey,
    enabled: !!tenantId,
    queryFn: async (): Promise<AccessRow[]> => {
      const { data, error } = await (supabase as any)
        .from("carmen_command_center_access")
        .select("id,user_id,enabled,brain_access,dev_escalation_tier")
        .eq("tenant_id", tenantId)
        .eq("agent_id", agentId)
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
    mutationFn: async (args: { userId: string; patch: AccessPatch | null }) => {
      const table = (supabase as any).from("carmen_command_center_access");
      const existing = byUser.get(args.userId);
      if (args.patch === null) {
        if (!existing) return;
        const { error } = await table.delete().eq("id", existing.id);
        if (error) throw error;
        return;
      }
      const { error } = existing
        ? await table
            .update({ ...args.patch, updated_at: new Date().toISOString() })
            .eq("id", existing.id)
        : await table.insert({
            tenant_id: tenantId,
            agent_id: agentId,
            user_id: args.userId,
            enabled: true,
            brain_access: { internal: "full" },
            ...args.patch,
          });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: rowsKey }),
    onError: (e: any) =>
      toast.error("שמירת ההרשאה נכשלה: " + (e?.message || e)),
  });

  return {
    routes: routesQuery.data ?? [],
    byUser,
    save,
    loading: routesQuery.isLoading || rowsQuery.isLoading,
  };
}
