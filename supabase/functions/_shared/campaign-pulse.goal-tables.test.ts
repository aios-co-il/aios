import { assert, assertEquals } from "jsr:@std/assert@1";
import { clientGoalModeOf } from "./campaign-goal/client-goal-mode.ts";
import {
  classifyCampaignPulseStatus,
  detectCampaignGoalMode,
  goalRecentRecordCount,
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

Deno.test(
  "a client whose Google table spends only on exposure campaigns raises no stale-sync flag (AIO-496)",
  () => {
    // The snapshot's steps for one client: a Google lead table running only
    // a Display campaign on manual CPM, which is traffic.
    const google = {
      id: "g",
      integration_type: "google_ads",
      integration_settings: { campaign_type: "leads" },
      last_sync_at: "2026-11-01T12:00:00Z",
    };
    const records = [{ table_id: "g", data: { date: "2026-11-01", cost: 12 } }];
    const goalOf = () => "traffic" as const;
    const mode = clientGoalModeOf({
      records,
      goalOf,
      tables: [google],
      sinceYmd: "2026-10-07",
    });
    assertEquals(mode, "leads");
    const leadTables = goalTables([google], "leads", []);
    const leads = classifyCampaignPulseStatus({
      activeTables: leadTables,
      hasConfiguredCampaignTable: true,
      recentRecordCount: goalRecentRecordCount({
        records,
        goal: "leads",
        tables: leadTables,
        goalOf,
        sinceYmd: "2026-10-07",
      }),
      isEcommerce: false,
      spend7: 0,
      leads7: 0,
      purchases7: 0,
      roas: null,
      cplChangePct: null,
      nowMs: Date.parse("2026-11-02T06:00:00Z"),
    });
    // Before: no lead rows read as "no data in 30 days", a lost connection.
    assertEquals(leads.flags.filter(isLostConnectionFlag), []);
  },
);

Deno.test("goalRecentRecordCount", async (t) => {
  const records = [
    { table_id: "m", data: { date: "2026-11-01" }, goal: "leads" },
    { table_id: "m", data: { date: "2026-11-01" }, goal: "traffic" },
    { table_id: "m", data: { date: "2026-11-01" }, goal: "ecommerce" },
    { table_id: "m", data: { date: "2026-09-01" }, goal: "leads" },
    { table_id: "x", data: { date: "2026-11-01" }, goal: "leads" },
  ];
  const count = (goal: "leads" | "ecommerce") =>
    goalRecentRecordCount({
      records,
      goal,
      tables: [plainMeta],
      goalOf: (record) => record.goal,
      sinceYmd: "2026-10-07",
    });

  await t.step(
    "counts the goal's own rows and its tables' exposure rows in the window",
    () => {
      assertEquals(count("leads"), 2);
    },
  );

  await t.step("never counts the other goal's rows", () => {
    assertEquals(count("ecommerce"), 2);
  });
});
