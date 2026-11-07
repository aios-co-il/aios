/**
 * The GA sync writes one row per event per day (`report_type: event_total`),
 * which can pass the shared link's 4,000-row cap on an Analytics table. The
 * site events tab sums these rows, so they are read on their own, by date,
 * without that cap.
 */

/** A crm_records row as the shared link reads it. */
export type SharedRecordRow = {
  id: string;
  data: Record<string, unknown> | null;
  created_at: string;
};

/** Reads one page of a table's event_total rows in a date window. */
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

/** Every event_total row the loader returns, page by page. */
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
 * The capped table read with its event_total rows replaced by the full read,
 * so each event day appears once.
 */
export function withFullEventTotals(
  capped: Array<SharedRecordRow>,
  eventTotals: Array<SharedRecordRow>,
): Array<SharedRecordRow> {
  return [
    ...capped.filter((row) => row.data?.report_type !== "event_total"),
    ...eventTotals,
  ];
}
