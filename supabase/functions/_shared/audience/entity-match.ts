// Single-entity CRM filter match (sync_mailing_list automation action).
import { hasServiceTag } from "./filters.ts";
import { hasItems, modeMatch, todayIso } from "./query.ts";
import type { AudienceFilter, Db } from "./types.ts";

const inList = (ids: string[] | undefined, v: string | null) =>
  !hasItems(ids) || (v !== null && ids.includes(v));

async function leadMatches(
  db: Db,
  tenantId: string,
  f: AudienceFilter,
  id: string,
): Promise<boolean> {
  const { data: row, error } = await db
    .from("leads")
    .select(
      "id, status, response_status, sales_person_id, agency_id, archived_at",
    )
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (
    !!row &&
    inList(f.agencyIds, row.agency_id) &&
    !row.archived_at &&
    modeMatch(f.stageKeys, f.stageMode, row.status) &&
    modeMatch(f.statusKeys, f.statusMode, row.response_status) &&
    inList(f.salesPersonIds, row.sales_person_id)
  );
}

async function clientMatches(
  db: Db,
  tenantId: string,
  f: AudienceFilter,
  id: string,
): Promise<boolean> {
  const { data: row, error } = await db
    .from("clients")
    .select("id, status, services, agency_id")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!row || !inList(f.agencyIds, row.agency_id)) return false;
  if (!modeMatch(f.statuses, f.statusMode, row.status)) return false;
  if (hasItems(f.serviceTags) && !hasServiceTag(row.services, f.serviceTags))
    return false;
  if (hasItems(f.campaignerIds)) {
    const today = todayIso();
    const { data: team } = await db
      .from("client_team")
      .select("campaigner_id, end_date")
      .eq("client_id", id)
      .in("campaigner_id", f.campaignerIds);
    if (!(team || []).some((t) => !t.end_date || t.end_date >= today))
      return false;
  }
  return true;
}

/**
 * Does one lead / client match a CRM filter right now? Used by the
 * sync_mailing_list automation action to add or remove a single member
 * without resolving the whole audience.
 */
export async function entityMatchesFilter(
  db: Db,
  tenantId: string,
  filter: AudienceFilter,
  entityType: "lead" | "client",
  entityId: string,
): Promise<boolean> {
  if (filter.source !== (entityType === "lead" ? "leads" : "clients"))
    return false;
  const matches =
    entityType === "lead"
      ? await leadMatches(db, tenantId, filter, entityId)
      : await clientMatches(db, tenantId, filter, entityId);
  if (!matches) return false;

  if (hasItems(filter.tagIds)) {
    const col = entityType === "lead" ? "lead_id" : "client_id";
    const { data: tags } = await db
      .from("chat_contact_tags")
      .select("tag_id")
      .eq("tenant_id", tenantId)
      .eq(col, entityId)
      .in("tag_id", filter.tagIds)
      .limit(1);
    const tagged = (tags || []).length > 0;
    if (filter.tagMode === "exclude" ? tagged : !tagged) return false;
  }
  return true;
}
