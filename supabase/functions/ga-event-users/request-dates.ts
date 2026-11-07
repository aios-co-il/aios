import { sharedDashboardDateRange } from "../_shared/share-links/shared-dashboard-range.ts";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The period to read. A share link sends its date filter and gets the same
 * dates as the link's other reports; the signed-in dashboard sends the dates
 * it computed. Missing dates mean all time.
 */
export function requestDates(body: {
  share_token?: unknown;
  date_filter?: unknown;
  start_date?: unknown;
  end_date?: unknown;
}): { startDate: string; endDate: string } {
  const range =
    typeof body.share_token === "string"
      ? sharedDashboardDateRange(
          typeof body.date_filter === "string"
            ? body.date_filter
            : "last_30_days",
        )
      : {
          startDate: isoDate(body.start_date),
          endDate: isoDate(body.end_date),
        };
  return {
    startDate: range.startDate ?? "2020-01-01",
    endDate: range.endDate ?? "today",
  };
}

/** A yyyy-mm-dd string, else null. */
function isoDate(value: unknown): string | null {
  return typeof value === "string" && ISO_DATE.test(value) ? value : null;
}
