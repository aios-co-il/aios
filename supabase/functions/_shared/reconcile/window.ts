/**
 * Which days a run compares: the last complete days in the ad account's own
 * time zone, minus a yesterday that no sync has covered yet (AIO-238).
 */
import { shiftDateString } from "../report-sync-window.ts";
import type { ReconcileTable } from "./types.ts";

export const RECONCILE_WINDOW_DAYS = 7;

export type ReconcileWindow = {
  start: string;
  end: string;
  dates: string[];
  today: string;
  timezone: string;
  timezone_fallback: boolean;
};

/** The `days` complete days ending yesterday in the account's time zone. */
export function completeDaysWindow(
  now: Date,
  timeZone: string | null | undefined,
  days = RECONCILE_WINDOW_DAYS,
): ReconcileWindow {
  const tz = validTimeZone(timeZone);
  const zone = tz || "UTC";
  const today = ymdInTimeZone(now, zone);
  const end = shiftDateString(today, -1);
  const start = shiftDateString(end, -(days - 1));
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    dates.push(shiftDateString(start, i));
  }
  return {
    start,
    end,
    dates,
    today,
    timezone: zone,
    timezone_fallback: !tz,
  };
}

/**
 * Yesterday counts only once a sync ran after it ended in the account's zone.
 * The nightly run starts before the morning sync, so without this every active
 * campaign would show yesterday's partial day as a mismatch. Older days are
 * always compared, so a stalled sync still shows up as missing days.
 *
 * Known sync gap, reported on purpose: the scheduled Meta insights sync
 * (cron-sync-facebook-insights) plans its window by Jerusalem date. For an
 * account far behind Jerusalem (America/*) the morning run stores that
 * account's yesterday while it is still running and the afternoon run starts
 * from the next day, so the day stays partial until the 3-day lookback
 * re-fetches it. Those stored rows really are short, so they show up as spend
 * mismatches until the sync plans by the account's own zone.
 */
export function pendingDates(
  window: ReconcileWindow,
  lastSyncAt: string | null,
): string[] {
  if (!lastSyncAt) {
    return [];
  }
  const dayEnd = zonedDayStart(
    shiftDateString(window.end, 1),
    window.timezone,
  ).getTime();
  return Date.parse(lastSyncAt) < dayEnd ? [window.end] : [];
}

/** Freshest of the column and the settings mirror. */
export function tableLastSyncAt(table: ReconcileTable): string | null {
  const stamps = [
    table.last_sync_at,
    table.integration_settings?.last_sync_at,
  ].filter((s): s is string => typeof s === "string" && !!Date.parse(s));
  if (!stamps.length) {
    return null;
  }
  return stamps.sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}

/** The UTC instant at which `ymd` starts in `timeZone`. */
export function zonedDayStart(ymd: string, timeZone: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d);
  let ts = naive - tzOffsetMs(naive, timeZone);
  ts = naive - tzOffsetMs(ts, timeZone);
  return new Date(ts);
}

/** Calendar date (yyyy-mm-dd) of `now` in `timeZone`. */
export function ymdInTimeZone(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The zone when Intl knows it, else null. */
function validTimeZone(timeZone: string | null | undefined): string | null {
  if (!timeZone) {
    return null;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return timeZone;
  } catch {
    return null;
  }
}

/** How far `timeZone` is ahead of UTC at `instant`, in ms. */
function tzOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value || 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}
