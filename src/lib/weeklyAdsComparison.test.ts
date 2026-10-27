import { expect, test } from "vitest";
import {
  buildWeeklyCampaignSections,
  formatWeeklyRange,
  getSundayStart,
  weeklySourceModesForTable,
} from "./weeklyAdsComparison.ts";

const record = (
  date: string,
  campaign: string,
  spend: number,
  leads: number,
  source = "facebook_insights",
) => ({
  _source: source,
  data: {
    date,
    campaign_id: campaign,
    campaign_name: campaign,
    entity_level: "campaign",
    spend,
    leads,
    impressions: 1000,
    clicks: 50,
  },
});

test("groups campaign records into Sunday–Saturday weeks, newest first", () => {
  const sections = buildWeeklyCampaignSections(
    [
      record("2026-09-13", "A", 100, 5),
      record("2026-09-18", "A", 50, 5),
      record("2026-09-12", "A", 80, 4),
      record("2026-09-06", "B", 40, 2),
    ],
    { now: new Date("2026-09-18T12:00:00Z") },
  );

  expect(sections.map((week) => [week.startDate, week.endDate])).toStrictEqual([
    ["2026-09-13", "2026-09-19"],
    ["2026-09-06", "2026-09-12"],
  ]);
  expect(sections[0].rows[0].spend).toBe(150);
  expect(sections[0].rows[0].results).toBe(10);
  expect(sections[0].rows[0].costPerResult).toBe(15);
  expect(sections[1].rows.length).toBe(2);
});

test("excludes ad-set and ad rows so campaign totals are not tripled", () => {
  const base = record("2026-09-14", "A", 100, 5);
  const sections = buildWeeklyCampaignSections(
    [
      base,
      { ...base, data: { ...base.data, entity_level: "adset" } },
      { ...base, data: { ...base.data, entity_level: "ad" } },
    ],
    { now: new Date("2026-09-18T12:00:00Z") },
  );

  expect(sections[0].totals.spend).toBe(100);
  expect(sections[0].groups[0].totals.results).toBe(5);
});

test("separates same-named campaigns from different platforms", () => {
  const sections = buildWeeklyCampaignSections(
    [
      record("2026-09-14", "Brand", 100, 5, "facebook_insights"),
      record("2026-09-14", "Brand", 200, 10, "google_ads"),
    ],
    { now: new Date("2026-09-18T12:00:00Z") },
  );

  expect(sections[0].rows.length).toBe(2);
  expect(sections[0].rows.map((row) => row.source).sort()).toStrictEqual([
    "facebook_insights",
    "google_ads",
  ]);
});

test("uses purchases and ROAS for ecommerce campaigns", () => {
  const sections = buildWeeklyCampaignSections(
    [
      {
        _source: "facebook_ecommerce",
        data: {
          date: "2026-09-14",
          campaign_id: "shop",
          campaign_name: "Shop",
          spend: 200,
          purchases: 4,
          purchase_value: 1000,
        },
      },
    ],
    { now: new Date("2026-09-18T12:00:00Z") },
  );

  expect(sections[0].rows[0].kind).toBe("ecommerce");
  expect(sections[0].rows[0].results).toBe(4);
  expect(sections[0].rows[0].costPerResult).toBe(50);
  expect(sections[0].rows[0].roas).toBe(5);
});

test("limits the comparison to the requested number of weeks", () => {
  const sections = buildWeeklyCampaignSections(
    [
      record("2026-09-14", "current", 100, 5),
      record("2025-09-15", "old", 100, 5),
    ],
    { now: new Date("2026-09-18T12:00:00Z"), maxWeeks: 52 },
  );

  expect(sections.map((week) => week.rows[0].campaign)).toStrictEqual([
    "current",
  ]);
});

test("week and heading formatting are timezone-independent", () => {
  expect(getSundayStart(new Date("2026-09-18T23:59:00Z")).toISOString()).toBe(
    "2026-09-13T00:00:00.000Z",
  );
  expect(formatWeeklyRange("2026-09-13", "2026-09-19")).toBe(
    "13/09/2026–19/09/2026",
  );
});

test("the current week rolls over at Sunday midnight in Jerusalem", () => {
  const sections = buildWeeklyCampaignSections(
    [
      record("2026-09-20", "new-week", 100, 5),
      record("2026-09-19", "previous-week", 100, 5),
    ],
    { now: new Date("2026-09-19T21:30:00Z") },
  );

  expect(sections[0].startDate).toBe("2026-09-20");
  expect(sections[0].rows[0].campaign).toBe("new-week");
  expect(sections[1].startDate).toBe("2026-09-13");
});

test("google campaigns use their own goal and lead value is not revenue", () => {
  const google = (campaign: string, value: number) => ({
    _source: "google_ads",
    data: {
      date: "2026-09-14",
      campaign_id: campaign,
      campaign_name: campaign,
      cost: 100,
      conversions: 2,
      conversions_value: value,
    },
  });
  const sections = buildWeeklyCampaignSections(
    [google("leads", 3), google("shop", 600)],
    {
      now: new Date("2026-09-18T12:00:00Z"),
      sourceModes: { google_ads: "leads" },
      googleCampaignGoals: new Map([["shop", "ecommerce"]]),
    },
  );
  const byId = Object.fromEntries(
    sections[0].rows.map((row) => [row.campaignId, row]),
  );
  expect(byId.leads.kind).toBe("leads");
  expect(byId.leads.revenue).toBe(0);
  expect(byId.leads.roas).toBe(0);
  expect(byId.shop.kind).toBe("ecommerce");
  expect(byId.shop.roas).toBe(6);
  const [sales, leads] = sections[0].groups;
  expect(sales.kind).toBe("ecommerce");
  expect(sales.totals.revenue).toBe(600);
  expect(sales.totals.roas).toBe(6);
  expect(leads.kind).toBe("leads");
  expect(leads.totals.revenue).toBe(0);
});

