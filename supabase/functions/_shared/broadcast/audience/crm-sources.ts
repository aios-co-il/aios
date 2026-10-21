// CRM sources: leads and clients matching an audience filter. Matching is
// owned by the database (broadcast_matching_entity_ids); this module loads
// the matched rows and turns them into recipients.
import { loadLookups } from "./lookups.ts";
import { fetchAll, fetchByIds } from "./query.ts";
import {
  CLIENT_COLUMNS,
  clientRecipient,
  LEAD_COLUMNS,
  leadRecipient,
} from "./records.ts";
import type { AudienceDb, AudienceFilter, Recipient } from "./types.ts";

/** Ids of the tenant's leads / clients matching the filter, oldest first. */
function matchingIds(
  db: AudienceDb,
  tenantId: string,
  entityType: "lead" | "client",
  f: AudienceFilter,
): Promise<string[]> {
  return fetchAll(() =>
    db.rpc("broadcast_matching_entity_ids", {
      p_tenant_id: tenantId,
      p_entity_type: entityType,
      p_filter: f,
    }),
  );
}

/** Rows in the order of `ids` (the RPC's created_at, id order). */
function inIdOrder<T extends { id: string }>(ids: string[], rows: T[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

export async function resolveLeads(
  db: AudienceDb,
  tenantId: string,
  f: AudienceFilter,
): Promise<Recipient[]> {
  const ids = await matchingIds(db, tenantId, "lead", f);
  const rows = await fetchByIds(ids, (chunk) =>
    db
      .from("leads")
      .select(LEAD_COLUMNS)
      .eq("tenant_id", tenantId)
      .in("id", chunk),
  );
  const lk = await loadLookups(db, tenantId, []);
  return inIdOrder(ids, rows).map((l) => leadRecipient(l, lk));
}

export async function resolveClients(
  db: AudienceDb,
  tenantId: string,
  f: AudienceFilter,
): Promise<Recipient[]> {
  const ids = await matchingIds(db, tenantId, "client", f);
  const rows = await fetchByIds(ids, (chunk) =>
    db
      .from("clients")
      .select(CLIENT_COLUMNS)
      .eq("tenant_id", tenantId)
      .in("id", chunk),
  );
  const lk = await loadLookups(db, tenantId, ids);
  return inIdOrder(ids, rows).map((c) => clientRecipient(c, lk));
}
