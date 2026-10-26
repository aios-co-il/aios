import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  applyZoomLinkToEvent,
  buildMeetConferenceData,
  collectExtraAttendeeEmails,
  conferenceKindFromUrl,
  eventDurationMinutes,
  extractConferenceUrl,
  googleEventPatchUrl,
  mergeAttendees,
  normalizeEmail,
  resolveRequestedConference,
  summarizeEventResult,
} from "./calendar-conference.mjs";

Deno.test("normalizeEmail rejects junk", () => {
  assertStrictEquals(normalizeEmail(" David@AIOS.co.il "), "david@aios.co.il");
  assertStrictEquals(normalizeEmail("not-an-email"), "");
});

Deno.test(
  "collectExtraAttendeeEmails accepts array, csv, and carmen_email",
  () => {
    const emails = collectExtraAttendeeEmails({
      add_attendee_emails: ["ana@example.com", "Ana@example.com"],
      attendee_emails: "felix@dmm.com, extra@aios.co.il",
      carmen_email: "carmen@aios.co.il",
    });
    assertEquals(emails, [
      "ana@example.com",
      "felix@dmm.com",
      "extra@aios.co.il",
      "carmen@aios.co.il",
    ]);
  },
);

Deno.test("mergeAttendees keeps existing attendees and adds new ones", () => {
  const merged = mergeAttendees(
    [
      { email: "david@aios.co.il", responseStatus: "accepted" },
      { email: "OLD@client.com" },
    ],
    ["felix@dmm.com", "david@aios.co.il"],
    [{ email: "carmen@aios.co.il", displayName: "כרמן" }],
  );
  assertStrictEquals(merged.length, 4);
  assertStrictEquals(
    merged.find((a) => a.email === "david@aios.co.il").responseStatus,
    "accepted",
  );
  assertStrictEquals(
    merged.find((a) => a.email === "old@client.com").email,
    "old@client.com",
  );
  assertStrictEquals(
    merged.find((a) => a.email === "carmen@aios.co.il").displayName,
    "כרמן",
  );
});

Deno.test(
  "extractConferenceUrl prefers hangoutLink then Zoom in description",
  () => {
    assertStrictEquals(
      extractConferenceUrl({
        hangoutLink: "https://meet.google.com/abc-defg-hij",
      }),
      "https://meet.google.com/abc-defg-hij",
    );
    assertStrictEquals(
      extractConferenceUrl({
        conferenceData: {
          entryPoints: [
            { entryPointType: "video", uri: "https://us02web.zoom.us/j/123" },
          ],
        },
      }),
      "https://us02web.zoom.us/j/123",
    );
    assertStrictEquals(
      extractConferenceUrl({
        description: "Join: https://zoom.us/j/999?pwd=abc.",
      }),
      "https://zoom.us/j/999?pwd=abc",
    );
  },
);

Deno.test("resolveRequestedConference maps Zoom/Meet Hebrew and flags", () => {
  assertStrictEquals(
    resolveRequestedConference({ conference_type: "zoom" }),
    "zoom",
  );
  assertStrictEquals(
    resolveRequestedConference({ conference_type: "זום" }),
    "zoom",
  );
  assertStrictEquals(
    resolveRequestedConference({ add_conference: true }),
    "meet",
  );
  assertStrictEquals(resolveRequestedConference({}), "none");
});

Deno.test("buildMeetConferenceData uses hangoutsMeet", () => {
  const data = buildMeetConferenceData("req-1");
  assertStrictEquals(
    data.createRequest.conferenceSolutionKey.type,
    "hangoutsMeet",
  );
  assertStrictEquals(data.createRequest.requestId, "req-1");
});

Deno.test("applyZoomLinkToEvent does not drop existing description", () => {
  const next = applyZoomLinkToEvent(
    { description: "Agenda: Q3", location: "Office" },
    "https://zoom.us/j/42",
  );
  assertMatch(next.description, /Agenda: Q3/);
  assertMatch(next.description, /https:\/\/zoom.us\/j\/42/);
  assertStrictEquals(next.location, "https://zoom.us/j/42");
});

Deno.test(
  "googleEventPatchUrl sets conferenceDataVersion when adding Meet",
  () => {
    const url = googleEventPatchUrl("abc 123", { conference: true });
    assertMatch(url, /conferenceDataVersion=1/);
    assertMatch(url, /sendUpdates=all/);
    assertMatch(url, /abc%20123/);
  },
);

