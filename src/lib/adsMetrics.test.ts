import { expect, test } from "vitest";
import {
  aggregateFacebookCampaignsFromRecords,
  effectiveFacebookCampaignType,
  facebookTableUsesMixedRows,
  getLeadsFromData,
  getMessagingLeadsFromData,
  isFacebookMessagingLeadRecord,
  groupFacebookCampaigns,
  isFacebookEcommerceCampaign,
  preferFacebookCampaignType,
  summarizeFacebookCampaignGroup,
  getAddToCartFromData,
  getAdsPurchasesFromData,
  getPurchasesFromData,
  getRevenueFromData,
  getSpendFromData,
  hasAddToCartMetric,
  facebookObjectiveKind,
} from "./adsMetrics.ts";

// Real record shapes as written by each sync into `crm_records.data`.
const googleAdsRow = {
  date: "2026-07-15",
  campaign_id: "22264861592",
  campaign_name: "Performance Max- קהל מקצועי+ביתי",
  impressions: 4179,
  clicks: 89,
  ctr: 2.13,
  cpc: 1.95,
  cost: 173.55,
  conversions: 3.5,
  conversions_value: 2190,
  all_conversions: 4.2,
  all_conversions_value: 2190,
  cost_per_conversion: 49.58,
  roas: 12.62,
};

const facebookEcommerceRow = {
  date: "2026-07-20",
  campaign_id: "120232338548940345",
  campaign_name: "רימרקטינג - מכירות - אוג/ספט 2025",
  impressions: 2121,
  clicks: 12,
  spend: 45.93,
  purchases: 3,
  purchase_value: 7908,
  add_to_cart: 14,
  add_to_cart_value: 1114,
  roas: 172.18,
};

// Analytics rows carry `conversions` (key events) alongside `purchases`, so the
// generic purchases getter must never fall back to it.
const analyticsRow = {
  date: "2026-07-03",
  report_type: "daily",
  users: 132,
  sessions: 155,
  purchases: 2,
  purchase_value: 430.999998,
  add_to_cart: 34,
  conversions: 13,
};

test("Google Ads conversions count as purchases for an ecommerce ads row", () => {
  // The row has no `purchases` field at all — reading it alone was the bug.
  expect(getPurchasesFromData(googleAdsRow)).toBe(0);
  expect(getAdsPurchasesFromData(googleAdsRow)).toBe(3.5);
  expect(getRevenueFromData(googleAdsRow)).toBe(2190);
  expect(getSpendFromData(googleAdsRow)).toBe(173.55);
});

test("Facebook purchases win over any conversion fallback", () => {
  expect(getAdsPurchasesFromData(facebookEcommerceRow)).toBe(3);
  expect(getRevenueFromData(facebookEcommerceRow)).toBe(7908);
  expect(getSpendFromData(facebookEcommerceRow)).toBe(45.93);
});

test("Analytics purchases ignore key events reported as conversions", () => {
  expect(getPurchasesFromData(analyticsRow)).toBe(2);
  expect(getRevenueFromData(analyticsRow)).toBe(430.999998);
});

test("Analytics revenue prefers purchase_value over total_revenue (matches combined dashboard)", () => {
  const row = {
    date: "2026-08-15",
    report_type: "daily",
    purchases: 5,
    purchase_value: 9806,
    total_revenue: 12225,
  };
  expect(getRevenueFromData(row)).toBe(9806);
});

test("Analytics revenue falls back to total_revenue when purchase_value is missing", () => {
  const row = {
    date: "2026-08-15",
    report_type: "daily",
    total_revenue: 12225,
  };
  expect(getRevenueFromData(row)).toBe(12225);
});

test("add-to-cart is tracked by Facebook and Analytics but not by Google Ads", () => {
  expect(hasAddToCartMetric(facebookEcommerceRow)).toBe(true);
  expect(getAddToCartFromData(facebookEcommerceRow)).toBe(14);
  expect(hasAddToCartMetric(analyticsRow)).toBe(true);
  expect(getAddToCartFromData(analyticsRow)).toBe(34);
  expect(hasAddToCartMetric(googleAdsRow)).toBe(false);
  expect(getAddToCartFromData(googleAdsRow)).toBe(0);
});

test("a tracked but empty add-to-cart day stays a real zero", () => {
  const quietDay = { ...facebookEcommerceRow, add_to_cart: 0 };
  expect(hasAddToCartMetric(quietDay)).toBe(true);
  expect(getAddToCartFromData(quietDay)).toBe(0);
});

