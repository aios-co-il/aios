/**
 * Test helper: reads value lists out of the manager round migration, so the
 * TypeScript copies of SQL lists are pinned to the database's own.
 */

export const MANAGER_ROUND_MIGRATION = new URL(
  "../../../migrations/20261027100000_carmen_manager_round.sql",
  import.meta.url,
);

/** The quoted values of the first `<marker> ( ... )` list after `anchor`. */
export function quotedList(
  sql: string,
  anchor: string,
  marker: string,
): string[] {
  const from = sql.indexOf(anchor);
  const open = sql.indexOf(marker, from) + marker.length;
  const close = sql.indexOf(")", open);
  return [...sql.slice(open, close).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}
