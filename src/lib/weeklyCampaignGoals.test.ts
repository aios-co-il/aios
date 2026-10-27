import { describe, expect, it } from "vitest";
import { buildWeeklyCampaignSections } from "./weeklyAdsComparison";
import { weeklySourceModesForTable } from "./weeklyCampaignGoals";

const NOW = new Date("2026-09-18T12:00:00Z");
const fb = (campaign: string, data: Record<string, unknown>) => ({
  _source: "facebook_insights",
  data: {
    date: "2026-09-14",
    campaign_id: campaign,
    campaign_name: campaign,
    entity_level: "campaign",
    impressions: 1000,
    clicks: 50,
    ...data,
  },
});
const shop = fb("Shop", {
  campaign_objective: "OUTCOME_SALES",
  spend: 200,
  purchases: 4,
});
const leadCampaign = fb("Leads", {
  campaign_type: "lead",
  spend: 300,
  leads: 10,
});

describe("groupWeeklyRowsByGoal", () => {
  it("a lead-only week has one leads group with no revenue", () => {
    const [week] = buildWeeklyCampaignSections(
      [
        fb("A", { spend: 100, leads: 5 }),
        fb("B", { date: "2026-09-15", spend: 60, leads: 2 }),
      ],
      { now: NOW },
    );
    expect(week.groups.map((group) => group.kind)).toStrictEqual(["leads"]);
    expect(week.groups[0].totals.results).toBe(7);
    expect(week.groups[0].totals.costPerResult).toBeCloseTo(160 / 7);
    expect(week.groups[0].totals.revenue).toBe(0);
    expect(week.groups[0].totals.roas).toBe(0);
  });

  it("an ecommerce-only week has one sales group with purchases and ROAS", () => {
    const [week] = buildWeeklyCampaignSections(
      [
        fb("Shop", {
          campaign_type: "ecommerce",
          spend: 200,
          purchases: 4,
          purchase_value: 1000,
        }),
        fb("Catalog", {
          campaign_objective: "OUTCOME_SALES",
          spend: 100,
          purchases: 1,
          purchase_value: 200,
        }),
      ],
      { now: NOW },
    );
    expect(week.groups.map((group) => group.kind)).toStrictEqual(["ecommerce"]);
    const { totals } = week.groups[0];
    expect(totals.results).toBe(5);
    expect(totals.costPerResult).toBe(60);
    expect(totals.revenue).toBe(1200);
    expect(totals.roas).toBe(4);
  });

  it("a mixed week splits sales and leads, each with its own totals", () => {
    const [week] = buildWeeklyCampaignSections(
      [
        fb("Leads", { spend: 300, leads: 10 }),
        fb("Shop", {
          campaign_type: "ecommerce",
          spend: 200,
          purchases: 4,
          purchase_value: 800,
        }),
      ],
      { now: NOW },
    );
    const [sales, leads] = week.groups;
    expect(week.groups.map((group) => group.kind)).toStrictEqual([
      "ecommerce",
      "leads",
    ]);
    expect(sales.rows.map((row) => row.campaign)).toStrictEqual(["Shop"]);
    expect(sales.totals).toMatchObject({
      results: 4,
      spend: 200,
      costPerResult: 50,
      revenue: 800,
      roas: 4,
    });
    expect(leads.rows.map((row) => row.campaign)).toStrictEqual(["Leads"]);
    expect(leads.totals).toMatchObject({
      results: 10,
      spend: 300,
      costPerResult: 30,
      revenue: 0,
      roas: 0,
    });
    // Only delivery and spend are totalled across goals.
    expect(week.totals).toStrictEqual({
      impressions: 2000,
      clicks: 100,
      spend: 500,
    });
  });

  it("traffic campaigns get their own group, last, measured by clicks", () => {
    const [week] = buildWeeklyCampaignSections(
      [
        fb("Traffic", { campaign_type: "traffic", spend: 50, clicks: 200 }),
        fb("Leads", { spend: 100, leads: 5 }),
        fb("Shop", { campaign_type: "ecommerce", spend: 80, purchases: 2 }),
      ],
      { now: NOW, sourceModes: { facebook_insights: "leads" } },
    );
    expect(week.groups.map((group) => group.kind)).toStrictEqual([
      "leads",
      "traffic",
    ]);
    const traffic = week.groups[1];
    expect(traffic.rows.map((row) => row.campaign)).toStrictEqual(["Traffic"]);
    expect(traffic.totals.results).toBe(200);
    expect(traffic.totals.costPerResult).toBe(0.25);
    // A leads-only report keeps its sales-looking campaign in leads.
    expect(week.groups[0].rows.map((row) => row.campaign).sort()).toStrictEqual(
      ["Leads", "Shop"],
    );
  });

  it("a traffic group totals its followers and prices profile campaigns only", () => {
    const traffic = (campaign: string, data: Record<string, unknown>) =>
      fb(campaign, { campaign_type: "traffic", ...data });
    const [week] = buildWeeklyCampaignSections(
      [
        traffic("Profile", {
          destination_type: "INSTAGRAM_PROFILE",
          spend: 120,
          new_followers: 30,
        }),
        traffic("Profile", {
          date: "2026-09-15",
          optimization_goal: "PROFILE_VISIT",
          spend: 300,
        }),
        traffic("Blog", {
          destination_type: "WEBSITE",
          spend: 300,
          new_followers: 2,
        }),
      ],
      { now: NOW },
    );
    const [group] = week.groups;
    expect(group.totals.followers).toStrictEqual({
      newFollowers: 32,
      followerSpend: 420,
      profileTraffic: true,
    });
    expect(group.totals.costPerFollower).toBe(4);
  });
});

describe("weeklySourceModesForTable", () => {
  it("a mixed facebook_insights table splits its weekly tab by goal", () => {
    for (const settings of [{}, { campaign_type: "ecommerce" }, null]) {
      const [week] = buildWeeklyCampaignSections([shop, leadCampaign], {
        now: NOW,
        defaultSource: "facebook_insights",
        sourceModes: weeklySourceModesForTable(settings),
      });
      expect(week.groups.map((group) => group.kind)).toStrictEqual([
        "ecommerce",
        "leads",
      ]);
      // The sales campaign's spend stays out of the cost per lead.
      expect(week.groups[1].totals.costPerResult).toBe(30);
    }
  });

  it("a leads-only facebook_insights table keeps its weekly tab in leads", () => {
    for (const campaign_type of ["leads", "lead", "Leads"]) {
      const modes = weeklySourceModesForTable({ campaign_type });
      expect(modes.facebook_insights).toBe("leads");
      const [week] = buildWeeklyCampaignSections([shop, leadCampaign], {
        now: NOW,
        sourceModes: modes,
      });
      expect(week.groups.map((group) => group.kind)).toStrictEqual(["leads"]);
    }
  });
});
