import { describe, expect, it } from "vitest";
import { clientsKpisOf, shareOf } from "./clientsKpis";

describe("clientsKpisOf", () => {
  it("counts current clients by status and mood", () => {
    const kpis = clientsKpisOf([
      { status: "active", mood_status: "happy" },
      { status: "active", mood_status: null },
      { status: "onboarding", mood_status: "wavering" },
      { status: "active", mood_status: "churn_risk" },
      { status: "active", mood_status: "not_progressing" },
    ]);

    expect(kpis).toEqual({
      active: 4,
      onboarding: 1,
      happy: 2,
      atRisk: 2,
      wavering: 1,
      current: 5,
    });
  });

  it("leaves paused and ended clients out of every count", () => {
    const kpis = clientsKpisOf([
      { status: "paused", mood_status: "churn_risk" },
      { status: "ended", mood_status: "happy" },
    ]);

    expect(kpis.current).toBe(0);
    expect(kpis.atRisk).toBe(0);
    expect(kpis.happy).toBe(0);
  });
});

describe("shareOf", () => {
  it("rounds to a whole percent", () => {
    expect(shareOf(1, 3)).toBe(33);
  });

  it("is null for an empty base", () => {
    expect(shareOf(0, 0)).toBeNull();
  });
});
