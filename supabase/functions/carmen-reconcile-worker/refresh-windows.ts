/**
 * When an auto-resync may run (AIO-238): never inside a scheduled ads sync and
 * its pulse refresh, and never so close to one that it would race the
 * scheduled sync's delete + insert on the same table.
 */
import {
  ADS_SYNC_SCHEDULES,
  dailyRunMinutes,
} from "../_shared/ads-sync/schedules.ts";

/** A refresh window opens this long before a scheduled run starts. */
const WINDOW_BEFORE_RUN_MINUTES = 10;

/**
 * And stays shut this long after it: the batch chain (up to about 20 batches
 * of up to 150 s) and the pulse refresh that follows it.
 */
const WINDOW_AFTER_RUN_MINUTES = 80;

/**
 * Refresh windows (minutes after midnight UTC), one per scheduled run of each
 * ads sync in ADS_SYNC_SCHEDULES; overlapping windows are merged.
 */
export const REFRESH_WINDOWS_UTC: Array<[number, number]> = mergeWindows(
  ADS_SYNC_SCHEDULES.flatMap((job) =>
    dailyRunMinutes(job.cron).map((start): [number, number] => [
      start - WINDOW_BEFORE_RUN_MINUTES,
      start + WINDOW_AFTER_RUN_MINUTES,
    ]),
  ),
);

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

/** Sorted windows with every overlap joined into one. */
function mergeWindows(
  windows: Array<[number, number]>,
): Array<[number, number]> {
  const merged: Array<[number, number]> = [];
  for (const [from, to] of [...windows].sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && from <= last[1]) {
      last[1] = Math.max(last[1], to);
    } else {
      merged.push([from, to]);
    }
  }
  return merged;
}
