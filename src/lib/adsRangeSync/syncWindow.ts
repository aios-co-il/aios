import { getDashboardDateRange } from "@/lib/dashboardDateFilters";
import { jerusalemYmd, shiftYmd } from "@/lib/calendarTimeZone";
import { MAX_REQUESTED_WINDOW_DAYS } from "@functions/_shared/ads-sync/requested-window.ts";
import {
  REPORT_MIN_SYNC_DAYS,
  type SyncWindow,
} from "@functions/_shared/report-sync-window.ts";

export type { SyncWindow };

/**
 * Days per sync request: one under the edge's per-request limit
 * (MAX_REQUESTED_WINDOW_DAYS), which a large account's three-level Meta read
 * still finishes inside the 150 s edge limit.
 */
export const ADS_SYNC_PIECE_DAYS = MAX_REQUESTED_WINDOW_DAYS - 1;

/** The date range a report screen shows: a preset, or a custom range. */
export type SyncDateSelection = {
  filter: string;
  customStart?: string | null;
  customEnd?: string | null;
};

/**
 * The days the screen shows for `selection` (getDashboardDateRange, the same
 * resolution the report queries use), ending no later than today. Null when
 * the selection has no bounded range ("all", an unfinished custom range) or
 * lies entirely in the future.
 */
export function resolveSyncWindow(
  selection: SyncDateSelection,
  now: Date = new Date(),
): SyncWindow | null {
  if (!hasBoundedRange(selection)) {
    return null;
  }
  const { startDate, endDate } = getDashboardDateRange(
    selection.filter,
    now,
    selection.customStart,
    selection.customEnd,
  );
  if (!startDate || !endDate) {
    return null;
  }
  const today = latestSyncableDay(now);
  const end = endDate > today ? today : endDate;
  return startDate > end ? null : { startDate, endDate: end };
}

/** False for "all" and for a custom range missing its start or end. */
export function hasBoundedRange(selection: SyncDateSelection): boolean {
  if (selection.filter === "all") {
    return false;
  }
  return (
    selection.filter !== "custom" ||
    !!(selection.customStart && selection.customEnd)
  );
}

/**
 * The window a selection without a bounded range ("all", an unfinished custom
 * range) syncs: the edge's legacy floor, the last REPORT_MIN_SYNC_DAYS days
 * through today, so it can still go out in 30-day pieces.
 */
export function legacySyncWindow(now: Date = new Date()): SyncWindow {
  const endDate = latestSyncableDay(now);
  return {
    startDate: shiftYmd(endDate, -(REPORT_MIN_SYNC_DAYS - 1)),
    endDate,
  };
}

/**
 * Consecutive pieces of at most `pieceDays` days covering `window` with no gap
 * or overlap, newest first so the freshest days land first.
 */
export function splitSyncWindow(
  window: SyncWindow,
  pieceDays: number = ADS_SYNC_PIECE_DAYS,
): Array<SyncWindow> {
  const pieces: Array<SyncWindow> = [];
  let endDate = window.endDate;
  while (endDate >= window.startDate) {
    const earliest = shiftYmd(endDate, -(pieceDays - 1));
    const startDate = earliest < window.startDate ? window.startDate : earliest;
    pieces.push({ startDate, endDate });
    endDate = shiftYmd(startDate, -1);
  }
  return pieces;
}

/**
 * Today on both the browser's and Israel's calendar: the edge rejects a window
 * ending after today in Israel, and the presets count from the local day.
 */
function latestSyncableDay(now: Date): string {
  const israel = jerusalemYmd(now);
  const local = getDashboardDateRange("today", now).startDate ?? israel;
  return local < israel ? local : israel;
}
