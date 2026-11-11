import { describe, expect, it } from "vitest";
import { followUpDue } from "./followUpDue";

const now = new Date(2026, 10, 11, 15, 30);

describe("followUpDue", () => {
  it("treats a missing date as neither due nor late", () => {
    expect(followUpDue(null, now)).toEqual({
      isOverdue: false,
      isToday: false,
      daysLate: 0,
    });
  });

  it("marks today's date as due today", () => {
    expect(followUpDue("2026-11-11", now)).toMatchObject({
      isToday: true,
      isOverdue: false,
    });
  });

  it("counts calendar days for a past date", () => {
    expect(followUpDue("2026-11-08", now)).toEqual({
      isOverdue: true,
      isToday: false,
      daysLate: 3,
    });
  });

  it("does not flag a future date", () => {
    expect(followUpDue("2026-11-20", now)).toMatchObject({
      isOverdue: false,
      isToday: false,
    });
  });
});
