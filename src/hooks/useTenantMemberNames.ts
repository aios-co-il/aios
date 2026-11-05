import { skipToken, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchTenantMemberNames } from "@/lib/updateAuthor";

/** Query key prefix of the tenant's member names; deactivating or deleting a member invalidates it. */
export const TENANT_MEMBER_NAMES_KEY = "tenant-member-names";

/** Display names of the tenant's members, by user id, for author lines in the update feeds. */
export function useTenantMemberNames(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: [TENANT_MEMBER_NAMES_KEY, tenantId],
    queryFn: tenantId
      ? () => fetchTenantMemberNames(supabase, tenantId)
      : skipToken,
    staleTime: 5 * 60_000,
  });
}
