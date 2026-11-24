import { sharedDashboardDateRange } from "./shared-dashboard-range.ts";

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

/** The date fields of a share link request, as sent. */
export type RangeQuery = {
  dateFilter: string | null;
  customStart: string | null;
  customEnd: string | null;
};

/** The days a preset reads on one kind of share link. */
export type PresetRange = (filter: string) => {
  startDate: string | null;
  endDate: string | null;
};

/**
 * The longest custom window a share link serves: a year plus the previous
 * period's slack, so a "last 365 days" comparison still fits.
 */
export const MAX_CUSTOM_RANGE_DAYS = 400;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The window a request's query string asks for: `date_filter`, or
 * `custom_start` and `custom_end` (see resolveRequestRange).
 */
export function parseRequestRange(
  params: URLSearchParams,
  presetRange: PresetRange = sharedDashboardDateRange,
): RequestRange {
  return resolveRequestRange(
    {
      dateFilter: params.get("date_filter"),
      customStart: params.get("custom_start"),
      customEnd: params.get("custom_end"),
    },
    presetRange,
  );
}

/**
 * The window a request asks for. A custom start and end (both, as
 * yyyy-MM-dd, in order, at most MAX_CUSTOM_RANGE_DAYS long) name a window and
 * win over the preset; otherwise the preset reads as `presetRange` reads it.
 */
export function resolveRequestRange(
  query: RangeQuery,
  presetRange: PresetRange = sharedDashboardDateRange,
): RequestRange {
  const { customStart, customEnd } = query;
  if (!customStart && !customEnd) {
    const dateFilter = query.dateFilter || "last_30_days";
    return { ok: true, window: { dateFilter, ...presetRange(dateFilter) } };
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

/** Why a custom window is refused, or null when it is valid. */
export function customWindowError(
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
