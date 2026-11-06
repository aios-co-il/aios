import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { reportCampaignGoalOf } from "./campaign-goals.ts";

const meta = {
  id: "m",
  integration_type: "facebook_insights",
  integration_settings: {},
};
const leadsOnly = {
  ...meta,
  id: "lo",
  integration_settings: { campaign_type: "leads" },
};
const google = {
  id: "g",
  integration_type: "google_ads",
  integration_settings: { campaign_type: "ecommerce" },
};

Deno.test(
  "reportCampaignGoalOf gives each record its campaign's report goal",
  async (t) => {
    await t.step(
      "Meta: traffic, sales and leads by the campaign's setup",
      () => {
        const records = [
          {
            table_id: "m",
            data: {
              campaign_id: "1",
              campaign_objective: "OUTCOME_TRAFFIC",
              optimization_goal: "LANDING_PAGE_VIEWS",
            },
          },
          {
            table_id: "m",
            data: { campaign_id: "2", campaign_objective: "OUTCOME_SALES" },
          },
          {
            table_id: "m",
            data: { campaign_id: "3", campaign_objective: "OUTCOME_LEADS" },
          },
        ];
        const goalOf = reportCampaignGoalOf(records, [meta]);
        assertEquals(
          records.map((record) => goalOf(record)?.goal),
          ["traffic", "ecommerce", "leads"],
        );
      },
    );

    await t.step(
      "a leads-only Meta table keeps a sales campaign in leads",
      () => {
        const record = {
          table_id: "lo",
          data: { campaign_id: "4", campaign_objective: "OUTCOME_SALES" },
        };
        assertStrictEquals(
          reportCampaignGoalOf([record], [leadsOnly])(record)?.goal,
          "leads",
        );
      },
    );

    await t.step("Google: the table's goal, and the source behind it", () => {
      const record = {
        table_id: "g",
        data: { campaign_id: "9", campaign_name: "PMax", cost: 10 },
      };
      assertEquals(reportCampaignGoalOf([record], [google])(record), {
        goal: "ecommerce",
        source: "table_report_type",
      });
    });

    await t.step("a record of another kind of table has no goal", () => {
      const record = { table_id: "x", data: { campaign_id: "1" } };
      assertStrictEquals(reportCampaignGoalOf([record], [])(record), null);
    });
  },
);
