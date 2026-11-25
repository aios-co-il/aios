import { assertEquals } from "jsr:@std/assert@1";

import { getJerusalemDashboardDateRange } from "./calendarTimeZone.ts";

Deno.test("last_9_days is 9 full days ending yesterday in Israel", () => {
  // 23:30 UTC is already 28 Aug in Israel, so yesterday there is 27 Aug.
  const now = new Date("2026-08-27T23:30:00Z");

  assertEquals(getJerusalemDashboardDateRange("last_9_days", now), {
    startDate: "2026-08-19",
    endDate: "2026-08-27",
  });
});

Deno.test("last_7_days keeps its 7 days ending yesterday", () => {
  const now = new Date("2026-08-27T09:00:00Z");

  assertEquals(getJerusalemDashboardDateRange("last_7_days", now), {
    startDate: "2026-08-20",
    endDate: "2026-08-26",
  });
});
