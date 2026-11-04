import { skipToken, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { OwnedAgencyShare } from "@/lib/taskBoardAgency";

/**
 * Tenants the current tenant shared one of its own agencies with directly
 * through agency_tenant_access, as (agency, tenant) pairs. The weekly board adds the
 * tasks those tenants stamped on the agency, which the "Own-agency task view
 * across tenants" policy lets this tenant read.
 *
 * The key shares the "cross-tenant-agency-ids" prefix so refreshing shared
 * agencies refreshes these pairs too.
 */
export function useOwnedAgencyShares(
  tenantId: string | null | undefined,
): Array<OwnedAgencyShare> {
  const { data } = useQuery({
    queryKey: ["cross-tenant-agency-ids", tenantId, "owned-shares"],
    queryFn: tenantId ? () => fetchOwnedAgencyShares(tenantId) : skipToken,
    staleTime: 5 * 60 * 1000,
  });
  return data ?? NO_SHARES;
}

/**
 * Stable empty result while loading or after an error: a fresh `[]` each
 * render would change the board's filter inputs and re-run its sync effect
 * on every render.
 */
const NO_SHARES: Array<OwnedAgencyShare> = [];

/**
 * Reads the tenant's direct shares of its own agencies into another tenant.
 * Re-shares are left out, as the "Own-agency task view across tenants" policy
 * matches direct shares only.
 */
async function fetchOwnedAgencyShares(
  tenantId: string,
): Promise<Array<OwnedAgencyShare>> {
  const { data, error } = await supabase
    .from("agency_tenant_access")
    .select("agency_id, accessing_tenant_id, agencies!inner(tenant_id)")
    .eq("agencies.tenant_id", tenantId)
    .eq("source_tenant_id", tenantId)
    .neq("accessing_tenant_id", tenantId);
  if (error) {
    console.error("[useOwnedAgencyShares] shares query failed", {
      tenantId,
      error,
    });
    throw error;
  }
  return data.map((row) => ({
    agencyId: row.agency_id,
    tenantId: row.accessing_tenant_id,
  }));
}
