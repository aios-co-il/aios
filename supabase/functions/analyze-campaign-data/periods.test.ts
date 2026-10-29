import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { analyzePeriods } from "./periods.ts";

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

describe("analyzePeriods", () => {
  it("counts leads by each campaign's report goal and CPL on lead spend", () => {
    const { eventPeriods, campaignPeriodData } = analyzePeriods({
      records: [
        day("2026-10-08", {
          campaign_name: "לידים",
          campaign_objective: "OUTCOME_LEADS",
          spend: 60,
          leads: 6,
        }),
        day("2026-10-09", {
          campaign_name: "מכירות",
          campaign_objective: "OUTCOME_SALES",
          spend: 100,
          purchases: 1,
          leads: 4,
        }),
        day("2026-09-01", {
          campaign_name: "לידים",
          campaign_objective: "OUTCOME_LEADS",
          spend: 999,
          leads: 99,
        }),
      ],
      table: meta,
      windows: [
        { eventDate: "10.10", startDate: "2026-10-03", endDate: "2026-10-10" },
      ],
      byCampaign: true,
    });
    assertEquals(
      [
        eventPeriods[0].metrics.totalSpend,
        eventPeriods[0].metrics.totalLeads,
        eventPeriods[0].metrics.avgCostPerLead,
      ],
      [160, 6, 10],
    );
    assertEquals(
      campaignPeriodData.map((row) => [row.campaignName, row.goal, row.leads]),
      [
        ["לידים", "leads", 6],
        ["מכירות", "ecommerce", 0],
      ],
    );
  });
});
