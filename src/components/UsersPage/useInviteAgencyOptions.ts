import { skipToken, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** An agency a team card can be linked to. */
export interface InviteAgencyOption {
  id: string;
  name: string;
}

/** The organization's own agencies plus those shared with it, by name. */
export function useInviteAgencyOptions(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["agencies", "invite-options", tenantId],
    queryFn: tenantId ? () => fetchTenantAgencies(tenantId) : skipToken,
  });
}

/** Owned and shared (agency_tenant_access) agencies, without duplicates. */
async function fetchTenantAgencies(
  tenantId: string,
): Promise<Array<InviteAgencyOption>> {
  const [owned, shared] = await Promise.all([
    supabase.from("agencies").select("id, name").eq("tenant_id", tenantId),
    supabase
      .from("agency_tenant_access")
      .select("agencies (id, name)")
      .eq("accessing_tenant_id", tenantId),
  ]);
  if (owned.error) {
    throw owned.error;
  }
  if (shared.error) {
    throw shared.error;
  }

  const byId = new Map<string, InviteAgencyOption>();
  for (const agency of [
    ...(owned.data ?? []),
    ...(shared.data ?? []).map((row) => row.agencies),
  ]) {
    if (agency && !byId.has(agency.id)) {
      byId.set(agency.id, { id: agency.id, name: agency.name });
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "he"));
}
