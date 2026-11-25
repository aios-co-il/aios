import { assertEquals } from "jsr:@std/assert@1";

import { sharedDashboardDateRange } from "./shared-dashboard-range.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

Deno.test("a share link's last_9_days is 9 UTC days ending yesterday", () => {
  const todayUtc = new Date(new Date().toISOString().slice(0, 10)).getTime();

  assertEquals(sharedDashboardDateRange("last_9_days"), {
    startDate: dayString(todayUtc - 9 * DAY_MS),
    endDate: dayString(todayUtc - DAY_MS),
  });
});

/** The yyyy-MM-dd UTC day of a timestamp. */
function dayString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