test("a leads-only google week carries no revenue", () => {
  const sections = buildWeeklyCampaignSections(
    [
      {
        _source: "google_ads",
        data: {
          date: "2026-09-14",
          campaign_id: "a",
          campaign_name: "תרגום משפטי",
          cost: 750,
          conversions: 4,
          conversions_value: 3,
        },
      },
    ],
    {
      now: new Date("2026-09-18T12:00:00Z"),
      sourceModes: { google_ads: "leads" },
    },
  );
  expect(sections[0].rows.every((row) => row.kind === "leads")).toBeTruthy();
  expect(sections[0].groups.map((group) => group.kind)).toStrictEqual([
    "leads",
  ]);
  expect(sections[0].groups[0].totals.revenue).toBe(0);
});

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

test("a lead-only week has one leads group with no revenue", () => {
  const [week] = buildWeeklyCampaignSections(
    [record("2026-09-14", "A", 100, 5), record("2026-09-15", "B", 60, 2)],
    { now: NOW },
  );
  expect(week.groups.map((group) => group.kind)).toStrictEqual(["leads"]);
  expect(week.groups[0].totals.results).toBe(7);
  expect(week.groups[0].totals.costPerResult).toBeCloseTo(160 / 7);
  expect(week.groups[0].totals.revenue).toBe(0);
  expect(week.groups[0].totals.roas).toBe(0);
});

test("an ecommerce-only week has one sales group with purchases and ROAS", () => {
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

test("a mixed week splits sales and leads, each with its own totals", () => {
  const [week] = buildWeeklyCampaignSections(
    [
      record("2026-09-14", "Leads", 300, 10),
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

test("traffic campaigns get their own group, last, measured by clicks", () => {
  const [week] = buildWeeklyCampaignSections(
    [
      fb("Traffic", { campaign_type: "traffic", spend: 50, clicks: 200 }),
      record("2026-09-14", "Leads", 100, 5),
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
  expect(week.groups[0].rows.map((row) => row.campaign).sort()).toStrictEqual([
    "Leads",
    "Shop",
  ]);
});

test("facebook goals follow the Meta objective like the report tables", () => {
  const [week] = buildWeeklyCampaignSections(
    [
      // A sales campaign without purchases this week is still a sales campaign.
      fb("Sales", { campaign_objective: "OUTCOME_SALES", spend: 90 }),
      // WhatsApp campaigns stored as traffic are lead campaigns.
      fb("WhatsApp", {
        campaign_type: "traffic",
        campaign_name: "WhatsApp לידים",
        spend: 40,
        leads: 4,
      }),
    ],
    { now: NOW },
  );
  const kinds = Object.fromEntries(
    week.rows.map((row) => [row.campaignId, row.kind]),
  );
  expect(kinds).toStrictEqual({ Sales: "ecommerce", WhatsApp: "leads" });
  expect(week.groups.map((group) => group.kind)).toStrictEqual([
    "ecommerce",
    "leads",
  ]);
});

test("a legacy CONVERSIONS campaign stored as leads stays in leads", () => {
  const legacy = fb("LegacyLead", {
    campaign_type: "lead",
    campaign_objective: "CONVERSIONS",
    leads: 5,
    spend: 100,
  });
  for (const sourceModes of [{}, { facebook_insights: "ecommerce" as const }]) {
    const [week] = buildWeeklyCampaignSections([legacy], {
      now: NOW,
      sourceModes,
    });
    expect(week.groups.map((group) => group.kind)).toStrictEqual(["leads"]);
    expect(week.groups[0].totals).toMatchObject({
      results: 5,
      costPerResult: 20,
      revenue: 0,
      roas: 0,
    });
  }
});

test("a legacy CONVERSIONS campaign stored as sales stays in sales", () => {
  const [week] = buildWeeklyCampaignSections(
    [
      fb("LegacyShop", {
        campaign_type: "ecommerce",
        campaign_objective: "CONVERSIONS",
        spend: 100,
        purchases: 2,
        purchase_value: 300,
      }),
    ],
    { now: NOW },
  );
  expect(week.groups.map((group) => group.kind)).toStrictEqual(["ecommerce"]);
  expect(week.groups[0].totals.roas).toBe(3);
});

test("a mixed facebook_insights table splits its weekly tab by goal", () => {
  const records = [
    fb("Shop", {
      campaign_objective: "OUTCOME_SALES",
      spend: 200,
      purchases: 4,
    }),
    fb("Leads", { campaign_type: "lead", spend: 300, leads: 10 }),
  ];
  for (const settings of [{}, { campaign_type: "ecommerce" }, null]) {
    const [week] = buildWeeklyCampaignSections(records, {
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

test("a leads-only facebook_insights table keeps its weekly tab in leads", () => {
  const records = [
    fb("Shop", {
      campaign_objective: "OUTCOME_SALES",
      spend: 200,
      purchases: 4,
    }),
    fb("Leads", { campaign_type: "lead", spend: 300, leads: 10 }),
  ];
  for (const campaign_type of ["leads", "lead", "Leads"]) {
    const modes = weeklySourceModesForTable({ campaign_type });
    expect(modes.facebook_insights).toBe("leads");
    const [week] = buildWeeklyCampaignSections(records, {
      now: NOW,
      sourceModes: modes,
    });
    expect(week.groups.map((group) => group.kind)).toStrictEqual(["leads"]);
  }
});
