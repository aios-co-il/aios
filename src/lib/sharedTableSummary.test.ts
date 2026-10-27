import { describe, expect, it } from "vitest";
import {
  groupSharedFacebookRows,
  summarizeSharedTableRecords,
} from "./sharedTableSummary";

const google = (
  goal: "ecommerce" | "leads",
  data: Record<string, unknown>,
) => ({
  data: { goal, impressions: 1000, clicks: 50, ...data },
});
const goalOf = (data: Record<string, unknown>) =>
  data.goal === "ecommerce" ? ("ecommerce" as const) : ("leads" as const);

const fb = (campaign: string, data: Record<string, unknown>) => ({
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
// One sales, one lead and one traffic campaign in a facebook_insights table.
const mixedFacebook = [
  fb("Shop", {
    campaign_objective: "OUTCOME_SALES",
    campaign_type: "ecommerce",
    spend: 200,
    purchases: 4,
    purchase_value: 800,
  }),
  fb("Leads", { campaign_type: "lead", spend: 300, leads: 10 }),
  fb("Traffic", { campaign_type: "traffic", spend: 100, clicks: 400 }),
];
const names = (rows: Array<{ name: string }>) => rows.map((row) => row.name);

describe("shared table summary", () => {
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
        goals: { ecommerce: true, leads: true },
        forceLeadsOnly: false,
        forceEcommerceOnly: false,
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
        goals: null,
        forceLeadsOnly: true,
        forceEcommerceOnly: false,
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

describe("shared facebook insights table", () => {
  it("a mixed table splits sales, leads and traffic like the internal report", () => {
    const groups = groupSharedFacebookRows(mixedFacebook, "campaign", {
      leadsOnly: false,
    });
    expect(names(groups.ecommerce)).toStrictEqual(["Shop"]);
    expect(names(groups.leads)).toStrictEqual(["Leads"]);
    expect(names(groups.traffic)).toStrictEqual(["Traffic"]);

    const summary = summarizeSharedTableRecords(mixedFacebook, {
      integrationType: "facebook_insights",
      goalOf: groups.goalOf,
      goals: { ecommerce: true, leads: true },
      forceLeadsOnly: false,
      forceEcommerceOnly: false,
    });
    expect(summary.spend).toBe(600);
    expect(summary.revenue).toBe(800);
    expect(summary.purchases).toBe(4);
    // ROAS over sales spend only, cost per lead over lead spend only.
    expect(summary.roas).toBe(4);
    expect(summary.leads).toBe(10);
    expect(summary.cpl).toBe(30);
  });

  it("a sales campaign with pixel leads stays in sales and adds no leads", () => {
    const records = [
      fb("Shop", {
        campaign_objective: "OUTCOME_SALES",
        spend: 200,
        purchases: 2,
        purchase_value: 400,
        leads: 3,
      }),
      fb("Leads", { campaign_type: "lead", spend: 100, leads: 5 }),
    ];
    const groups = groupSharedFacebookRows(records, "campaign", {
      leadsOnly: false,
    });
    expect(names(groups.ecommerce)).toStrictEqual(["Shop"]);
    const summary = summarizeSharedTableRecords(records, {
      integrationType: "facebook_insights",
      goalOf: groups.goalOf,
      goals: { ecommerce: true, leads: true },
      forceLeadsOnly: false,
      forceEcommerceOnly: false,
    });
    expect(summary.leads).toBe(5);
    expect(summary.cpl).toBe(20);
    expect(summary.roas).toBe(2);
  });

  it("a leads-only table keeps sales-looking campaigns in leads, traffic apart", () => {
    const groups = groupSharedFacebookRows(mixedFacebook, "campaign", {
      leadsOnly: true,
    });
    expect(groups.ecommerce).toStrictEqual([]);
    expect(names(groups.leads)).toStrictEqual(["Leads", "Shop"]);
    expect(names(groups.traffic)).toStrictEqual(["Traffic"]);

    const summary = summarizeSharedTableRecords(mixedFacebook, {
      integrationType: "facebook_insights",
      goalOf: groups.goalOf,
      goals: { ecommerce: false, leads: true },
      forceLeadsOnly: true,
      forceEcommerceOnly: false,
    });
    expect(summary).toMatchObject({
      spend: 600,
      leads: 10,
      // Traffic spend does not raise the cost per lead.
      cpl: 50,
      purchases: 0,
      revenue: 0,
      roas: 0,
      hasEcommerce: false,
      hasLeads: true,
    });
  });

  it("splits ad sets by their campaign's goal", () => {
    const adset = (name: string, data: Record<string, unknown>) => ({
      data: {
        entity_level: "adset",
        adset_id: name,
        adset_name: name,
        impressions: 100,
        clicks: 5,
        ...data,
      },
    });
    const records = [
      adset("Shop set", {
        campaign_name: "Shop",
        campaign_objective: "OUTCOME_SALES",
        spend: 50,
        purchases: 1,
        purchase_value: 150,
      }),
      adset("Lead set", {
        campaign_name: "Leads",
        // A stale stored type loses to the Meta objective.
        campaign_type: "ecommerce",
        campaign_objective: "OUTCOME_LEADS",
        spend: 40,
        leads: 4,
      }),
    ];
    const groups = groupSharedFacebookRows(records, "adset", {
      leadsOnly: false,
    });
    expect(names(groups.ecommerce)).toStrictEqual(["Shop set · Shop"]);
    expect(names(groups.leads)).toStrictEqual(["Lead set · Leads"]);
    expect(groups.goalOf(records[1].data)).toBe("leads");
  });
});
