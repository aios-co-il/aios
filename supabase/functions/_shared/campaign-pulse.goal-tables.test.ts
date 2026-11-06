import { assertEquals } from "jsr:@std/assert@1";
import { detectCampaignGoalMode, goalTables } from "./campaign-pulse.ts";

const plainMeta = { id: "m", integration_type: "facebook_insights" };
const shop = { id: "s", integration_type: "facebook_ecommerce" };

Deno.test("goalTables", async (t) => {
  await t.step(
    "a plain Meta table holding sales campaigns counts toward the sales status",
    () => {
      // Before AIO-494 the sales status saw no table and read "no_data".
      assertEquals(
        goalTables([plainMeta, shop], "ecommerce", [{ table_id: "m" }]),
        [plainMeta, shop],
      );
    },
  );

  await t.step("a table counts toward the goal its report is set to", () => {
    assertEquals(goalTables([plainMeta, shop], "ecommerce", []), [shop]);
    assertEquals(goalTables([plainMeta, shop], "leads", []), [plainMeta]);
  });
});

Deno.test("detectCampaignGoalMode reads the active tables' own goals", () => {
  assertEquals(detectCampaignGoalMode([plainMeta]), "leads");
  assertEquals(detectCampaignGoalMode([plainMeta, shop]), "hybrid");
  assertEquals(
    detectCampaignGoalMode([{ ...shop, campaign_active: false }]),
    "leads",
  );
});
