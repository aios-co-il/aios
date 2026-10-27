import { describe, expect, test } from "vitest";
import {
  buildWeeklyCampaignSections,
  formatWeeklyRange,
  getSundayStart,
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

describe("buildWeeklyCampaignSections – Google campaign goals", () => {
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

  test("a Facebook leads campaign keeps its conversion value", () => {
    const sections = buildWeeklyCampaignSections(
      [
        {
          _source: "facebook_insights",
          data: {
            date: "2026-09-14",
            campaign_id: "fb",
            campaign_name: "לידים",
            spend: 100,
            leads: 5,
            purchase_value: 250,
          },
        },
      ],
      {
        now: new Date("2026-09-18T12:00:00Z"),
        sourceModes: { facebook_insights: "leads" },
      },
    );
    expect(sections[0].rows[0].kind).toBe("leads");
    expect(sections[0].rows[0].revenue).toBe(250);
    const [leads] = sections[0].groups;
    expect(leads.kind).toBe("leads");
    expect(leads.totals.revenue).toBe(250);
    expect(leads.totals.roas).toBe(2.5);
  });
});

test("google rows carry no followers", () => {
  const sections = buildWeeklyCampaignSections(
    [
      {
        _source: "google_ads",
        data: {
          date: "2026-09-14",
          campaign_id: "a",
          campaign_name: "a",
          cost: 100,
          new_followers: 5,
        },
      },
    ],
    { now: new Date("2026-09-18T12:00:00Z") },
  );
  expect(sections[0].rows[0].followers.newFollowers).toBeNull();
  expect(sections[0].rows[0].costPerFollower).toBeNull();
});
