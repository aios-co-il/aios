/**
 * Who speaks for the agency in a client group: the staff roster
 * (chat/roster.ts, the same rule the chat collector reads) of the tenant
 * and of the tenants it shares an agency with, either way, since a
 * partner's campaigner writes in the groups of shared clients. Only the set
 * of tenants is this collector's own; the chat collector reads the tenant
 * and the tenants of the clients in its threads. Kept in memory for
 * labelling, and for naming the staff member who reported a call or meeting
 * (authorship.ts), who must be a login of the client's own tenant.
 */
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { throwIf } from "../../../_shared/manager-round/db-error.ts";
import { loadStaffRoster, type StaffRoster } from "../chat/roster.ts";

/** The roster of the tenant and its agency partners; a Green line's number is the one its rows report since `since`. */
export async function loadGroupStaff(
  db: DbClient,
  tenantId: string,
  since: Date,
): Promise<StaffRoster> {
  return loadStaffRoster(db, await relatedTenants(db, tenantId), since);
}

/** The tenant and the tenants it shares an agency with, either way. */
async function relatedTenants(
  db: DbClient,
  tenantId: string,
): Promise<string[]> {
  const { data, error } = await db
    .from("agency_tenant_access")
    .select("source_tenant_id, accessing_tenant_id")
    .or(`accessing_tenant_id.eq.${tenantId},source_tenant_id.eq.${tenantId}`);
  throwIf(error, "agency_tenant_access");
  const ids = (data ?? []).flatMap((row) => [
    row.source_tenant_id,
    row.accessing_tenant_id,
  ]);
  return [...new Set([tenantId, ...ids])];
}
