/**
 * Where each site event came from: events by day and by the session's
 * source / medium (`report_type: event_source`), so a dashboard can show,
 * for example, how many ticket uploads came from Facebook ads.
 */

/**
 * GA's automatic events fire on every visit; by source they repeat the
 * traffic report, so they are left out to keep the rows to the actions a
 * site measures.
 */
export const AUTOMATIC_EVENTS = [
  "page_view",
  "session_start",
  "first_visit",
  "user_engagement",
  "scroll",
];

/**
 * At most 10,000 rows a sync. The sync inserts in batches of 200, so this
 * bounds the extra writes; the rows come most frequent first.
 */
const EVENT_SOURCE_LIMIT = 10000;

/** The GA Data API request for events by day and source / medium. */
export function eventSourcesRequest(startDate: string, endDate: string) {
  return {
    dateRanges: [{ startDate, endDate }],
    dimensions: [
      { name: "date" },
      { name: "eventName" },
      { name: "sessionSourceMedium" },
    ],
    metrics: [{ name: "eventCount" }, { name: "keyEvents" }],
    dimensionFilter: {
      notExpression: {
        filter: {
          fieldName: "eventName",
          inListFilter: { values: AUTOMATIC_EVENTS },
        },
      },
    },
    orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
    limit: EVENT_SOURCE_LIMIT,
  };
}

/** One GA report row as the Data API returns it. */
export type GaReportRow = {
  dimensionValues: Array<{ value: string }>;
  metricValues: Array<{ value: string }>;
};

/** The stored row of one event, day and source / medium. */
export type EventSourceData = {
  report_type: "event_source";
  event_name: string;
  source_medium: string;
  date: string | null;
  event_count: number;
  key_events: number;
};

/**
 * Each report row as stored data: the count is the larger of eventCount and
 * keyEvents, as the daily event report stores it.
 */
export function eventSourceRows(
  rows: Array<GaReportRow> | null | undefined,
): Array<EventSourceData> {
  return (rows ?? []).map((row) => {
    const rawDate = row.dimensionValues[0]?.value ?? "";
    const eventCount = parseInt(row.metricValues[0]?.value) || 0;
    const keyEvents = parseInt(row.metricValues[1]?.value) || 0;
    return {
      report_type: "event_source",
      event_name: row.dimensionValues[1]?.value ?? "",
      source_medium: row.dimensionValues[2]?.value || "(not set)",
      date: rawDate
        ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
        : null,
      event_count: Math.max(eventCount, keyEvents),
      key_events: keyEvents,
    };
  });
}
