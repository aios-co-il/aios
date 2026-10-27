import { describe, expect, it } from "vitest";
import { groupSharedFacebookRows } from "./sharedFacebookGroups";
import { summarizeSharedTableRecords } from "./sharedTableSummary";

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
const summarize = (
  records: Array<{ data: Record<string, unknown> }>,
  leadsOnly: boolean,
) => {
  const groups = groupSharedFacebookRows(records, "campaign", { leadsOnly });
  return summarizeSharedTableRecords(records, {
    integrationType: "facebook_insights",
    goalOf: groups.goalOf,
    goals: {
      ecommerce: groups.ecommerce.length > 0,
      leads: groups.leads.length > 0,
    },
    forceLeadsOnly: groups.ecommerce.length === 0,
    forceEcommerceOnly: groups.leads.length === 0,
  });
};

describe("groupSharedFacebookRows", () => {
  it("a mixed table splits sales, leads and traffic like the internal report", () => {
    const groups = groupSharedFacebookRows(mixedFacebook, "campaign", {
      leadsOnly: false,
    });
    expect(names(groups.ecommerce)).toStrictEqual(["Shop"]);
    expect(names(groups.leads)).toStrictEqual(["Leads"]);
    expect(names(groups.traffic)).toStrictEqual(["Traffic"]);

    const summary = summarize(mixedFacebook, false);
    expect(summary.spend).toBe(600);
    expect(summary.revenue).toBe(800);
    expect(summary.purchases).toBe(4);
    // ROAS over sales spend only, cost per lead over lead spend only.
    expect(summary.roas).toBe(4);
    expect(summary.leads).toBe(10);
    expect(summary.cpl).toBe(30);
  });

  it("a legacy CONVERSIONS lead campaign keeps its leads out of ROAS", () => {
    const records = [
      fb("LegacyLead", {
        campaign_type: "lead",
        campaign_objective: "CONVERSIONS",
        leads: 5,
        spend: 100,
      }),
      fb("Shop", {
        campaign_objective: "OUTCOME_SALES",
        spend: 100,
        purchases: 2,
        purchase_value: 400,
      }),
    ];
    const groups = groupSharedFacebookRows(records, "campaign", {
      leadsOnly: false,
    });
    expect(names(groups.leads)).toStrictEqual(["LegacyLead"]);
    expect(names(groups.ecommerce)).toStrictEqual(["Shop"]);
    expect(summarize(records, false)).toMatchObject({
      leads: 5,
      cpl: 20,
      roas: 4,
      hasLeads: true,
      hasEcommerce: true,
    });
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
    expect(summarize(records, false)).toMatchObject({
      leads: 5,
      cpl: 20,
      roas: 2,
    });
  });

  it("a leads-only table keeps sales-looking campaigns in leads, traffic apart", () => {
    const groups = groupSharedFacebookRows(mixedFacebook, "campaign", {
      leadsOnly: true,
    });
    expect(groups.ecommerce).toStrictEqual([]);
    expect(names(groups.leads)).toStrictEqual(["Leads", "Shop"]);
    expect(names(groups.traffic)).toStrictEqual(["Traffic"]);
    expect(summarize(mixedFacebook, true)).toMatchObject({
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
