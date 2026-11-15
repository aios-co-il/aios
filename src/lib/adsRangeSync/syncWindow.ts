import { getDashboardDateRange } from "@/lib/dashboardDateFilters";
import { jerusalemYmd, shiftYmd } from "@/lib/calendarTimeZone";

/**
 * Days per sync request. The edge accepts at most 31 per request
 * (MAX_REQUESTED_WINDOW_DAYS), which a large account's three-level Meta read
 * still finishes inside the 150 s edge limit.
 */
export const ADS_SYNC_PIECE_DAYS = 30;

/** Inclusive `yyyy-MM-dd` days one sync request fetches and replaces. */
export type SyncWindow = { startDate: string; endDate: string };

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
  if (selection.filter === "all") {
    return null;
  }
  if (
    selection.filter === "custom" &&
    !(selection.customStart && selection.customEnd)
  ) {
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
  const local = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const israel = jerusalemYmd(now);
  return local < israel ? local : israel;
}
