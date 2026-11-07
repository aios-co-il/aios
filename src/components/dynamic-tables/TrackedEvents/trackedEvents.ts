import { isRecord } from "../../../../supabase/functions/_shared/ads-sync/is-record.ts";

/**
 * Site events a dashboard follows by their Google Analytics name, such as
 * SwapTix's ticket_upload or credits_purchase. The list lives in the
 * dashboard's settings (`tracked_events`), in funnel order, so each client
 * picks its own events and labels without new code.
 */

/** One followed event: its GA name and the label the dashboard shows. */
export type TrackedEvent = { event: string; label: string };

/** A GA record as the dashboard receives it. */
export type TrackedEventRecord = {
  _source?: string;
  data?: Record<string, unknown> | null;
};

/** One followed event's figures for the period. */
export type TrackedEventFigures = TrackedEvent & {
  count: number;
  /** Ads spend divided by the count; null without a count or spend. */
  cost: number | null;
  /** This event's count over the previous step's; null for the first step. */
  stepRate: number | null;
};

/** One day of the chart: the date and each followed event's count. */
export type TrackedEventsDay = { date: string } & Record<
  string,
  number | string
>;

export type TrackedEventsSummary = {
  events: Array<TrackedEventFigures>;
  days: Array<TrackedEventsDay>;
};

/** The dashboard settings key that holds the followed events. */
export const TRACKED_EVENTS_SETTING = "tracked_events";

/**
 * The followed events from a dashboard's settings, in order. Entries without
 * an event name are dropped, a missing label falls back to the event name,
 * and a repeated event keeps its first entry.
 */
export function parseTrackedEvents(settings: unknown): Array<TrackedEvent> {
  const raw = isRecord(settings) ? settings[TRACKED_EVENTS_SETTING] : null;
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  const events: Array<TrackedEvent> = [];
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.event !== "string") {
      continue;
    }
    const event = entry.event.trim();
    if (!event || seen.has(event)) {
      continue;
    }
    seen.add(event);
    const label =
      typeof entry.label === "string" && entry.label.trim()
        ? entry.label.trim()
        : event;
    events.push({ event, label });
  }
  return events;
}

/**
 * Each followed event's count, cost and step rate, plus a row per day for the
 * chart. Counts come from the GA sync's daily per-event rows (`event_total`),
 * which carry the larger of eventCount and keyEvents.
 */
export function summarizeTrackedEvents(
  records: Array<TrackedEventRecord>,
  tracked: Array<TrackedEvent>,
  adsSpend: number,
): TrackedEventsSummary {
  const followed = new Set(tracked.map((item) => item.event));
  const totals = new Map<string, number>();
  const byDay = new Map<string, Map<string, number>>();
  for (const { event, date, count } of dailyEventCounts(records)) {
    // Any GA event marks the day as synced, so a followed event that did not
    // fire that day shows a zero instead of a line jumping over the day.
    const day = byDay.get(date) ?? new Map<string, number>();
    byDay.set(date, day);
    if (!followed.has(event)) {
      continue;
    }
    totals.set(event, (totals.get(event) ?? 0) + count);
    day.set(event, (day.get(event) ?? 0) + count);
  }
  const events = tracked.map((item, index): TrackedEventFigures => {
    const count = totals.get(item.event) ?? 0;
    const previous =
      index > 0 ? (totals.get(tracked[index - 1].event) ?? 0) : null;
    return {
      ...item,
      count,
      cost: count > 0 && adsSpend > 0 ? adsSpend / count : null,
      stepRate: previous ? count / previous : null,
    };
  });
  const days = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => {
      const row: TrackedEventsDay = { date };
      for (const item of tracked) {
        row[item.event] = counts.get(item.event) ?? 0;
      }
      return row;
    });
  return { events, days };
}

/**
 * Every event name in the period's GA rows, most frequent first, for the
 * settings picker.
 */
export function availableEventNames(
  records: Array<TrackedEventRecord>,
): Array<{ event: string; count: number }> {
  const totals = new Map<string, number>();
  for (const { event, count } of dailyEventCounts(records)) {
    totals.set(event, (totals.get(event) ?? 0) + count);
  }
  return [...totals.entries()]
    .map(([event, count]) => ({ event, count }))
    .sort((a, b) => b.count - a.count || a.event.localeCompare(b.event));
}

/** The GA sync's daily per-event rows, as event, date and count. */
function dailyEventCounts(
  records: Array<TrackedEventRecord>,
): Array<{ event: string; date: string; count: number }> {
  const rows: Array<{ event: string; date: string; count: number }> = [];
  for (const record of records) {
    const data = record.data;
    if (
      record._source !== "google_analytics" ||
      !data ||
      data.report_type !== "event_total"
    ) {
      continue;
    }
    const event = typeof data.event_name === "string" ? data.event_name : "";
    const date = typeof data.date === "string" ? data.date.slice(0, 10) : "";
    if (!event || !date) {
      continue;
    }
    const count = Math.max(
      Number(data.event_count) || 0,
      Number(data.key_events) || 0,
    );
    rows.push({ event, date, count });
  }
  return rows;
}
