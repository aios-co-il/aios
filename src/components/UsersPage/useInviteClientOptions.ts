import { skipToken, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** A client the inviter can put a new campaigner on. */
export interface InviteClientOption {
  id: string;
  name: string;
  agency_id: string | null;
}

/**
 * The organization's own clients, for assigning them to a new campaigner.
 * invite-user only assigns clients of the inviting tenant, so shared-agency
 * clients from other tenants are left out here too.
 */
export function useInviteClientOptions(
  tenantId: string | null | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["clients", "invite-options", tenantId],
    queryFn:
      tenantId && enabled ? () => fetchTenantClients(tenantId) : skipToken,
  });
}

/** Clients by name; ended clients are not offered. */
async function fetchTenantClients(
  tenantId: string,
): Promise<Array<InviteClientOption>> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, agency_id")
    .eq("tenant_id", tenantId)
    .neq("status", "ended")
    .order("name");
  if (error) {
    throw error;
  }
  return data ?? [];
}
