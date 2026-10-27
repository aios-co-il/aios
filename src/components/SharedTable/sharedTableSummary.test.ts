import { describe, expect, it } from "vitest";
import type { CampaignGoal } from "@/lib/campaignGoals";
import { summarizeSharedTableRecords } from "./sharedTableSummary";

const google = (
  goal: "ecommerce" | "leads",
  data: Record<string, unknown>,
) => ({
  data: { goal, impressions: 1000, clicks: 50, ...data },
});
const goalOf = (data: Record<string, unknown>): CampaignGoal =>
  data.goal === "ecommerce" ? "ecommerce" : "leads";

describe("summarizeSharedTableRecords", () => {
  it("keeps ROAS and cost per conversion on each Google goal's own spend", () => {
    const summary = summarizeSharedTableRecords(
      [
        google("ecommerce", {
          cost: 200,
          conversions: 4,
          conversions_value: 800,
        }),
        google("leads", { cost: 300, conversions: 10, conversions_value: 10 }),
      ],
      {
        integrationType: "google_ads",
        goalOf,
        goals: { hasEcommerce: true, hasLeads: true },
      },
    );
    expect(summary.spend).toBe(500);
    expect(summary.revenue).toBe(800);
    // Not 800 / 500 or 500 / 10: lead spend earns no revenue, sales are not leads.
    expect(summary.roas).toBe(4);
    expect(summary.leads).toBe(10);
    expect(summary.cpl).toBe(30);
    expect(summary.hasEcommerce && summary.hasLeads).toBe(true);
  });

  it("a single-goal report uses its whole spend", () => {
    const summary = summarizeSharedTableRecords(
      [
        { data: { spend: 100, leads: 5 } },
        { data: { spend: 60, leads: 3, purchases: 1, purchase_value: 90 } },
      ],
      {
        integrationType: "facebook_ecommerce",
        goalOf: null,
        goals: { hasEcommerce: false, hasLeads: true },
      },
    );
    expect(summary).toMatchObject({
      spend: 160,
      leads: 8,
      cpl: 20,
      purchases: 0,
      revenue: 0,
      roas: 0,
      hasEcommerce: false,
      hasLeads: true,
    });
  });
});
