import { describe, expect, it } from "vitest";
import { parseCalendarEventsPayload } from "./calendarEventsPayload";

describe("parseCalendarEventsPayload", () => {
  it("keeps string fields of events and calendars", () => {
    const parsed = parseCalendarEventsPayload({
      events: [
        {
          id: "e1",
          summary: "Meeting",
          start: { dateTime: "2026-01-01T10:00:00Z" },
          end: { date: "2026-01-01" },
          calendarColor: "#fff",
        },
      ],
      calendars: [{ id: "c1", name: "Work", color: "#000" }],
    });
    expect(parsed.events[0]).toMatchObject({
      id: "e1",
      summary: "Meeting",
      start: { dateTime: "2026-01-01T10:00:00Z" },
      end: { date: "2026-01-01" },
      calendarColor: "#fff",
    });
    expect(parsed.calendars).toEqual([
      { id: "c1", name: "Work", color: "#000" },
    ]);
  });

  it("returns empty lists for malformed payloads", () => {
    expect(parseCalendarEventsPayload(null)).toEqual({
      events: [],
      calendars: [],
    });
    expect(parseCalendarEventsPayload({ events: "x" }).events).toEqual([]);
  });

  it("drops non-object entries and non-string fields", () => {
    const { events } = parseCalendarEventsPayload({
      events: [null, 3, { id: 5, summary: "ok", start: "x" }],
    });
    expect(events).toHaveLength(1);
    expect(events[0].id).toBeUndefined();
    expect(events[0].summary).toBe("ok");
    expect(events[0].start).toBeUndefined();
  });
});
