import { isRecord } from "../_shared/ads-sync/is-record.ts";

/**
 * The site events a dashboard follows by their Google Analytics name, in
 * the order its settings list them (`tracked_events`). The dashboard tab and
 * the event-users function read the same list.
 */

/** One followed event: its GA name and the label the dashboard shows. */
export type TrackedEvent = { event: string; label: string };

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
