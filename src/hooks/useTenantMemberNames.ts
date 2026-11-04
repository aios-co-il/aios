import { skipToken, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchTenantMemberNames } from "@/lib/updateAuthor";

/** Display names of the tenant's members, by user id, for author lines in the update feeds. */
export function useTenantMemberNames(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["tenant-member-names", tenantId],
    queryFn: tenantId
      ? () => fetchTenantMemberNames(supabase, tenantId)
      : skipToken,
    staleTime: 5 * 60_000,
  });
}
