import { expect, test } from "vitest";
import {
  COMBINED_DASHBOARD_DATE_FILTERS,
  SHARED_COMBINED_DASHBOARD_DATE_FILTERS,
  SHARED_TABLE_DATE_FILTERS,
  getDashboardDateRange,
} from "./dashboardDateFilters.ts";

const NOW = new Date(2026, 8, 18);

const presetLists = [
  ["COMBINED_DASHBOARD_DATE_FILTERS", COMBINED_DASHBOARD_DATE_FILTERS],
  [
    "SHARED_COMBINED_DASHBOARD_DATE_FILTERS",
    SHARED_COMBINED_DASHBOARD_DATE_FILTERS,
  ],
  ["SHARED_TABLE_DATE_FILTERS", SHARED_TABLE_DATE_FILTERS],
] as const;

/**
 * An unhandled preset falls through to a default window, which is what made
 * "70 יום אחרונים" return the same totals as "30 יום אחרונים".
 */
test("every offered preset resolves to its own window", () => {
  const thirtyDays = getDashboardDateRange("last_30_days", NOW);

  for (const [listName, presets] of presetLists) {
    for (const { value } of presets) {
      if (value === "custom" || value === "all" || value === "last_30_days")
        continue;
      const range = getDashboardDateRange(value, NOW);
      expect(
        range,
        `${listName}: "${value}" resolves to the 30-day window`,
      ).not.toStrictEqual(thirtyDays);
    }
  }
});

test("the 70-day dashboard preset reaches back further than the 30-day one", () => {
  const thirty = getDashboardDateRange("last_30_days", NOW);
  const seventy = getDashboardDateRange("last_70_days", NOW);

  expect(thirty.startDate).toBe("2026-08-19");
  expect(seventy.startDate).toBe("2026-07-10");
  expect(seventy.endDate).toBe(thirty.endDate);
});

test("all requested long-range presets are offered on every report surface", () => {
  const requested = [
    "last_60_days",
    "last_90_days",
    "last_120_days",
    "last_365_days",
  ];
  for (const [listName, presets] of presetLists) {
    const values = new Set(presets.map(({ value }) => value));
    for (const value of requested) {
      expect(values.has(value), `${listName}: missing "${value}"`).toBeTruthy();
    }
  }

  expect(getDashboardDateRange("last_60_days", NOW).startDate).toBe(
    "2026-07-20",
  );
  expect(getDashboardDateRange("last_90_days", NOW).startDate).toBe(
    "2026-06-20",
  );
  expect(getDashboardDateRange("last_120_days", NOW).startDate).toBe(
    "2026-05-21",
  );
  expect(getDashboardDateRange("last_365_days", NOW).startDate).toBe(
    "2025-09-18",
  );
});

test("a custom range is used verbatim", () => {
  expect(
    getDashboardDateRange("custom", NOW, "2026-05-01", "2026-05-31"),
  ).toStrictEqual({
    startDate: "2026-05-01",
    endDate: "2026-05-31",
  });
});
