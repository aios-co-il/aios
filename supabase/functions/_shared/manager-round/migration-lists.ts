/**
 * Test helper: reads value lists out of the manager round migration, so the
 * TypeScript copies of SQL lists are pinned to the database's own.
 */

export const MANAGER_ROUND_MIGRATION = new URL(
  "../../../migrations/20261101100000_carmen_manager_round.sql",
  import.meta.url,
);

/**
 * The quoted values of the first `<marker> ( ... )` list after `anchor`;
 * throws when either is missing, so a pin never reads the wrong list.
 */
export function quotedList(
  sql: string,
  anchor: string,
  marker: string,
): string[] {
  const from = sql.indexOf(anchor);
  const at = from < 0 ? -1 : sql.indexOf(marker, from);
  if (at < 0) {
    throw new Error(`migration list not found: ${anchor} ${marker}`);
  }
  const open = at + marker.length;
  const close = sql.indexOf(")", open);
  return [...sql.slice(open, close).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}
