import { describe, expect, test } from "vitest";
import { buildWeeklyCampaignSections } from "./weeklyAdsComparison.ts";

/** A Facebook Ecommerce campaign row, as the 4/4 store's Meta table holds them. */
const ecommerceRow = (campaign: string, data: Record<string, unknown>) => ({
  _source: "facebook_ecommerce",
  data: {
    date: "2026-11-03",
    campaign_id: campaign,
    campaign_name: campaign,
    entity_level: "campaign",
    impressions: 1000,
    clicks: 50,
    ...data,
  },
});

describe("buildWeeklyCampaignSections – Meta campaign goals", () => {
  test("a lead campaign in a Facebook Ecommerce table is kept out of the sales ROAS", () => {
    const [week] = buildWeeklyCampaignSections(
      [
        ecommerceRow("Shop", {
          spend: 1000,
          purchases: 10,
          purchase_value: 4000,
        }),
        ecommerceRow("Leads", {
          spend: 1000,
          leads: 25,
          campaign_objective: "OUTCOME_LEADS",
        }),
      ],
      { now: new Date("2026-11-05T12:00:00Z") },
    );
    const goals = Object.fromEntries(
      week.groups.map((group) => [group.kind, group]),
    );
    expect(Object.keys(goals).sort()).toStrictEqual(["ecommerce", "leads"]);
    expect(goals.ecommerce.totals.spend).toBe(1000);
    expect(goals.ecommerce.totals.roas).toBe(4);
    expect(goals.leads.totals.results).toBe(25);
    expect(week.totals.spend).toBe(2000);
  });
});
