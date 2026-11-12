import {
  getJerusalemDashboardDateRange,
  jerusalemDateRangeToIso,
} from "../_shared/calendarTimeZone.ts";
import { sharedDashboardDateRange } from "../_shared/share-links/shared-dashboard-range.ts";

/** The days a share link reads: a preset, or a custom window. */
export type DashboardWindow = {
  /** The preset, or "custom" for a window the request named. */
  dateFilter: string;
  /** yyyy-MM-dd, both ends inclusive; null for all time. */
  startDate: string | null;
  endDate: string | null;
};

export type RequestRange =
  { ok: true; window: DashboardWindow } | { ok: false; error: string };

/**
 * The longest custom window a share link serves: a year plus the previous
 * period's slack, so a "last 365 days" comparison still fits.
 */
export const MAX_CUSTOM_RANGE_DAYS = 400;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The window a request asks for. `custom_start` and `custom_end` (both, as
 * yyyy-MM-dd) name a window and win over `date_filter`; otherwise the preset
 * reads as every report on the link reads it.
 */
export function parseRequestRange(params: URLSearchParams): RequestRange {
  const customStart = params.get("custom_start");
  const customEnd = params.get("custom_end");
  if (customStart === null && customEnd === null) {
    const dateFilter = params.get("date_filter") || "last_30_days";
    return {
      ok: true,
      window: { dateFilter, ...sharedDashboardDateRange(dateFilter) },
    };
  }
  const error = customWindowError(customStart, customEnd);
  if (error) {
    return { ok: false, error };
  }
  return {
    ok: true,
    window: {
      dateFilter: "custom",
      startDate: customStart,
      endDate: customEnd,
    },
  };
}

/** The WooCommerce order window, as Jerusalem day bounds in UTC ISO. */
export function wooWindowIso(range: DashboardWindow): {
  start: string | null;
  end: string | null;
} {
  const days = getJerusalemDashboardDateRange(
    range.dateFilter,
    new Date(),
    range.startDate,
    range.endDate,
  );
  return days.startDate && days.endDate
    ? jerusalemDateRangeToIso(days.startDate, days.endDate)
    : { start: null, end: null };
}

/** Why a custom window is refused, or null when it is valid. */
function customWindowError(
  start: string | null,
  end: string | null,
): string | null {
  if (!start || !end) {
    return "custom_start and custom_end go together";
  }
  const startMs = dayMs(start);
  const endMs = dayMs(end);
  if (startMs === null || endMs === null) {
    return "custom_start and custom_end must be yyyy-MM-dd dates";
  }
  if (startMs > endMs) {
    return "custom_start is after custom_end";
  }
  if ((endMs - startMs) / DAY_MS + 1 > MAX_CUSTOM_RANGE_DAYS) {
    return `custom window is longer than ${MAX_CUSTOM_RANGE_DAYS} days`;
  }
  return null;
}

/** A yyyy-MM-dd calendar day as UTC milliseconds; null when it is not one. */
function dayMs(day: string): number | null {
  if (!ISO_DAY.test(day)) {
    return null;
  }
  const ms = Date.parse(`${day}T00:00:00Z`);
  // Date.parse rolls 2026-02-30 over to March; a real day survives the round trip.
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== day) {
    return null;
  }
  return ms;
}
