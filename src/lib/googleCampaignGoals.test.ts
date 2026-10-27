import { describe, expect, it } from "vitest";
import {
  type GoogleAdsRowData,
  googleCampaignGoalOf,
  googleCampaignGoalsForRecords,
  googleReportCampaignGoals,
  googleReportCampaignKey,
} from "./googleCampaignGoals";

const googleTable = (
  id: string,
  settings: Record<string, unknown> = {},
  category = "Google Ads",
) => ({
  id,
  integration_type: "google_ads",
  integration_settings: settings,
  category,
});

const googleRow = (table_id: string, date: string, data: GoogleAdsRowData) => ({
  table_id,
  data: { date, entity_level: "campaign", ...data },
});

const lastWeek = [
  "2026-10-17",
  "2026-10-18",
  "2026-10-19",
  "2026-10-20",
  "2026-10-21",
  "2026-10-22",
  "2026-10-23",
];

describe("googleReportCampaignGoals", () => {
  it("reports get each Google campaign's own goal", () => {
    const records = lastWeek.flatMap((date) => [
      googleRow("g", date, {
        campaign_id: "pmax-shop",
        campaign_name: "PMax חנות",
        conversion_goal: "ecommerce",
        cost: 100,
      }),
      googleRow("g", date, {
        campaign_id: "pmax-leads",
        campaign_name: "PMax כללי",
        conversion_goal: "leads",
        cost: 100,
        conversions_value: 5,
      }),
      googleRow("g", date, {
        campaign_id: "search",
        campaign_name: "Search",
        cost: 50,
      }),
    ]);
    const goals = googleReportCampaignGoals(records, [
      googleTable("g", { campaign_type: "ecommerce" }, "איקומרס"),
    ]);
    expect(goals.get("pmax-shop")).toBe("ecommerce");
    expect(goals.get("pmax-leads")).toBe("leads");
    expect(goals.get("search")).toBe("ecommerce");
  });
});

describe("googleCampaignGoalsForRecords", () => {
  it("classifies a record without a table id with the only Google table", () => {
    const goals = googleCampaignGoalsForRecords(
      [{ data: { campaign_id: "a", campaign_name: "A" } }],
      [googleTable("g", { campaign_type: "ecommerce" }, "איקומרס")],
    );
    expect(goals.get("a")).toBe("ecommerce");
  });

  it("classifies a shared-dashboard record with the settings it carries", () => {
    const goals = googleCampaignGoalsForRecords(
      [
        {
          _integrationSettings: { campaign_type: "ecommerce" },
          data: { campaign_id: "a" },
        },
        { _integrationSettings: {}, data: { campaign_id: "b" } },
      ],
      [googleTable("g"), googleTable("h")],
    );
    expect(goals.get("a")).toBe("ecommerce");
    expect(goals.get("b")).toBe("leads");
  });
});

describe("googleCampaignGoalOf", () => {
  it("uses the fallback for rows without a campaign id or name", () => {
    const lookup = googleCampaignGoalOf(
      [
        {
          table_id: "g",
          data: { campaign_id: "shop", conversion_goal: "ecommerce" },
        },
        { table_id: "g", data: { cost: 5 } },
      ],
      [googleTable("g")],
      "leads",
    );
    expect(lookup.goalOf({ campaign_id: "shop" })).toBe("ecommerce");
    expect(lookup.goalOf({ cost: 5 })).toBe("leads");
    expect(lookup.hasEcommerce).toBe(true);
    expect(lookup.hasLeads).toBe(true);
  });

  it("takes both flags from the fallback when there are no rows", () => {
    const lookup = googleCampaignGoalOf([], [googleTable("g")], "ecommerce");
    expect(lookup.hasEcommerce).toBe(true);
    expect(lookup.hasLeads).toBe(false);
  });
});

describe("googleReportCampaignKey", () => {
  it("keys a campaign by its id, then its name", () => {
    expect(
      googleReportCampaignKey({ campaign_id: "1", campaign_name: "A" }),
    ).toBe("1");
    expect(googleReportCampaignKey({ campaign_name: "A" })).toBe("A");
    expect(googleReportCampaignKey({ campaign: "A" })).toBe("");
    expect(googleReportCampaignKey(null)).toBe("");
  });
});
