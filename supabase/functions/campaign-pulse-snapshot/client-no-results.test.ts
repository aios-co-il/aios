import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  classifyCampaignPulseStatus,
  computeGoalMetricsFromRecords,
} from "../_shared/campaign-pulse.ts";
import { buildPulseCampaignRows } from "../_shared/pulse-campaign-goals.mjs";
import {
  campaignDays,
  LEAD,
  leadsTable,
  NOW,
} from "../_shared/pulse/test-fixtures.ts";
import {
  clientNoResultsWindow,
  noResultsDaysByClientOf,
} from "./client-no-results.ts";

/** The last full day of NOW (2026-09-18). */
const LAST_FULL_DAY = "2026-09-17";
const NOW_MS = Date.parse("2026-09-18T08:00:00Z");

/** A running lead campaign: 2 leads a day, then 8 full days (09-10..09-17) at ₪100 with 0 leads. */
const records = campaignDays({
  tableId: "t1",
  campaignId: "c1",
  name: "Leads",
  extra: LEAD,
  baseline: { spend: 100, leads: 2 },
  current: { spend: 100, leads: 2 },
}).map((row) =>
  String(row.data.date) >= "2026-09-10"
    ? { ...row, data: { ...row.data, leads: 0 } }
    : row,
);
const table = {
  ...leadsTable("t1", "client-a"),
  integration_settings: { last_sync_at: "2026-09-18T06:00:00Z" },
};

/** The client-level lead status and the campaign row, as the snapshot builds them. */
function snapshotFor(client: {
  id: string;
  pulse_no_results_days?: number | null;
}) {
  const metrics = computeGoalMetricsFromRecords(
    records,
    "leads",
    "2026-09-11",
    "2026-09-04",
  );
  const classification = classifyCampaignPulseStatus({
    activeTables: [table],
    hasConfiguredCampaignTable: true,
    recentRecordCount: records.length,
    isEcommerce: false,
    spend7: metrics.spend,
    leads7: metrics.outcomes,
    purchases7: 0,
    roas: null,
    cplChangePct: metrics.changePct,
    nowMs: NOW_MS,
    noResultsWindow: clientNoResultsWindow(
      client,
      records,
      "leads",
      LAST_FULL_DAY,
    ),
  });
  const [row] = buildPulseCampaignRows({
    records,
    tables: [table],
    nowYmd: NOW,
    noResultsDaysByClient: noResultsDaysByClientOf(client),
  });
  return { classification, row };
}

Deno.test("noResultsDaysByClientOf", async (t) => {
  await t.step("missing or null is the default 7", () => {
    assertEquals(noResultsDaysByClientOf({ id: "a" }), { a: 7 });
    assertEquals(
      noResultsDaysByClientOf({ id: "a", pulse_no_results_days: null }),
      { a: 7 },
    );
  });

  await t.step("the stored days are passed on", () => {
    assertEquals(
      noResultsDaysByClientOf({ id: "a", pulse_no_results_days: 14 }),
      { a: 14 },
    );
  });
});

Deno.test("a client set to 14 with 8 days without leads", async (t) => {
  await t.step(
    "the client status and the campaign row are both yellow, not red",
    () => {
      const { classification, row } = snapshotFor({
        id: "client-a",
        pulse_no_results_days: 14,
      });
      assertStrictEquals(classification.status, "warning");
      assertEquals(classification.flags, [
        "7 ימים בלי לידים; התראה אחרי 14 ימים",
      ]);
      assertStrictEquals(row.status, "warning");
      assertStrictEquals(row.alert_eligible, false);
    },
  );

  await t.step("the default client stays red with today's flag", () => {
    for (const client of [
      { id: "client-a" },
      { id: "client-a", pulse_no_results_days: 7 },
    ]) {
      const { classification, row } = snapshotFor(client);
      assertStrictEquals(classification.status, "critical");
      assertEquals(classification.flags, ["הוצאה ללא לידים"]);
      assertStrictEquals(row.status, "critical");
    }
  });

  await t.step("at 8 days the client waiting 8 days is red too", () => {
    const { classification, row } = snapshotFor({
      id: "client-a",
      pulse_no_results_days: 8,
    });
    assertStrictEquals(classification.status, "critical");
    assertStrictEquals(row.status, "critical");
  });
});
