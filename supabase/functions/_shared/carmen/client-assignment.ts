/**
 * Whether a `client_team` row assigns the client today (YYYY-MM-DD): started, and not yet
 * ended. Shared by the brain's staff scope and the voice session's scope.
 */
export function isActiveAssignment(
  row: { start_date?: string | null; end_date?: string | null },
  today: string,
): boolean {
  const start = row.start_date?.slice(0, 10) ?? null;
  const end = row.end_date?.slice(0, 10) ?? null;
  return (!start || start <= today) && (!end || end >= today);
}
