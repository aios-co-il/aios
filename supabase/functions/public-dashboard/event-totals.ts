import type { Tables } from "../_shared/database.types.ts";
import { jsonField } from "../_shared/crm-json.ts";
/**
 * The GA sync writes one row per event per day (`report_type: event_total`)
 * and per event, day and source (`event_source`), which can pass the shared
 * link's 4,000-row cap on an Analytics table. The site events tab sums these
 * rows, so they are read on their own, by date, without that cap.
 */

/** The GA report types the site events tab sums. */
export const EVENT_REPORT_TYPES = ["event_total", "event_source"];

/** A crm_records row as the shared link reads it. */
export type SharedRecordRow = Pick<
  Tables<"crm_records">,
  "id" | "data" | "created_at"
>;

/** Reads one page of a table's event rows in a date window. */
export type LoadEventTotalsPage = (
  from: number,
  to: number,
) => PromiseLike<{
  data: Array<SharedRecordRow> | null;
  error: { message?: string } | null;
}>;

const PAGE_SIZE = 1000;

/** At most 20,000 rows: about 60 events a day for a year. */
const MAX_PAGES = 20;

/** Every event row the loader returns, page by page. */
export async function fetchEventTotals(
  loadPage: LoadEventTotalsPage,
): Promise<Array<SharedRecordRow>> {
  const rows: Array<SharedRecordRow> = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await loadPage(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error(
        "[public-dashboard] event totals read failed:",
        error.message,
      );
      break;
    }
    if (!data || data.length === 0) {
      break;
    }
    rows.push(...data);
    if (data.length < PAGE_SIZE) {
      break;
    }
  }
  return rows;
}

/**
 * The capped table read with its event rows replaced by the full read, so
 * each event row appears once.
 */
export function withFullEventTotals(
  capped: Array<SharedRecordRow>,
  eventTotals: Array<SharedRecordRow>,
): Array<SharedRecordRow> {
  return [
    ...capped.filter(
      (row) =>
        !EVENT_REPORT_TYPES.includes(
          String(jsonField(row.data, "report_type") ?? ""),
        ),
    ),
    ...eventTotals,
  ];
}
