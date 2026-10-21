// CRM filter helpers shared by the bulk sources and the single-entity match.
import type { Json } from "../database.types.ts";
import { fetchAll, hasItems } from "./query.ts";
import type { AudienceFilter, Db } from "./types.ts";

/** Ids of leads / clients carrying one of the filter's tags (null: no tag filter). */
export async function tagFilteredIds(
  db: Db,
  tenantId: string,
  filter: AudienceFilter,
  col: "client_id" | "lead_id",
): Promise<Set<string> | null> {
  const tagIds = filter.tagIds;
  if (!hasItems(tagIds)) return null;
  const rows = await fetchAll(() =>
    db
      .from("chat_contact_tags")
      .select("client_id, lead_id")
      .eq("tenant_id", tenantId)
      .in("tag_id", tagIds)
      .not(col, "is", null),
  );
  return new Set(rows.map((r) => r[col]).filter((id): id is string => !!id));
}

export function applyTagFilter<T extends { id: string }>(
  rows: T[],
  tagged: Set<string> | null,
  mode: string | undefined,
): T[] {
  if (!tagged) return rows;
  return rows.filter((r) =>
    mode === "exclude" ? !tagged.has(r.id) : tagged.has(r.id),
  );
}

/** Does a client's `services` jsonb array contain one of the tags? */
export function hasServiceTag(services: Json | null, tags: string[]): boolean {
  return (Array.isArray(services) ? services : []).some(
    (s) => typeof s === "string" && tags.includes(s),
  );
}
