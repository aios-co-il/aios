import { resolveRequestRange } from "../_shared/share-links/request-range.ts";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The period to read; null dates when it is empty. */
export type RequestDates =
  | { ok: true; dates: { startDate: string; endDate: string } | null }
  | { ok: false; error: string };

/**
 * The period to read. A share link sends its date filter, or its custom
 * window, and gets the same dates as the link's other reports; the signed-in
 * dashboard sends the dates it computed. Missing dates mean all time. Null
 * dates when the period is empty, as "this month" is on its first day (it
 * ends yesterday). A share link's custom window that public-dashboard would
 * refuse is refused here too.
 */
export function requestDates(body: {
  share_token?: unknown;
  date_filter?: unknown;
  custom_start?: unknown;
  custom_end?: unknown;
  start_date?: unknown;
  end_date?: unknown;
}): RequestDates {
  let range: { startDate: string | null; endDate: string | null };
  if (typeof body.share_token === "string") {
    const shared = resolveRequestRange({
      dateFilter: textOf(body.date_filter),
      customStart: textOf(body.custom_start),
      customEnd: textOf(body.custom_end),
    });
    if (!shared.ok) {
      return shared;
    }
    range = shared.window;
  } else {
    range = {
      startDate: isoDate(body.start_date),
      endDate: isoDate(body.end_date),
    };
  }
  if (range.startDate && range.endDate && range.startDate > range.endDate) {
    return { ok: true, dates: null };
  }
  return {
    ok: true,
    dates: {
      startDate: range.startDate ?? "2020-01-01",
      endDate: range.endDate ?? "today",
    },
  };
}

/** A yyyy-mm-dd string, else null. */
function isoDate(value: unknown): string | null {
  return typeof value === "string" && ISO_DATE.test(value) ? value : null;
}

/** A string field as sent, else null. */
function textOf(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
