import { skipToken, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { OwnedAgencyShare } from "@/lib/taskBoardAgency";

/**
 * Tenants that hold one of the current tenant's own agencies through
 * agency_tenant_access, as (agency, tenant) pairs. The weekly board adds the
 * tasks those tenants stamped on the agency, which the "Own-agency task view
 * across tenants" policy lets this tenant read.
 *
 * The key shares the "cross-tenant-agency-ids" prefix so refreshing shared
 * agencies refreshes these pairs too.
 */
export function useOwnedAgencyShares(
  tenantId: string | null | undefined,
): OwnedAgencyShare[] {
  const { data = [] } = useQuery({
    queryKey: ["cross-tenant-agency-ids", tenantId, "owned-shares"],
    queryFn: tenantId ? () => fetchOwnedAgencyShares(tenantId) : skipToken,
    staleTime: 5 * 60 * 1000,
  });
  return data;
}

/** Reads every share of the tenant's own agencies into another tenant. */
async function fetchOwnedAgencyShares(
  tenantId: string,
): Promise<OwnedAgencyShare[]> {
  const { data, error } = await supabase
    .from("agency_tenant_access")
    .select("agency_id, accessing_tenant_id, agencies!inner(tenant_id)")
    .eq("agencies.tenant_id", tenantId)
    .neq("accessing_tenant_id", tenantId);
  if (error) {
    throw error;
  }
  return data.map((row) => ({
    agencyId: row.agency_id,
    tenantId: row.accessing_tenant_id,
  }));
}
