/**
 * When an auto-resync may run (AIO-238): never inside the scheduled sync and
 * pulse refresh windows, and never so close to one that it would race the
 * scheduled sync's delete + insert on the same table.
 */

/**
 * Sync + snapshot refresh windows (UTC): syncs run 02:40–02:50 and
 * 11:40–11:50, the pulse refresh at 04:00 and 13:00. These mirror the DB cron
 * schedules by hand.
 */
export const REFRESH_WINDOWS_UTC: Array<[number, number]> = [
  [2 * 60 + 30, 4 * 60 + 30],
  [11 * 60 + 30, 13 * 60 + 30],
];

/** A resync must also finish before the next refresh window starts. */
export const RESYNC_LEAD_MS = 30 * 60_000;

/** True when a resync started at `now` stays clear of every refresh window. */
export function resyncAllowedAt(now: Date): boolean {
  return (
    !insideRefreshWindow(now) &&
    !insideRefreshWindow(new Date(now.getTime() + RESYNC_LEAD_MS))
  );
}

/** True when `now` falls inside a refresh window. */
export function insideRefreshWindow(now: Date): boolean {
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  return REFRESH_WINDOWS_UTC.some(
    ([from, to]) => minute >= from && minute < to,
  );
}
