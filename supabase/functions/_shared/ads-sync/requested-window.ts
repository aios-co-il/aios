/**
 * The window a manual ads sync (Meta insights, Meta ecommerce, Google Ads)
 * fetches and replaces.
 *
 * A caller may name the days in the body (`start_date` / `end_date`,
 * `yyyy-MM-dd`, both inclusive). Since the delete is bounded to the fetched
 * days (resolvePruneRange), a short or past window replaces only those days,
 * so the report screen can sync exactly the range it shows, 30 days per
 * request. Without a window the sync keeps the legacy 120-day pull for older
 * clients.
 */
import {
  jerusalemToday,
  resolveAdsSyncWindow,
  shiftDateString,
  toDateString,
  type SyncWindow,
} from "../report-sync-window.ts";

/**
 * Longest window one user request may name: a 31-day, three-level Meta read
 * for a large account fits in the 150 s edge limit, a 120-day one does not.
 */
export const MAX_REQUESTED_WINDOW_DAYS = 31;

export type ManualSyncWindow =
  | { ok: true; window: SyncWindow; explicit: boolean }
  | { ok: false; error: string };

type RequestedWindow =
  | { kind: "none" }
  | { kind: "window"; window: SyncWindow }
  | { kind: "invalid"; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The window this run fetches: the body's window when it names one, else the
 * legacy window (the table's `date_range` widened by resolveAdsSyncWindow).
 * Internal callers (crons, reconcile resync) keep their longer catch-up
 * windows, so only user requests get the today and length limits.
 */
export function resolveManualSyncWindow(
  body: { start_date?: unknown; end_date?: unknown },
  options: { configured: SyncWindow; internal: boolean; now?: Date },
): ManualSyncWindow {
  const now = options.now ?? new Date();
  const requested = parseRequestedWindow(body, {
    today: jerusalemToday(now),
    enforceLimits: !options.internal,
  });
  if (requested.kind === "invalid") {
    return { ok: false, error: requested.error };
  }
  if (requested.kind === "window") {
    return { ok: true, window: requested.window, explicit: true };
  }
  return {
    ok: true,
    window: resolveAdsSyncWindow(options.configured, toDateString(now)),
    explicit: false,
  };
}

/**
 * Validate `start_date` / `end_date`: both or neither, real calendar dates,
 * start not after end and, with `enforceLimits`, ending no later than today
 * (Israel) and at most MAX_REQUESTED_WINDOW_DAYS long.
 */
export function parseRequestedWindow(
  body: { start_date?: unknown; end_date?: unknown },
  options: { today: string; enforceLimits: boolean },
): RequestedWindow {
  const start = body.start_date;
  const end = body.end_date;
  if (isAbsent(start) && isAbsent(end)) {
    return { kind: "none" };
  }
  if (!isCalendarDate(start) || !isCalendarDate(end)) {
    return {
      kind: "invalid",
      error: "start_date and end_date must both be yyyy-MM-dd dates",
    };
  }
  if (start > end) {
    return { kind: "invalid", error: "start_date must not be after end_date" };
  }
  if (!options.enforceLimits) {
    return { kind: "window", window: { startDate: start, endDate: end } };
  }
  if (end > options.today) {
    return {
      kind: "invalid",
      error: `end_date must not be after today (${options.today})`,
    };
  }
  const lastAllowedEnd = shiftDateString(start, MAX_REQUESTED_WINDOW_DAYS - 1);
  if (end > lastAllowedEnd) {
    return {
      kind: "invalid",
      error: `A sync request covers at most ${MAX_REQUESTED_WINDOW_DAYS} days; split the range into shorter windows`,
    };
  }
  return { kind: "window", window: { startDate: start, endDate: end } };
}

/** Missing, null or blank: the caller named no window. */
function isAbsent(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

/** A `yyyy-MM-dd` string naming a real day (no 2026-02-30). */
function isCalendarDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ISO_DATE.test(value) &&
    shiftDateString(value, 0) === value
  );
}
