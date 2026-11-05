import { describe, expect, it } from "vitest";
import { adsRowOutcomes } from "./adsRowOutcomes";

const row = {
  conversions: 2,
  conversions_value: 300,
  purchases: 2,
  purchase_value: 300,
  leads: 4,
};

describe("adsRowOutcomes", () => {
  it("adds only sales from an ecommerce campaign and only leads from a lead campaign", () => {
    const sales = adsRowOutcomes(row, "ecommerce");
    expect(sales.leads).toBe(0);
    expect(sales.revenue).toBeGreaterThan(0);

    const leads = adsRowOutcomes(row, "leads");
    expect(leads.purchases).toBe(0);
    expect(leads.revenue).toBe(0);
    expect(leads.addToCart).toBe(0);
    expect(leads.leads).toBeGreaterThan(0);
  });

  it("adds no sales or leads from a traffic campaign", () => {
    expect(adsRowOutcomes(row, "traffic")).toEqual({
      purchases: 0,
      revenue: 0,
      addToCart: 0,
      leads: 0,
    });
  });

  it("adds everything for a row without a goal", () => {
    const all = adsRowOutcomes(row);
    expect(all).toEqual({
      purchases: adsRowOutcomes(row, "ecommerce").purchases,
      revenue: adsRowOutcomes(row, "ecommerce").revenue,
      addToCart: adsRowOutcomes(row, "ecommerce").addToCart,
      leads: adsRowOutcomes(row, "leads").leads,
    });
  });
});
