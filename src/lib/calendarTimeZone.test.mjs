import { expect, test } from "vitest";

import {
  getJerusalemDashboardDateRange,
  jerusalemDateRangeToIso,
} from "./calendarTimeZone.ts";

test("Jerusalem last_7_days rolling window", () => {
  const now = new Date("2026-08-27T09:00:00Z");
  const calendar = getJerusalemDashboardDateRange("last_7_days", now);
  expect(calendar.startDate).toBe("2026-08-20");
  expect(calendar.endDate).toBe("2026-08-26");
});

test("Jerusalem last_week is previous Sun-Sat", () => {
  const now = new Date("2026-08-31T09:00:00Z");
  const calendar = getJerusalemDashboardDateRange("last_week", now);
  expect(calendar.startDate).toBe("2026-08-23");
  expect(calendar.endDate).toBe("2026-08-29");
  const iso = jerusalemDateRangeToIso(calendar.startDate, calendar.endDate);
  expect(iso.start < iso.end).toBeTruthy();
});

test("Jerusalem day bounds wrap midnight correctly", () => {
  const iso = jerusalemDateRangeToIso("2026-08-24", "2026-08-24");
  expect(
    iso.start.includes("2026-08-23") || iso.start.includes("2026-08-24"),
  ).toBeTruthy();
  expect(iso.end.includes("2026-08-24")).toBeTruthy();
});
