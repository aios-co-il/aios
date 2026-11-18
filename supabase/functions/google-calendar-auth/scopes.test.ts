import { assertEquals } from "jsr:@std/assert@1";
import { missingCalendarScopes } from "./scopes.ts";

const EVENTS = "https://www.googleapis.com/auth/calendar.events";
const CALENDAR_LIST =
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly";

Deno.test("a grant without events access is missing calendar.events", () => {
  assertEquals(missingCalendarScopes({ scope: CALENDAR_LIST }), [EVENTS]);
});

Deno.test("events and calendar list together are enough", () => {
  assertEquals(
    missingCalendarScopes({ scope: `${EVENTS} ${CALENDAR_LIST}` }),
    [],
  );
});

Deno.test("an earlier full calendar grant is still enough", () => {
  assertEquals(
    missingCalendarScopes({
      scope: "https://www.googleapis.com/auth/calendar",
    }),
    [],
  );
});
