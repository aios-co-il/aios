import type { UnknownObject } from "./lead-json.ts";

/** The value when it is a non-empty string, otherwise null. */
export const nonEmptyStringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value ? value : null;

/** sales_person_ids, or the legacy single sales_person_id, as ids. */
export function salesPersonIdsOf(formMapping: UnknownObject): string[] {
  const ids = formMapping.sales_person_ids || formMapping.sales_person_id;
  const list = Array.isArray(ids) ? ids : ids ? [ids] : [];
  return list.filter((id): id is string => typeof id === "string");
}
