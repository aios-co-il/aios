import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { liveCampaignRows, storedCampaignRows } from "./campaign-rows.ts";

const meta = {
  id: "m",
  integration_type: "facebook_insights",
  integration_settings: {},
};

/** A stored Meta campaign × day row. */
const day = (date: string, data: Record<string, unknown>) => ({
  table_id: "m",
  data: { date, ...data },
});

const sales = {
  campaign_id: "1",
  campaign_name: "מכירות",
  campaign_objective: "OUTCOME_SALES",
};
const leads = {
  campaign_id: "2",
  campaign_name: "לידים",
  campaign_objective: "OUTCOME_LEADS",
};
const traffic = {
  campaign_id: "3",
  campaign_name: "תנועה",
  campaign_objective: "OUTCOME_TRAFFIC",
  optimization_goal: "LANDING_PAGE_VIEWS",
};

describe("storedCampaignRows", () => {
  it("gives each row its report goal and only that goal's result", () => {
    const rows = storedCampaignRows(
      [
        day("2026-11-01", { ...sales, spend: 100, purchases: 2, leads: 5 }),
        day("2026-11-02", { ...leads, spend: 40, leads: 4 }),
        day("2026-11-03", { ...traffic, spend: 10, leads: 1 }),
      ],
      [meta],
    );
    assertEquals(
      rows.map((row) => ({
        name: row.campaign_name,
        goal: row.goal,
        results: row.results,
        leads: row.leads_count,
        purchases: row.purchases,
        cpl: row.cost_per_lead,
      })),
      [
        {
          name: "תנועה",
          goal: "traffic",
          results: null,
          leads: null,
          purchases: null,
          cpl: null,
        },
        {
          name: "לידים",
          goal: "leads",
          results: 4,
          leads: 4,
          purchases: null,
          cpl: 10,
        },
        {
          name: "מכירות",
          goal: "ecommerce",
          results: 2,
          leads: null,
          purchases: 2,
          cpl: null,
        },
      ],
    );
  });

  it("keeps the newest rows up to the limit", () => {
    const rows = storedCampaignRows(
      [
        day("2026-11-01", { ...leads, spend: 1 }),
        day("2026-11-03", { ...leads, spend: 3 }),
        day("2026-11-02", { ...leads, spend: 2 }),
      ],
      [meta],
      2,
    );
    assertEquals(
      rows.map((row) => row.date),
      ["2026-11-03", "2026-11-02"],
    );
  });
});

describe("liveCampaignRows", () => {
  it("sums each campaign's days and counts its report goal's results", () => {
    const rows = liveCampaignRows(
      [
        { data: { ...leads, date: "2026-11-01", spend: 30, leads: 2 } },
        { data: { ...leads, date: "2026-11-02", spend: 20, leads: 3 } },
        { data: { ...sales, date: "2026-11-02", spend: 80, purchases: 1 } },
      ],
      meta,
    );
    assertEquals(
      rows.map((row) => [row.campaign_name, row.goal, row.spend, row.results]),
      [
        ["מכירות", "ecommerce", 80, 1],
        ["לידים", "leads", 50, 5],
      ],
    );
    assertEquals(rows[1].cost_per_lead, 10);
  });

  it("a leads-only table judges a sales campaign as leads, as its report does", () => {
    const rows = liveCampaignRows(
      [{ data: { ...sales, date: "2026-11-02", spend: 80, leads: 4 } }],
      { ...meta, integration_settings: { campaign_type: "leads" } },
    );
    assertEquals([rows[0].goal, rows[0].results], ["leads", 4]);
  });
});
