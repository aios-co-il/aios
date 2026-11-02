import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { requireTenantId } from "@/lib/requireTenantId";
import type { Tables } from "@/integrations/supabase/types";
import { addToBlacklist } from "../../supabase/functions/_shared/broadcast/blacklist.ts";

export type BlacklistEntry = Tables<"broadcast_opt_outs">;

/** The tenant's mailing blacklist (broadcast_opt_outs): list, add, unblock. */
export function useBroadcastBlacklist() {
  const { tenantId } = useCurrentTenant();
  const qc = useQueryClient();
  const key = ["broadcast-blacklist", tenantId];
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const list = useQuery({
    queryKey: key,
    queryFn: tenantId
      ? async () => {
          const { data, error } = await supabase
            .from("broadcast_opt_outs")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false })
            .limit(1000);
          if (error) throw error;
          return data;
        }
      : skipToken,
  });

  const add = useMutation({
    mutationFn: (address: { phone?: string; email?: string }) =>
      addToBlacklist(
        supabase,
        requireTenantId(tenantId),
        { phones: [address.phone], emails: [address.email] },
        "manual",
      ),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("broadcast_opt_outs")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  return { list, add, remove };
}
