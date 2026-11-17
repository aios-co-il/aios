import { assertEquals } from "jsr:@std/assert@1";
import { CALENDAR_SCOPES } from "./scopes.ts";

Deno.test(
  "calendar requests events and calendar list instead of full calendar",
  () => {
    assertEquals(CALENDAR_SCOPES, [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ]);
  },
);
