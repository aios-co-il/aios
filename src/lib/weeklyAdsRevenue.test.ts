import { describe, expect, it } from "vitest";
import { earnsRevenue, weeklyRoas } from "./weeklyAdsRevenue";

describe("earnsRevenue", () => {
  it("counts conversion value as revenue only for ecommerce campaigns", () => {
    expect(earnsRevenue("ecommerce")).toBe(true);
    expect(earnsRevenue("leads")).toBe(false);
  });
});

describe("weeklyRoas", () => {
  it("divides revenue by the spend that can earn it", () => {
    const rows = [
      { kind: "ecommerce", spend: 100 },
      { kind: "leads", spend: 300 },
    ];
    expect(weeklyRoas(rows, 600)).toBe(6);
  });

  it("is 0 without revenue-earning spend", () => {
    expect(weeklyRoas([{ kind: "leads", spend: 50 }], 0)).toBe(0);
  });
});
