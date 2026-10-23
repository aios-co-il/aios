import { useMemo } from "react";
import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { COMMAND_CENTER_ACCESS_KEY } from "@/components/carmen-command/access";
import { fetchCarmenAgentId } from "@/components/carmen-command/carmenAccessApi";
import type { AccessRow, AccessPatch, Route } from "./types";

/**
 * Brain routes, permission rows and the save mutation for the הרשאות tab.
 * Rows are keyed to the tenant's active Carmen, resolved exactly as the edge
 * functions do, so what is saved here is what the server enforces.
 */
export function useCarmenPermissions(tenantId: string | null | undefined) {
  const qc = useQueryClient();

  const agentQuery = useQuery({
    queryKey: ["carmen-active-agent-id", tenantId],
    queryFn: tenantId ? () => fetchCarmenAgentId(tenantId) : skipToken,
  });
  const agentId = agentQuery.data ?? null;

  const routesQuery = useQuery({
    queryKey: ["carmen-perm-routes", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Route[]> => {
      const { data, error } = await supabase
        .from("agent_brain_routes")
        .select("id,slug,label,route_type,provider")
        .eq("tenant_id", tenantId!)
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
    enabled: !!tenantId && !!agentId,
    queryFn: async (): Promise<AccessRow[]> => {
      const { data, error } = await supabase
        .from("carmen_command_center_access")
        .select("id,user_id,enabled,brain_access,dev_escalation_tier")
        .eq("tenant_id", tenantId!)
        .eq("agent_id", agentId!)
        .not("user_id", "is", null);
      if (error) throw error;
      return (data ?? []) as AccessRow[];
    },
  });

  const byUser = useMemo(() => {
    const m = new Map<string, AccessRow>();
    for (const r of rowsQuery.data ?? []) if (r.user_id) m.set(r.user_id, r);
    return m;
  }, [rowsQuery.data]);

  const save = useMutation({
    mutationFn: async (args: { userId: string; patch: AccessPatch | null }) => {
      if (!tenantId || !agentId) throw new Error("לא נמצאה כרמן פעילה");
      const table = supabase.from("carmen_command_center_access");
      const patch = args.patch as Omit<AccessPatch, "brain_access"> & {
        brain_access?: Json;
      };
      const existing = byUser.get(args.userId);
      if (args.patch === null) {
        if (!existing) return;
        const { error } = await table.delete().eq("id", existing.id);
        if (error) throw error;
        return;
      }
      // Select-then-write rather than upsert: the unique index on
      // (tenant_id, agent_id, user_id) is partial, which PostgREST's
      // on_conflict cannot target.
      const { error } = existing
        ? await table
            .update({ ...patch, updated_at: new Date().toISOString() })
            .eq("id", existing.id)
        : await table.insert({
            tenant_id: tenantId,
            agent_id: agentId,
            user_id: args.userId,
            enabled: true,
            // null = every brain; the admin narrows from there.
            brain_access: null,
            ...patch,
          });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rowsKey });
      qc.invalidateQueries({ queryKey: [COMMAND_CENTER_ACCESS_KEY] });
    },
    onError: (e: Error) => toast.error("שמירת ההרשאה נכשלה: " + e.message),
  });

  return {
    routes: routesQuery.data ?? [],
    byUser,
    save,
    loading:
      routesQuery.isLoading || agentQuery.isLoading || rowsQuery.isLoading,
    hasCarmen: agentQuery.isSuccess && !!agentId,
  };
}
