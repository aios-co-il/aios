import { skipToken, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Whether the viewer owns the tenant for Carmen's manager round (the
 * database's own rule, carmen_manager_is_owner): who may change the manager
 * settings and dismiss findings.
 */
export function useIsManagerOwner(tenantId: string | null) {
  return useQuery({
    queryKey: ["carmen_manager_is_owner", tenantId],
    queryFn: tenantId
      ? async () => {
          const { data, error } = await supabase.rpc(
            "carmen_manager_is_owner",
            { p_tenant_id: tenantId },
          );
          if (error) {
            throw error;
          }
          return data;
        }
      : skipToken,
  });
}
