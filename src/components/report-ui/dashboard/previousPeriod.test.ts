import { describe, expect, it } from "vitest";
import { previousPeriodOf, previousPeriodRange } from "./previousPeriod";

describe("previousPeriodRange", () => {
  it("returns the 14 days before a 14-day range", () => {
    expect(
      previousPeriodRange({ startDate: "2026-10-28", endDate: "2026-11-10" }),
    ).toEqual({ startDate: "2026-10-14", endDate: "2026-10-27" });
  });

  it("returns the day before a one-day range", () => {
    expect(
      previousPeriodRange({ startDate: "2026-11-01", endDate: "2026-11-01" }),
    ).toEqual({ startDate: "2026-10-31", endDate: "2026-10-31" });
  });

  it("crosses month and year boundaries", () => {
    expect(
      previousPeriodRange({ startDate: "2026-01-01", endDate: "2026-01-31" }),
    ).toEqual({ startDate: "2025-12-01", endDate: "2025-12-31" });
  });

  it("keeps the length across a daylight-saving change", () => {
    expect(
      previousPeriodRange({ startDate: "2026-10-26", endDate: "2026-11-01" }),
    ).toEqual({ startDate: "2026-10-19", endDate: "2026-10-25" });
  });
});

describe("previousPeriodOf", () => {
  it("has no previous period without bounds", () => {
    expect(previousPeriodOf({ startDate: null, endDate: null })).toBeNull();
  });

  it("has no previous period for a backwards range", () => {
    expect(
      previousPeriodOf({ startDate: "2026-11-02", endDate: "2026-11-01" }),
    ).toBeNull();
  });

  it("returns the previous period of a bounded range", () => {
    expect(
      previousPeriodOf({ startDate: "2026-11-04", endDate: "2026-11-10" }),
    ).toEqual({ startDate: "2026-10-28", endDate: "2026-11-03" });
  });
});
