import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { compareCampaignDays } from "./compare.ts";
import { googleTable, metaTable, row } from "./test-fixtures.ts";

describe("compareCampaignDays", () => {
  it("counts rows without entity_level as campaign rows and ignores adset rows", () => {
    const dates = ["2026-10-20"];
    const r = compareCampaignDays({
      table: metaTable,
      platform: "meta",
      dates,
      platformRows: [
        row("1", "2026-10-20", {
          spend: 100,
          leads: 4,
          campaign_objective: "OUTCOME_LEADS",
        }),
      ],
      aiosRows: [
        // Legacy row: no entity_level.
        row("1", "2026-10-20", { spend: 100, leads: 4 }),
        // Ad-set row of the same campaign would double count.
        row("1", "2026-10-20", { spend: 100, leads: 4, entity_level: "adset" }),
      ],
    });
    assertEquals(r.findings, []);
    assertEquals(r.campaigns, { aios: 1, platform: 1, both: 1 });
  });

  it("checks spend, results and revenue per campaign per day", () => {
    const dates = ["2026-10-20", "2026-10-21"];
    const sales = {
      spend: 500,
      purchases: 10,
      purchase_value: 4000,
      campaign_objective: "OUTCOME_SALES",
    };
    const r = compareCampaignDays({
      table: { ...metaTable, integration_type: "facebook_ecommerce" },
      platform: "meta",
      dates,
      platformRows: [
        row("1", "2026-10-20", sales),
        row("1", "2026-10-21", sales),
      ],
      aiosRows: [
        row("1", "2026-10-20", {
          spend: 500,
          purchases: 10,
          purchase_value: 4000,
        }),
        // Day 2: spend short by 30 (> 20), two purchases missing, revenue short by 200 (> 80).
        row("1", "2026-10-21", {
          spend: 470,
          purchases: 8,
          purchase_value: 3800,
        }),
      ],
    });
    assertEquals(
      r.findings.map((f) => [
        f.kind,
        f.date,
        f.metric,
        f.aios_value,
        f.platform_value,
      ]),
      [
        ["mismatch", "2026-10-21", "revenue", 3800, 4000],
        ["mismatch", "2026-10-21", "spend", 470, 500],
        ["mismatch", "2026-10-21", "purchases", 8, 10],
      ],
    );
    assertStrictEquals(r.counts.mismatch, 3);
  });

  it("reports a missing day and a campaign missing on each side", () => {
    const dates = ["2026-10-20", "2026-10-21"];
    const r = compareCampaignDays({
      table: metaTable,
      platform: "meta",
      dates,
      platformRows: [
        row("1", "2026-10-20", { spend: 100, leads: 2 }),
        row("1", "2026-10-21", { spend: 300, leads: 5 }),
        row("2", "2026-10-20", { spend: 80, leads: 1 }),
      ],
      aiosRows: [
        // Oct 21 has no rows at all in AIOS.
        row("1", "2026-10-20", { spend: 100, leads: 2 }),
        // A campaign Meta does not know (e.g. copied from another account).
        row("9", "2026-10-20", { spend: 55, leads: 1 }),
      ],
    });
    assertEquals(
      r.findings.map((f) => [
        f.kind,
        f.campaign_id,
        f.date,
        f.aios_value,
        f.platform_value,
      ]),
      [
        ["missing_day", null, "2026-10-21", 0, 300],
        ["missing_in_aios", "2", null, 0, 80],
        ["missing_on_platform", "9", null, 55, 0],
      ],
    );
    assertEquals(r.missing_dates, ["2026-10-21"]);
  });

  it("matches legacy rows that carry only a name to the platform id", () => {
    const r = compareCampaignDays({
      table: metaTable,
      platform: "meta",
      dates: ["2026-10-20"],
      platformRows: [
        row("1", "2026-10-20", { spend: 100, campaign_name: "קיץ | לידים" }),
      ],
      aiosRows: [
        {
          campaign_id: "",
          campaign_name: "קיץ | לידים",
          date: "2026-10-20",
          data: {
            campaign_name: "קיץ | לידים",
            date: "2026-10-20",
            spend: 100,
          },
        },
      ],
    });
    assertEquals(r.findings, []);
  });

  it("uses cost, conversions and conversions_value for Google", () => {
    const r = compareCampaignDays({
      table: googleTable,
      platform: "google",
      dates: ["2026-10-20"],
      platformRows: [
        row("55", "2026-10-20", {
          cost: 210.5,
          conversions: 7.5,
          conversions_value: 0,
        }),
      ],
      aiosRows: [
        row("55", "2026-10-20", {
          cost: 210.5,
          conversions: 5,
          conversions_value: 0,
        }),
      ],
    });
    assertEquals(
      r.findings.map((f) => [f.metric, f.aios_value, f.platform_value]),
      [["conversions", 5, 7.5]],
    );
  });
});
