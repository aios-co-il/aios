import { expect, test } from "vitest";

import { getJerusalemDashboardDateRange } from "./calendarTimeZone.ts";

test("getWooDashboardDateRangeIso last_7_days matches Jerusalem calendar", () => {
  const now = new Date("2026-08-27T09:00:00Z");
  const calendar = getJerusalemDashboardDateRange("last_7_days", now);
  expect(calendar.startDate).toBe("2026-08-20");
  expect(calendar.endDate).toBe("2026-08-26");
});

test("getWooDashboardDateRangeIso last_week is not rolling 7 days", () => {
  const now = new Date("2026-08-27T09:00:00Z");
  const calendar = getJerusalemDashboardDateRange("last_week", now);
  expect(calendar.startDate).toBe("2026-08-16");
  expect(calendar.endDate).toBe("2026-08-22");
});
