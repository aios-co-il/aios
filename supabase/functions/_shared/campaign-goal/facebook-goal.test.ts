import { assertEquals } from "jsr:@std/assert@1";
import { facebookCampaignGoals } from "./facebook-goal.ts";

type Row = { data: Record<string, unknown> };

const trafficRow = (leads: number): Row => ({
  data: {
    campaign_id: "c1",
    campaign_objective: "OUTCOME_TRAFFIC",
    optimization_goal: "PROFILE_VISIT",
    leads,
  },
});

const engagementRow = (leads: number): Row => ({
  data: {
    campaign_id: "c1",
    campaign_objective: "OUTCOME_ENGAGEMENT",
    optimization_goal: "POST_ENGAGEMENT",
    leads,
  },
});

/** The goal of campaign c1 over these rows, in a table that is not leads-only. */
function goalOf(records: Array<Row>): string | undefined {
  return facebookCampaignGoals(records, (data) => String(data.campaign_id), {
    leadsOnly: false,
  }).get("c1");
}

Deno.test(
  "facebookCampaignGoal: a traffic campaign that measures leads",
  async (t) => {
    await t.step("stays traffic however many leads it measures", () => {
      // איימי בכור's Instagram traffic campaign: 45 leads in 30 days.
      assertEquals(goalOf([trafficRow(40), trafficRow(5)]), "traffic");
      assertEquals(goalOf([trafficRow(3)]), "traffic");
      assertEquals(goalOf([trafficRow(0)]), "traffic");
    });

    await t.step("an engagement campaign follows the same rule", () => {
      assertEquals(goalOf([engagementRow(3)]), "traffic");
      assertEquals(goalOf([engagementRow(34)]), "traffic");
    });

    await t.step("purchases alone never make it a sales campaign", () => {
      assertEquals(
        goalOf([{ data: { ...trafficRow(0).data, purchases: 9 } }]),
        "traffic",
      );
    });
  },
);
