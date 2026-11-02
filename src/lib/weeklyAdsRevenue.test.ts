import { describe, expect, it } from "vitest";
import { earnsRevenue, weeklyRoas } from "./weeklyAdsRevenue";

describe("earnsRevenue", () => {
  it("drops the conversion value of Google lead campaigns only", () => {
    expect(earnsRevenue("google_ads", "ecommerce")).toBe(true);
    expect(earnsRevenue("google_ads", "leads")).toBe(false);
    expect(earnsRevenue("facebook_insights", "leads")).toBe(true);
  });
});

describe("weeklyRoas", () => {
  it("divides revenue by the spend that can earn it", () => {
    const rows = [
      { source: "google_ads", kind: "ecommerce", spend: 100 },
      { source: "google_ads", kind: "leads", spend: 300 },
    ];
    expect(weeklyRoas(rows, 600)).toBe(6);
  });

  it("keeps Facebook lead spend in the denominator", () => {
    const rows = [{ source: "facebook_insights", kind: "leads", spend: 50 }];
    expect(weeklyRoas(rows, 100)).toBe(2);
  });

  it("is 0 without revenue-earning spend", () => {
    expect(
      weeklyRoas([{ source: "google_ads", kind: "leads", spend: 50 }], 0),
    ).toBe(0);
  });
});