test("the platform breakdown row matches the Google Ads tab totals", () => {
  // Same 30-day window the dashboard aggregates, one row per campaign/day.
  const rows = [
    {
      ...googleAdsRow,
      date: "2026-07-15",
      conversions: 3.5,
      conversions_value: 2190,
      cost: 173.55,
    },
    {
      ...googleAdsRow,
      date: "2026-07-16",
      conversions: 0,
      conversions_value: 0,
      cost: 143.09,
    },
    {
      ...googleAdsRow,
      date: "2026-07-17",
      conversions: 2.26,
      conversions_value: 1409,
      cost: 155.4,
    },
  ];

  // "All" tab: platform breakdown row.
  const breakdown = rows.reduce(
    (acc, row) => ({
      purchases: acc.purchases + getAdsPurchasesFromData(row),
      revenue: acc.revenue + getRevenueFromData(row),
      spend: acc.spend + getSpendFromData(row),
    }),
    { purchases: 0, revenue: 0, spend: 0 },
  );

  // Google Ads tab: campaign summary totals read the raw Google Ads fields.
  const googleAdsTab = rows.reduce(
    (acc, row) => ({
      conversions: acc.conversions + row.conversions,
      conversions_value: acc.conversions_value + row.conversions_value,
      spend: acc.spend + row.cost,
    }),
    { conversions: 0, conversions_value: 0, spend: 0 },
  );

  expect(breakdown.purchases).toBe(googleAdsTab.conversions);
  expect(breakdown.revenue).toBe(googleAdsTab.conversions_value);
  expect(breakdown.spend).toBe(googleAdsTab.spend);
});

test("aggregateFacebookCampaignsFromRecords ignores adset/ad rows to avoid triple-counting", () => {
  const records = [
    {
      data: {
        entity_level: "campaign",
        campaign_name: "Camp A",
        spend: 100,
        leads: 5,
      },
    },
    {
      data: {
        entity_level: "adset",
        campaign_name: "Camp A",
        spend: 100,
        leads: 5,
      },
    },
    {
      data: {
        entity_level: "ad",
        campaign_name: "Camp A",
        spend: 100,
        leads: 5,
      },
    },
  ];
  const rows = aggregateFacebookCampaignsFromRecords(records);
  expect(rows.length).toBe(1);
  expect(rows[0].spend).toBe(100);
  expect(rows[0].leads).toBe(5);
});

test("mixed Facebook table is detected when campaign_type is unset", () => {
  expect(facebookTableUsesMixedRows("facebook_insights", {})).toBe(true);
  expect(
    facebookTableUsesMixedRows("facebook_insights", { campaign_type: "leads" }),
  ).toBe(false);
  expect(facebookTableUsesMixedRows("facebook_ecommerce", {})).toBe(false);
});

test("sales campaign with pixel leads and zero purchases stays in the ecommerce table", () => {
  expect(
    isFacebookEcommerceCampaign({
      leads: 100,
      purchases: 0,
      purchase_value: 0,
      campaign_type: "ecommerce",
    }),
  ).toBe(true);
});

test("checkout result stays on the ecommerce table beside its leads", () => {
  const row = {
    name: "SmartAir - Genesis - מכירות",
    impressions: 32925,
    clicks: 323,
    spend: 629,
    leads: 34,
    purchases: 0,
    purchase_value: 0,
    add_to_cart: 0,
    campaign_type: "lead",
    result_kind: "initiate_checkout",
  };
  expect(isFacebookEcommerceCampaign(row)).toBe(true);
  expect(
    isFacebookEcommerceCampaign({ ...row, result_kind: "purchases" }),
  ).toBe(true);
});

test("preferFacebookCampaignType keeps a sales label over a later lead day", () => {
  expect(preferFacebookCampaignType("ecommerce", "lead")).toBe("ecommerce");
  expect(preferFacebookCampaignType("lead", "ecommerce")).toBe("ecommerce");
  expect(preferFacebookCampaignType("other", "lead")).toBe("lead");
  expect(preferFacebookCampaignType("traffic", "lead")).toBe("lead");
});

