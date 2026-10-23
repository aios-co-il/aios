// Single-entity CRM filter match (sync_mailing_list automation action).
// The predicate lives in the database (broadcast_entity_matches), shared with
// the bulk audience query and the list-sync trigger.
import type { AudienceDb, AudienceFilter } from "./types.ts";

/**
 * Does one lead / client match a CRM filter right now? Used by the
 * sync_mailing_list automation action to add or remove a single member
 * without resolving the whole audience.
 */
export async function entityMatchesFilter(
  db: AudienceDb,
  tenantId: string,
  filter: AudienceFilter,
  entityType: "lead" | "client",
  entityId: string,
): Promise<boolean> {
  if (filter.source !== (entityType === "lead" ? "leads" : "clients"))
    return false;
  const { data, error } = await db.rpc("broadcast_entity_matches", {
    p_tenant_id: tenantId,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_filter: filter,
  });
  if (error) throw error;
  return data === true;
}
