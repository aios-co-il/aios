import { isJsonObject, type JsonObject } from "./jsonFields.ts";

type CalendarDate = { dateTime?: string; date?: string };

export interface CalendarPayloadEvent {
  id?: string;
  summary?: string;
  description?: string;
  start?: CalendarDate;
  end?: CalendarDate;
  calendarName?: string;
  calendarColor?: string;
}

export interface CalendarPayloadCalendar {
  id?: string;
  name?: string;
  color?: string;
}

export interface CalendarEventsPayload {
  events: CalendarPayloadEvent[];
  calendars: CalendarPayloadCalendar[];
}

function asObject(value: unknown): JsonObject | undefined {
  return isJsonObject(value) ? value : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseDate(value: unknown): CalendarDate | undefined {
  const o = asObject(value);
  return o ? { dateTime: str(o.dateTime), date: str(o.date) } : undefined;
}

function objects(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const o = asObject(item);
    return o ? [o] : [];
  });
}

/** Narrows the get-calendar-events / unified list_events response. */
export function parseCalendarEventsPayload(
  data: unknown,
): CalendarEventsPayload {
  const root = asObject(data);
  return {
    events: objects(root?.events).map((e) => ({
      id: str(e.id),
      summary: str(e.summary),
      description: str(e.description),
      start: parseDate(e.start),
      end: parseDate(e.end),
      calendarName: str(e.calendarName),
      calendarColor: str(e.calendarColor),
    })),
    calendars: objects(root?.calendars).map((c) => ({
      id: str(c.id),
      name: str(c.name),
      color: str(c.color),
    })),
  };
}
