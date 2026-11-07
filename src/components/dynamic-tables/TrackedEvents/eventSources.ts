import type { TrackedEvent, TrackedEventRecord } from "./trackedEvents";

/**
 * Where each followed event came from, from the GA sync's rows by event, day
 * and session source / medium (`report_type: event_source`). The table shows
 * the sources that brought the most followed events; the rest are summed
 * under "אחר".
 */

/** One source's row: its name and its count per followed event. */
export type EventSourceRow = {
  source: string;
  counts: Record<string, number>;
  total: number;
};

/** The source table, or null while the period has no source rows. */
export type EventSourcesTable = {
  rows: Array<EventSourceRow>;
  /** Each followed event's total across every source, for the shares. */
  totals: Record<string, number>;
} | null;

/** The label of the row that sums the sources past the top ones. */
export const OTHER_SOURCES = "אחר";

/** How many sources get a row of their own. */
const TOP_SOURCES = 8;

/**
 * Each source's count per followed event, the sources that brought the most
 * followed events first. Null when the period has no source rows at all, so
 * the tab can leave the table out until the sync has collected them.
 */
export function summarizeEventSources(
  records: Array<TrackedEventRecord>,
  tracked: Array<TrackedEvent>,
): EventSourcesTable {
  const followed = new Set(tracked.map((item) => item.event));
  const bySource = new Map<string, Record<string, number>>();
  let hasSourceRows = false;
  for (const record of records) {
    const data = record.data;
    if (
      record._source !== "google_analytics" ||
      !data ||
      data.report_type !== "event_source"
    ) {
      continue;
    }
    hasSourceRows = true;
    const event = typeof data.event_name === "string" ? data.event_name : "";
    if (!followed.has(event)) {
      continue;
    }
    const source =
      typeof data.source_medium === "string" && data.source_medium
        ? data.source_medium
        : "(not set)";
    const count = Number(data.event_count) || 0;
    const counts = bySource.get(source) ?? {};
    counts[event] = (counts[event] ?? 0) + count;
    bySource.set(source, counts);
  }
  if (!hasSourceRows) {
    return null;
  }
  const ranked = [...bySource.entries()]
    .map(([source, counts]) => ({ source, counts, total: sumOf(counts) }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total || a.source.localeCompare(b.source));
  const rows = ranked.slice(0, TOP_SOURCES);
  const rest = ranked.slice(TOP_SOURCES);
  if (rest.length > 0) {
    const counts: Record<string, number> = {};
    for (const row of rest) {
      for (const [event, count] of Object.entries(row.counts)) {
        counts[event] = (counts[event] ?? 0) + count;
      }
    }
    rows.push({ source: OTHER_SOURCES, counts, total: sumOf(counts) });
  }
  const totals: Record<string, number> = {};
  for (const item of tracked) {
    totals[item.event] = ranked.reduce(
      (sum, row) => sum + (row.counts[item.event] ?? 0),
      0,
    );
  }
  return { rows, totals };
}

/** The sum of a row's counts. */
function sumOf(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}
