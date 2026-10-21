// CRM sources: leads and clients matching an audience filter.
import { applyTagFilter, hasServiceTag, tagFilteredIds } from "./filters.ts";
import { loadLookups } from "./lookups.ts";
import {
  fetchAll,
  fetchByIds,
  hasItems,
  modeMatch,
  todayIso,
} from "./query.ts";
import {
  CLIENT_COLUMNS,
  clientRecipient,
  LEAD_COLUMNS,
  leadRecipient,
} from "./records.ts";
import type { AudienceFilter, Db, Recipient } from "./types.ts";

export async function resolveLeads(
  db: Db,
  tenantId: string,
  f: AudienceFilter,
): Promise<Recipient[]> {
  let rows = await fetchAll(() => {
    let q = db
      .from("leads")
      .select(LEAD_COLUMNS)
      .eq("tenant_id", tenantId)
      .is("archived_at", null);
    if (hasItems(f.salesPersonIds))
      q = q.in("sales_person_id", f.salesPersonIds);
    if (hasItems(f.agencyIds)) q = q.in("agency_id", f.agencyIds);
    return q.order("created_at", { ascending: true });
  });
  rows = rows.filter(
    (l) =>
      modeMatch(f.stageKeys, f.stageMode, l.status) &&
      modeMatch(f.statusKeys, f.statusMode, l.response_status),
  );
  rows = applyTagFilter(
    rows,
    await tagFilteredIds(db, tenantId, f, "lead_id"),
    f.tagMode,
  );
  const lk = await loadLookups(db, tenantId, []);
  return rows.map((l) => leadRecipient(l, lk));
}

export async function resolveClients(
  db: Db,
  tenantId: string,
  f: AudienceFilter,
): Promise<Recipient[]> {
  let rows = await fetchAll(() => {
    let q = db.from("clients").select(CLIENT_COLUMNS).eq("tenant_id", tenantId);
    if (hasItems(f.agencyIds)) q = q.in("agency_id", f.agencyIds);
    return q.order("created_at", { ascending: true });
  });
  rows = rows.filter((c) => modeMatch(f.statuses, f.statusMode, c.status));
  const serviceTags = f.serviceTags;
  if (hasItems(serviceTags))
    rows = rows.filter((c) => hasServiceTag(c.services, serviceTags));
  if (hasItems(f.campaignerIds)) {
    const team = await fetchByIds(f.campaignerIds, (chunk) =>
      db
        .from("client_team")
        .select("client_id, end_date")
        .in("campaigner_id", chunk),
    );
    const today = todayIso();
    const allowed = new Set(
      team
        .filter((t) => !t.end_date || t.end_date >= today)
        .map((t) => t.client_id),
    );
    rows = rows.filter((c) => allowed.has(c.id));
  }
  rows = applyTagFilter(
    rows,
    await tagFilteredIds(db, tenantId, f, "client_id"),
    f.tagMode,
  );
  const lk = await loadLookups(
    db,
    tenantId,
    rows.map((c) => c.id),
  );
  return rows.map((c) => clientRecipient(c, lk));
}
