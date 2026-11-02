import { expect, test } from "vitest";
import { formatReportDate, getReportCoverageGap } from "./reportCoverage.ts";

test("a 70-day window over 30 days of stored ads data reports the shortfall", () => {
  const gap = getReportCoverageGap("2026-07-10", [
    "2026-08-19",
    "2026-09-01",
    "2026-09-17",
  ]);

  expect(gap).toStrictEqual({
    earliestAvailable: "2026-08-19",
    uncoveredDays: 40,
  });
});

test("a window fully covered by stored data reports no gap", () => {
  expect(getReportCoverageGap("2026-08-19", ["2026-08-19", "2026-09-17"])).toBe(
    null,
  );
  expect(getReportCoverageGap("2026-08-19", ["2026-07-01", "2026-09-17"])).toBe(
    null,
  );
});

test("normal sync lag of a day or two is not reported as a gap", () => {
  expect(getReportCoverageGap("2026-09-15", ["2026-09-16", "2026-09-17"])).toBe(
    null,
  );
});

test("missing or malformed dates are ignored", () => {
  expect(getReportCoverageGap(null, ["2026-09-17"])).toBe(null);
  expect(
    getReportCoverageGap("2026-07-10", ["", null, undefined, "not-a-date"]),
  ).toBe(null);
  expect(
    getReportCoverageGap("2026-07-10", ["2026-08-19T00:00:00Z", null]),
  ).toStrictEqual({
    earliestAvailable: "2026-08-19",
    uncoveredDays: 40,
  });
});

test("dates render the way the reports display them", () => {
  expect(formatReportDate("2026-08-19")).toBe("19/08/2026");
});
