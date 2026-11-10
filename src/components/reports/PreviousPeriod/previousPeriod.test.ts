import { describe, expect, it } from "vitest";
import { periodChange, previousPeriodRange } from "./previousPeriod";

const NOW = new Date(2026, 10, 10, 12);

describe("previousPeriodRange", () => {
  it("is the same number of days right before the window", () => {
    // Last 7 days: 3–9 Nov, so the 7 days before are 27 Oct – 2 Nov.
    expect(previousPeriodRange("last_7_days", null, null, NOW)).toStrictEqual({
      startDate: "2026-10-27",
      endDate: "2026-11-02",
    });
    expect(
      previousPeriodRange("custom", "2026-10-01", "2026-10-10", NOW),
    ).toStrictEqual({ startDate: "2026-09-21", endDate: "2026-09-30" });
  });

  it("compares this month so far with as many days before it", () => {
    expect(previousPeriodRange("this_month", null, null, NOW)).toStrictEqual({
      startDate: "2026-10-22",
      endDate: "2026-10-31",
    });
  });

  it("has no previous period for all history or an unfinished range", () => {
    expect(previousPeriodRange("all", null, null, NOW)).toBeNull();
    expect(previousPeriodRange("custom", "2026-10-01", null, NOW)).toBeNull();
  });
});

describe("periodChange", () => {
  it("reads more leads and a lower cost per lead as good news", () => {
    expect(periodChange(12, 8, "higher")).toBe("better");
    expect(periodChange(30, 25, "lower")).toBe("worse");
    expect(periodChange(20, 25, "lower")).toBe("better");
  });

  it("gives spend and an unchanged value no verdict", () => {
    expect(periodChange(500, 300, "neutral")).toBe("same");
    expect(periodChange(7, 7, "higher")).toBe("same");
  });
});

describe("previousPeriodRange in Israel time", () => {
  it("counts from the date in Israel, wherever the browser is", () => {
    // 23:30 UTC on 9 Nov is already 10 Nov in Jerusalem: last 7 days are
    // 3–9 Nov, and the 7 before are 27 Oct – 2 Nov.
    expect(
      previousPeriodRange(
        "last_7_days",
        null,
        null,
        new Date(Date.UTC(2026, 10, 9, 23, 30)),
      ),
    ).toStrictEqual({ startDate: "2026-10-27", endDate: "2026-11-02" });
  });
});
