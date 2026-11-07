import { assert, assertEquals } from "jsr:@std/assert@1";
import { clientGoalModeOf } from "./campaign-goal/client-goal-mode.ts";
import {
  classifyCampaignPulseStatus,
  detectCampaignGoalMode,
  goalTables,
} from "./campaign-pulse.ts";
import { isLostConnectionFlag } from "./pulse/connection-loss.ts";

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

Deno.test(
  "a sales table whose sync died beside a spending lead table still raises the stale-sync flag",
  () => {
    // The snapshot's steps for one client (campaign-pulse-snapshot/index.ts).
    const googleSales = {
      id: "g",
      integration_type: "google_ads",
      integration_settings: { campaign_type: "ecommerce" },
    };
    const tables = [plainMeta, googleSales];
    const leadRecords = [
      { table_id: "m", data: { date: "2026-11-01", spend: 50, leads: 4 } },
    ];
    const mode = clientGoalModeOf({
      records: leadRecords,
      goalOf: () => "leads",
      tables,
      sinceYmd: "2026-10-07",
    });
    assertEquals(mode, "hybrid");
    const sales = classifyCampaignPulseStatus({
      activeTables: goalTables(tables, "ecommerce", []),
      hasConfiguredCampaignTable: true,
      recentRecordCount: 0,
      isEcommerce: true,
      spend7: 0,
      leads7: 0,
      purchases7: 0,
      roas: null,
      cplChangePct: null,
    });
    // The digest keeps sales flags when the mode is not "leads", and a
    // stale-sync flag is what raises the connection-lost alert.
    assert(sales.flags.some(isLostConnectionFlag));
  },
);