test("a dashboard without a mixed table keeps traffic in its own table", () => {
  const campaigns = [
    {
      name: "מכירות אוגוסט 2",
      impressions: 1000,
      clicks: 50,
      spend: 572,
      leads: 0,
      purchases: 6,
      purchase_value: 2903,
      add_to_cart: 10,
      campaign_type: "ecommerce",
    },
    {
      name: "לידים דרושים",
      impressions: 2000,
      clicks: 80,
      spend: 400,
      leads: 36,
      purchases: 0,
      purchase_value: 0,
      add_to_cart: 0,
      campaign_type: "lead",
    },
    {
      name: "תנועה אוגוסט",
      impressions: 5000,
      clicks: 250,
      spend: 539,
      leads: 0,
      purchases: 0,
      purchase_value: 0,
      add_to_cart: 0,
      campaign_type: "traffic",
    },
    {
      name: "מודעות פתחנו",
      impressions: 800,
      clicks: 20,
      spend: 280,
      leads: 0,
      purchases: 0,
      purchase_value: 0,
      add_to_cart: 0,
      campaign_type: "other",
    },
  ];

  // Ecommerce-only reports keep known lead campaigns (by objective) in the leads table.
  const singleEcom = groupFacebookCampaigns(campaigns, {
    singleTableMode: "ecommerce",
  });
  expect(singleEcom.ecommerce.length).toBe(2);
  expect(singleEcom.leads.length).toBe(1);
  expect(singleEcom.traffic.length).toBe(1);

  const singleLeads = groupFacebookCampaigns(campaigns, {
    singleTableMode: "leads",
  });
  expect(singleLeads.ecommerce.length).toBe(0);
  expect(singleLeads.leads.length).toBe(3);
  expect(singleLeads.traffic.length).toBe(1);
});

test("summarizeFacebookCampaignGroup totals match campaign rows for All-tab breakdown", () => {
  const campaigns = [
    {
      name: "מכירות אוגוסט 2",
      impressions: 25100,
      clicks: 581,
      spend: 572,
      leads: 0,
      purchases: 6,
      purchase_value: 2903,
      add_to_cart: 44,
      campaign_type: "ecommerce",
    },
    {
      name: "מכירות אוגוסט",
      impressions: 8800,
      clicks: 110,
      spend: 157,
      leads: 0,
      purchases: 1,
      purchase_value: 109,
      add_to_cart: 5,
      campaign_type: "ecommerce",
    },
  ];
  const summary = summarizeFacebookCampaignGroup(campaigns);
  expect(summary.impressions).toBe(33900);
  expect(summary.clicks).toBe(691);
  expect(summary.spend).toBe(729);
  expect(summary.purchases).toBe(7);
  expect(summary.revenue).toBe(3012);
  expect(summary.addToCart).toBe(49);
  expect(summary.roas).toBe(3012 / 729);
});

test("WhatsApp campaigns stored as traffic render as leads (אלהם פארמה pattern)", () => {
  const row = {
    campaign_name: "מעורבות | 18.8 - וואטסאפ",
    campaign_type: "traffic",
    optimization_goal: "LINK_CLICKS",
    campaign_objective: "OUTCOME_ENGAGEMENT",
    clicks: 394,
    spend: 250,
    conversations: 12,
    result_kind: "conversations",
    results: 12,
  };
  expect(isFacebookMessagingLeadRecord(row)).toBe(true);
  expect(effectiveFacebookCampaignType(row)).toBe("lead");
  expect(getMessagingLeadsFromData(row)).toBe(12);
  expect(getLeadsFromData(row)).toBe(12);
});

test("Meta objective decides the Facebook campaign kind over stale stored types", () => {
  // Sales campaign mislabeled "lead" by an older sync (incidental conversations).
  expect(
    effectiveFacebookCampaignType({
      campaign_objective: "OUTCOME_SALES",
      optimization_goal: "OFFSITE_CONVERSIONS",
      campaign_type: "lead",
    }),
  ).toBe("ecommerce");
  // Message-optimized sales campaigns stay ecommerce; their conversations show as leads on the row.
  expect(
    effectiveFacebookCampaignType({
      campaign_objective: "OUTCOME_SALES",
      optimization_goal: "CONVERSATIONS",
    }),
  ).toBe("ecommerce");
  expect(facebookObjectiveKind({ campaign_objective: "OUTCOME_TRAFFIC" })).toBe(
    null,
  );
});

test("ecommerce-only report still lists its lead campaigns as leads", () => {
  const grouped = groupFacebookCampaigns(
    [
      {
        name: "מכירות",
        impressions: 0,
        clicks: 0,
        spend: 500,
        leads: 0,
        purchases: 5,
        purchase_value: 900,
        add_to_cart: 0,
        campaign_type: "ecommerce",
      },
      {
        name: "דרושים | לידים",
        impressions: 0,
        clicks: 0,
        spend: 100,
        leads: 20,
        purchases: 0,
        purchase_value: 0,
        add_to_cart: 0,
        campaign_type: "lead",
      },
    ],
    { singleTableMode: "ecommerce" },
  );
  expect(grouped.ecommerce.map((c) => c.name)).toStrictEqual(["מכירות"]);
  expect(grouped.leads.map((c) => c.name)).toStrictEqual(["דרושים | לידים"]);
});
