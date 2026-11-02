import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  chooseCalendarRecordingMatch,
  isZoomCalendarEvent,
  matchClientFromCalendarTitle,
  normalizeCalendarMatchText,
} from "./calendar-recording-match.ts";

const clients = [
  { id: "client-acme", name: "Acme Ltd" },
  { id: "client-exito", name: "אקסיטו" },
  { id: "client-other", name: "לקוח אחר" },
];

const zoomEvent = (overrides: Record<string, unknown> = {}) => ({
  id: "event-1",
  summary: "פגישת סטטוס אקסיטו",
  description: "Join Zoom Meeting https://zoom.us/j/123456",
  start: { dateTime: "2026-08-24T07:00:00.000Z" },
  end: { dateTime: "2026-08-24T08:00:00.000Z" },
  ...overrides,
});

Deno.test("normalizes Hebrew punctuation and casing", () => {
  assertStrictEquals(
    normalizeCalendarMatchText("  פגישת–אקסיטו!!! "),
    "פגישת אקסיטו",
  );
  assertStrictEquals(normalizeCalendarMatchText("ACME, Ltd."), "acme ltd");
});

Deno.test(
  "detects Zoom links in description, location, or conference data",
  () => {
    assertStrictEquals(isZoomCalendarEvent(zoomEvent()), true);
    assertStrictEquals(
      isZoomCalendarEvent({
        summary: "Client call",
        conferenceData: {
          entryPoints: [{ uri: "https://us02web.zoom.us/j/42" }],
        },
      }),
      true,
    );
    assertStrictEquals(isZoomCalendarEvent({ summary: "פגישה רגילה" }), false);
  },
);

Deno.test("matches an explicit client name in the calendar title", () => {
  assertEquals(
    matchClientFromCalendarTitle("Zoom | פגישת סטטוס אקסיטו", clients),
    clients[1],
  );
  assertEquals(
    matchClientFromCalendarTitle("Weekly call - Acme", clients),
    clients[0],
  );
});

Deno.test(
  "does not match partial words or ambiguous equal-length names",
  () => {
    assertStrictEquals(
      matchClientFromCalendarTitle("Acmeology kickoff", clients),
      null,
    );
    assertStrictEquals(
      matchClientFromCalendarTitle("פגישה כללית", clients),
      null,
    );
    assertStrictEquals(
      matchClientFromCalendarTitle("Alpha + Bravo", [
        { id: "alpha", name: "Alpha" },
        { id: "bravo", name: "Bravo" },
      ]),
      null,
    );
  },
);

Deno.test("chooses the closest timed Zoom event and assigns its client", () => {
  const match = chooseCalendarRecordingMatch(
    {
      start_time: "2026-08-24T07:04:00.000Z",
      duration: 50,
    },
    [
      zoomEvent({
        id: "far",
        summary: "פגישה לקוח אחר",
        start: { dateTime: "2026-08-24T06:40:00.000Z" },
        end: { dateTime: "2026-08-24T07:30:00.000Z" },
      }),
      zoomEvent(),
    ],
    clients,
  );

  assertStrictEquals(match?.eventId, "event-1");
  assertStrictEquals(match?.eventTitle, "פגישת סטטוס אקסיטו");
  assertStrictEquals(match?.clientId, "client-exito");
  assertStrictEquals(match?.startDeltaMinutes, 4);
});

Deno.test(
  "ignores non-Zoom, cancelled, all-day, distant, and generic events",
  () => {
    const recording = { start_time: "2026-08-24T07:00:00.000Z", duration: 60 };
    assertStrictEquals(
      chooseCalendarRecordingMatch(
        recording,
        [
          { ...zoomEvent(), description: "", summary: "פגישה רגילה" },
          { ...zoomEvent(), status: "cancelled" },
          { ...zoomEvent(), start: { date: "2026-08-24" } },
          {
            ...zoomEvent(),
            start: { dateTime: "2026-08-24T10:00:00.000Z" },
            end: { dateTime: "2026-08-24T11:00:00.000Z" },
          },
          { ...zoomEvent(), summary: "Zoom Meeting" },
        ],
        clients,
      ),
      null,
    );
  },
);

Deno.test(
  "never matches a known Google Meet or Teams recording to a Zoom event",
  () => {
    assertStrictEquals(
      chooseCalendarRecordingMatch(
        {
          start_time: "2026-08-24T07:00:00.000Z",
          duration: 60,
          meeting_topic: "Google Meet — כרמן",
          source: "meeting_bot",
        },
        [zoomEvent()],
        clients,
      ),
      null,
    );

    assertStrictEquals(
      chooseCalendarRecordingMatch(
        {
          start_time: "2026-08-24T07:00:00.000Z",
          duration: 60,
          meeting_topic: "פגישת צוות",
          source: "teams",
        },
        [zoomEvent()],
        clients,
      ),
      null,
    );
  },
);
