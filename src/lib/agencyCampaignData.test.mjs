import { describe, expect, test } from "vitest";
import {
  buildClientCampaignTableData,
  isFacebookIntegration,
} from "./agencyCampaignData.ts";

test("buildClientCampaignTableData aggregates campaigns per client table", () => {
  const rows = buildClientCampaignTableData({
    clients: [{ id: "c1", name: "Client A" }],
    tables: [
      {
        id: "t1",
        client_id: "c1",
        name: "FB",
        integration_type: "facebook_insights",
        integration_settings: null,
      },
    ],
    records: [
      {
        table_id: "t1",
        data: {
          date: "2026-09-10",
          campaign_name: "Lead Gen",
          impressions: 100,
          clicks: 10,
          leads: 2,
          spend: 50,
        },
      },
      {
        table_id: "t1",
        data: {
          date: "2026-09-11",
          campaign_name: "Lead Gen",
          impressions: 50,
          clicks: 5,
          leads: 1,
          spend: 25,
        },
      },
    ],
    startDate: "2026-09-01",
    endDate: "2026-09-15",
    platformFilter: "all",
  });

  expect(rows.length).toBe(1);
  expect(rows[0].records.length).toBe(1);
  expect(rows[0].totals.leads).toBe(3);
  expect(rows[0].totals.spend).toBe(75);
});

test("buildClientCampaignTableData respects platform filter", () => {
  const rows = buildClientCampaignTableData({
    clients: [{ id: "c1", name: "Client A" }],
    tables: [
      { id: "t1", client_id: "c1", integration_type: "facebook_insights" },
      { id: "t2", client_id: "c1", integration_type: "google_ads" },
    ],
    records: [
      {
        table_id: "t1",
        data: { date: "2026-09-10", campaign_name: "FB", spend: 10, leads: 1 },
      },
      {
        table_id: "t2",
        data: { date: "2026-09-10", campaign_name: "GA", spend: 20, leads: 2 },
      },
    ],
    startDate: "2026-09-01",
    endDate: "2026-09-15",
    platformFilter: "google_ads",
  });

  expect(rows.length).toBe(1);
  expect(rows[0].integrationType).toBe("google_ads");
  expect(rows[0].totals.spend).toBe(20);
});

describe("each campaign takes its report's goal and results", () => {
  const day = (table_id, data) => ({
    table_id,
    data: { date: "2026-09-10", entity_level: "campaign", ...data },
  });
  const build = (tables, records) =>
    buildClientCampaignTableData({
      clients: [{ id: "c1", name: "Client A" }],
      tables: tables.map((table) => ({ client_id: "c1", ...table })),
      records,
      startDate: "2026-09-01",
      endDate: "2026-09-15",
      platformFilter: "all",
    });

  test("a Facebook table counts sales, leads and traffic by goal", () => {
    const [table] = build(
      [{ id: "fb", integration_type: "facebook_insights" }],
      [
        day("fb", {
          campaign_id: "s",
          campaign_name: "מכירות",
          campaign_objective: "OUTCOME_SALES",
          spend: 100,
          purchases: 2,
          purchase_value: 500,
          leads: 3,
        }),
        day("fb", {
          campaign_id: "w",
          campaign_name: "ווטסאפ",
          campaign_objective: "OUTCOME_ENGAGEMENT",
          optimization_goal: "CONVERSATIONS",
          spend: 40,
          conversations: 4,
        }),
        day("fb", {
          campaign_id: "f",
          campaign_name: "טופס",
          campaign_objective: "OUTCOME_LEADS",
          spend: 30,
          form_leads: 5,
        }),
        day("fb", {
          campaign_id: "t",
          campaign_name: "תנועה",
          campaign_objective: "OUTCOME_TRAFFIC",
          spend: 20,
          leads: 1,
        }),
      ],
    );
    const byName = Object.fromEntries(
      table.records.map((row) => [
        row.campaignName,
        [row.goal, row.leads, row.purchases, row.revenue],
      ]),
    );
    // Before: a Facebook Insights table was always a lead table, conversations
    // and form leads counted 0, and the sales campaign's leads were leads.
    expect(table.campaignType).toBe("ecommerce");
    expect(byName).toStrictEqual({
      מכירות: ["ecommerce", 0, 2, 500],
      ווטסאפ: ["leads", 4, 0, 0],
      טופס: ["leads", 5, 0, 0],
      תנועה: ["traffic", 0, 0, 0],
    });
    expect(table.totals).toMatchObject({
      leads: 9,
      purchases: 2,
      revenue: 500,
      spend: 190,
    });
  });

  test("a Google Ads sales campaign's conversions are purchases, not leads", () => {
    const [table] = build(
      [
        {
          id: "g",
          integration_type: "google_ads",
          integration_settings: { campaign_type: "leads" },
        },
      ],
      [
        day("g", {
          campaign_id: "1",
          campaign_name: "PMax",
          conversion_goal: "ecommerce",
          cost: 90,
          conversions: 3,
          conversions_value: 400,
        }),
        day("g", {
          campaign_id: "2",
          campaign_name: "חיפוש",
          cost: 60,
          conversions: 2,
          conversions_value: 2,
        }),
      ],
    );
    expect(table.campaignType).toBe("ecommerce");
    expect(table.totals).toMatchObject({
      leads: 2,
      purchases: 3,
      revenue: 400,
      spend: 150,
    });
  });
});

describe("isFacebookIntegration nullable database source", () => {
  test.each([
    null,
    "",
    "facebook_insights",
    "facebook_ecommerce",
    "google_ads",
    "facebook",
    "FACEBOOK_INSIGHTS",
  ])("preserves the previous membership decision for %s", (source) => {
    expect(isFacebookIntegration(source)).toBe(
      ["facebook_insights", "facebook_ecommerce"].includes(source),
    );
  });
});
