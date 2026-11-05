import { assertStrictEquals } from "jsr:@std/assert@1";
import {
  META_LEAD_OBJECTIVES,
  META_SALES_OBJECTIVES,
} from "./meta-ads/campaign-objectives.ts";
import { classifyPulseCampaignGoal } from "./pulse-campaign-goals.mjs";

const facebook = { integration_type: "facebook_insights" };
const goalOf = (objective: string) =>
  classifyPulseCampaignGoal({ campaign_objective: objective }, facebook).goal;

Deno.test("pulse reads the Meta objectives the reports read", async (t) => {
  await t.step("every sales objective is a sales goal", () => {
    for (const objective of META_SALES_OBJECTIVES) {
      assertStrictEquals(goalOf(objective), "ecommerce");
    }
  });

  await t.step("every lead objective is a lead goal", () => {
    for (const objective of META_LEAD_OBJECTIVES) {
      assertStrictEquals(goalOf(objective), "leads");
    }
  });
});
