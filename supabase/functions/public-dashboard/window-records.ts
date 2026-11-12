import type { SharedRecordRow } from "./event-totals.ts";

/**
 * A share link reads each table's rows for its window only. The window is
 * filtered in the query, by the record's own day (`data->>date`, else
 * `data->>date_start`), so a cap never drops a window's oldest days the way
 * reading the newest rows and filtering afterwards did. Undated rows (GA
 * channel roll-ups and the like) always come along.
 */

/** Reads one page of a table's rows, filtered by `dateFilter` when set. */
export type LoadWindowPage = (
  dateFilter: string | null,
  from: number,
  to: number,
) => PromiseLike<{
  data: Array<SharedRecordRow> | null;
  error: { message?: string } | null;
}>;

const PAGE_SIZE = 1000;

/** At most 20,000 rows a table in a dated window: a year of busy daily rows. */
export const MAX_WINDOW_ROWS = 20_000;

/**
 * Without a window ("all") a table's newest rows are read, capped as before
 * so a long history cannot stall the link.
 */
export const MAX_UNBOUNDED_ROWS = 4_000;

/**
 * The PostgREST `or` filter that keeps a row whose day falls in the window,
 * or that has no day. Null when the window is all time. The days come from
 * `parseRequestRange`, so they are plain yyyy-MM-dd.
 */
export function recordWindowFilter(
  startDate: string | null,
  endDate: string | null,
): string | null {
  if (!startDate && !endDate) {
    return null;
  }
  return [
    `and(${withinWindow("data->>date", startDate, endDate)})`,
    `and(data->>date.is.null,${withinWindow("data->>date_start", startDate, endDate)})`,
    "and(data->>date.is.null,data->>date_start.is.null)",
  ].join(",");
}

/** The conditions that put a column's day inside the window's bounds. */
function withinWindow(
  column: string,
  startDate: string | null,
  endDate: string | null,
): string {
  return [
    startDate ? `${column}.gte.${startDate}` : null,
    endDate ? `${column}.lte.${endDate}` : null,
  ]
    .filter(Boolean)
    .join(",");
}

/**
 * Every row of one table in the window, page by page. Stops at the cap and
 * says so in the log, since the reports on the link then miss rows.
 */
export async function fetchWindowRecords(
  loadPage: LoadWindowPage,
  scope: {
    tableId: string;
    startDate: string | null;
    endDate: string | null;
  },
): Promise<Array<SharedRecordRow>> {
  const filter = recordWindowFilter(scope.startDate, scope.endDate);
  const maxRows = filter ? MAX_WINDOW_ROWS : MAX_UNBOUNDED_ROWS;
  const rows: Array<SharedRecordRow> = [];
  for (let from = 0; from < maxRows; from += PAGE_SIZE) {
    const { data, error } = await loadPage(filter, from, from + PAGE_SIZE - 1);
    if (error) {
      console.error(
        "[public-dashboard] records read failed:",
        scope.tableId,
        error.message,
      );
      return rows;
    }
    if (!data || data.length === 0) {
      return rows;
    }
    rows.push(...data);
    if (data.length < PAGE_SIZE) {
      return rows;
    }
  }
  console.error(
    `[public-dashboard] table ${scope.tableId} reached the ${maxRows}-row cap for ${scope.startDate ?? "all"}..${scope.endDate ?? "all"}; later pages were not read`,
  );
  return rows;
}
