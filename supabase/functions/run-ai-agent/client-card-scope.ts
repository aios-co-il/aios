// Which tenant may read which client (AIO-232 rule): its own clients, and a
// shared tenant's clients only in the exact agency shared with it. Carmen's
// client tools reuse this so agency sharing never opens a whole tenant.

import type { DbClient } from "../_shared/supabase-clients.ts";

/** The client asked for and the caller's tenant scope. */
export type ClientReadScope = {
  clientId: string;
  tenantId: string;
  /** Tenants that share any agency with the caller (getAccessibleTenantIds). */
  accessibleTenantIds: Array<string>;
};

/**
 * Whether the caller's tenant may read a client's card: the client is its
 * own, or the client's tenant shares the client's agency with it
 * (agency_tenant_access), the rule record_client_card_entry applies to
 * writes. accessibleTenantIds holds every tenant that shares any agency with
 * the caller, so on its own it would also open that tenant's clients in
 * agencies it never shared.
 */
export async function callerCanReadClientCard(
  supabase: Pick<DbClient, "from">,
  input: ClientReadScope,
): Promise<boolean> {
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("tenant_id, agency_id")
    .eq("id", input.clientId)
    .in("tenant_id", input.accessibleTenantIds)
    .maybeSingle();
  if (clientError) {
    throw clientError;
  }
  if (!client) {
    return false;
  }
  if (client.tenant_id === input.tenantId) {
    return true;
  }
  if (!client.tenant_id || !client.agency_id) {
    return false;
  }
  const { data: access, error: accessError } = await supabase
    .from("agency_tenant_access")
    .select("id")
    .eq("accessing_tenant_id", input.tenantId)
    .eq("source_tenant_id", client.tenant_id)
    .eq("agency_id", client.agency_id)
    .limit(1)
    .maybeSingle();
  if (accessError) {
    throw accessError;
  }
  return access !== null;
}
