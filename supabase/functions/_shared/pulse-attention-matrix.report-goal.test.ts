import { assertStrictEquals } from "jsr:@std/assert@1";
import { reportCampaignGoalOf } from "./campaign-goal/campaign-goals.ts";
import { buildPulseAttentionRows } from "./pulse-attention-matrix.mjs";
import {
  attentionClient,
  campaignDays,
  leadsTable,
  onlyRow,
} from "./pulse/test-fixtures.ts";

/** A client whose mood puts it on the matrix whatever its campaigns do. */
const wavering = (clientId: string) => ({
  ...attentionClient(clientId),
  moodStatus: "wavering",
});

Deno.test(
  "the attention matrix measures each campaign on the goal its report shows",
  async (t) => {
    await t.step(
      "a Meta sales campaign known by its results stays on ROAS in a leads report",
      () => {
        // No sales objective: the stored type and the purchase result make it
        // a sales campaign in the report. The matrix used to move it to leads.
        const records = campaignDays({
          tableId: "t-meta",
          campaignId: "s1",
          name: "קמפיין קטלוג",
          extra: {
            campaign_type: "ecommerce",
            optimization_goal: "OFFSITE_CONVERSIONS",
            result_kind: "purchases",
          },
          baseline: { spend: 100, purchases: 1, purchase_value: 300 },
          current: { spend: 100, purchases: 1, purchase_value: 50 },
        });
        const tables = [leadsTable("t-meta", "a")];
        assertStrictEquals(
          reportCampaignGoalOf(records, tables)(records[0])?.goal,
          "ecommerce",
        );

        const row = onlyRow(records, tables, null);
        assertStrictEquals(row.goal, "ecommerce");
        const [attention] = buildPulseAttentionRows({
          campaignRows: [row],
          tables,
          clients: [wavering("a")],
        });
        assertStrictEquals(attention.primaryGoal, "ecommerce");
        // ROAS 350 / 700, not the 100 cost per purchase it showed as leads.
        assertStrictEquals(attention.currentEfficiency, 0.5);
      },
    );

    await t.step(
      "a Google campaign the report keeps in leads is measured on CPL",
      () => {
        const records = campaignDays({
          tableId: "t-google",
          campaignId: "g1",
          name: "חיפוש",
          baseline: { cost: 100, conversions: 2, conversions_value: 0 },
          current: { cost: 100, conversions: 4, conversions_value: 0 },
        });
        const tables = [
          {
            id: "t-google",
            client_id: "b",
            integration_type: "google_ads",
            integration_settings: {},
          },
        ];
        assertStrictEquals(
          reportCampaignGoalOf(records, tables)(records[0])?.goal,
          "leads",
        );

        const row = onlyRow(records, tables, null);
        const [attention] = buildPulseAttentionRows({
          campaignRows: [row],
          tables,
          clients: [wavering("b")],
        });
        assertStrictEquals(attention.primaryGoal, "leads");
        assertStrictEquals(attention.currentEfficiency, 25);
      },
    );
  },
);