Deno.test("summarizeEventResult returns conference_url and attendees", () => {
  const summary = summarizeEventResult(
    {
      id: "evt-1",
      htmlLink: "https://calendar.google.com/event?eid=1",
      hangoutLink: "https://meet.google.com/aaa-bbbb-ccc",
      attendees: [{ email: "a@x.com" }, { email: "b@y.com" }],
      start: { dateTime: "2026-10-06T09:00:00+03:00" },
      summary: "Sync",
    },
    { zoom_available: false },
  );
  assertStrictEquals(
    summary.conference_url,
    "https://meet.google.com/aaa-bbbb-ccc",
  );
  assertStrictEquals(summary.conference_type, "meet");
  assertEquals(summary.attendees, ["a@x.com", "b@y.com"]);
  assertStrictEquals(summary.zoom_available, false);
});

Deno.test("eventDurationMinutes reads start/end", () => {
  assertStrictEquals(
    eventDurationMinutes({
      start: { dateTime: "2026-10-06T09:00:00+03:00" },
      end: { dateTime: "2026-10-06T10:30:00+03:00" },
    }),
    90,
  );
});

Deno.test("conferenceKindFromUrl", () => {
  assertStrictEquals(
    conferenceKindFromUrl("https://meet.google.com/x"),
    "meet",
  );
  assertStrictEquals(
    conferenceKindFromUrl("https://us06web.zoom.us/j/1"),
    "zoom",
  );
});

Deno.test(
  "updateExistingCalendarEvent merges attendees and adds Meet",
  async () => {
    const { updateExistingCalendarEvent } =
      await import("./calendar-conference.mjs");
    const calls = [];
    const fetchImpl = async (url, opts = {}) => {
      calls.push({ url, method: opts.method || "GET", body: opts.body });
      if (!opts.method || opts.method === "GET") {
        return {
          ok: true,
          json: async () => ({
            id: "evt-1",
            htmlLink: "https://calendar.google.com/event?eid=1",
            summary: "Weekly",
            attendees: [{ email: "david@aios.co.il" }],
            start: { dateTime: "2026-10-07T10:00:00+03:00" },
            end: { dateTime: "2026-10-07T11:00:00+03:00" },
          }),
        };
      }
      const patch = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({
          id: "evt-1",
          htmlLink: "https://calendar.google.com/event?eid=1",
          summary: patch.summary || "Weekly",
          hangoutLink: "https://meet.google.com/new-link",
          attendees: patch.attendees,
          start: { dateTime: "2026-10-07T10:00:00+03:00" },
        }),
      };
    };

    const result = await updateExistingCalendarEvent({
      accessToken: "tok",
      eventId: "evt-1",
      conferenceType: "meet",
      extraEmails: ["carmen@aios.co.il"],
      fetchImpl,
    });

    assertStrictEquals(result.success, true);
    assertStrictEquals(
      result.conference_url,
      "https://meet.google.com/new-link",
    );
    assertEquals(result.attendees, ["david@aios.co.il", "carmen@aios.co.il"]);
    const patchCall = calls.find((c) => c.method === "PATCH");
    assertMatch(patchCall.url, /conferenceDataVersion=1/);
    const body = JSON.parse(patchCall.body);
    assertStrictEquals(body.attendees.length, 2);
    assertStrictEquals(
      body.conferenceData.createRequest.conferenceSolutionKey.type,
      "hangoutsMeet",
    );
  },
);

Deno.test(
  "updateExistingCalendarEvent Zoom missing falls back to Meet and keeps guests",
  async () => {
    const { updateExistingCalendarEvent } =
      await import("./calendar-conference.mjs");
    const fetchImpl = async (_url, opts = {}) => {
      if (!opts.method || opts.method === "GET") {
        return {
          ok: true,
          json: async () => ({
            id: "evt-2",
            attendees: [{ email: "a@x.com" }, { email: "b@y.com" }],
          }),
        };
      }
      const patch = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({
          id: "evt-2",
          hangoutLink: "https://meet.google.com/fallback",
          attendees: patch.attendees,
        }),
      };
    };
    const result = await updateExistingCalendarEvent({
      accessToken: "tok",
      eventId: "evt-2",
      conferenceType: "zoom",
      extraEmails: ["c@z.com"],
      fetchImpl,
    });
    assertStrictEquals(result.conference_applied, "meet");
    assertStrictEquals(result.zoom_available, false);
    assertStrictEquals(result.attendees.length, 3);
    assertMatch(result.zoom_status, /Zoom לא מוגדר/);
  },
);
