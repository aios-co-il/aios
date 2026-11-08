import { assertStrictEquals } from "jsr:@std/assert@1";
import { buildPulseCampaignRows } from "./pulse-campaign-goals.mjs";
import { evaluatePulseInstantAlerts } from "./pulse-instant-alerts.ts";
import {
  campaignDays,
  INSTANT_RULES,
  LEAD,
  leadsTable,
  NOW,
} from "./pulse/test-fixtures.ts";

/**
 * A running lead campaign: leads every day until 4 days ago, then 3 full days
 * (09-15..09-17) that spent ₪100 a day with 0 leads.
 */
const records = campaignDays({
  tableId: "t1",
  campaignId: "c1",
  name: "Leads",
  extra: LEAD,
  baseline: { spend: 100, leads: 2 },
  current: { spend: 100, leads: 2 },
}).map((row) =>
  String(row.data.date) >= "2026-09-15"
    ? { ...row, data: { ...row.data, leads: 0 } }
    : row,
);
const tables = [leadsTable("t1", "client-a")];

/** The campaign's pulse row with the client's stored days. */
function rowWith(days?: number | null) {
  const rows = buildPulseCampaignRows({
    records,
    tables,
    nowYmd: NOW,
    noResultsDaysByClient: days === undefined ? {} : { "client-a": days },
  });
  assertStrictEquals(rows.length, 1);
  return rows[0];
}

Deno.test("the client's days without results before an alert", async (t) => {
  await t.step("3 days: 3 full days with spend and 0 leads alert", () => {
    const row = rowWith(3);
    assertStrictEquals(row.no_results_days, 3);
    assertStrictEquals(row.alert_eligible, true);
    assertStrictEquals(
      row.status_reason,
      "קיימת הוצאה ללא תוצאות ב־3 הימים המלאים האחרונים",
    );
  });

  await t.step("default 7: the same campaign has leads in 7 days", () => {
    for (const days of [undefined, null, 7]) {
      const row = rowWith(days);
      assertStrictEquals(row.no_results_days, 7, String(days));
      assertStrictEquals(row.outcomes_7d, 8, String(days));
      assertStrictEquals(
        row.status_reason.includes("ללא תוצאות"),
        false,
        String(days),
      );
    }
  });

  await t.step("4 days: the 4th day back had leads, so no alert", () => {
    const row = rowWith(4);
    assertStrictEquals(row.status_reason.includes("ללא תוצאות"), false);
  });

  await t.step("an out-of-range value is clamped, never ignored", () => {
    assertStrictEquals(rowWith(0).no_results_days, 1);
    assertStrictEquals(rowWith(99).no_results_days, 30);
  });

  await t.step(
    "the alert's fingerprint and campaign_key match the default window's",
    () => {
      const short = rowWith(3);
      const alerts = evaluatePulseInstantAlerts(
        [{ client_id: "client-a", campaign_breakdown: [short] }],
        [],
        INSTANT_RULES,
      );
      assertStrictEquals(alerts.length, 1);
      assertStrictEquals(alerts[0].campaign_key, rowWith().campaign_key);
      assertStrictEquals(
        alerts[0].fingerprint,
        `${short.campaign_key}:קיימת הוצאה ללא תוצאות ב־7 הימים המלאים האחרונים:no_target:none`,
      );
    },
  );
});

Deno.test("a longer window holds 7 days without results", () => {
  const allZero = campaignDays({
    tableId: "t1",
    campaignId: "c1",
    name: "Leads",
    extra: LEAD,
    baseline: { spend: 100, leads: 2 },
    current: { spend: 100, leads: 0 },
  });
  const [atDefault] = buildPulseCampaignRows({
    records: allZero,
    tables,
    nowYmd: NOW,
  });
  assertStrictEquals(atDefault.alert_eligible, true);
  const [at14] = buildPulseCampaignRows({
    records: allZero,
    tables,
    nowYmd: NOW,
    noResultsDaysByClient: { "client-a": 14 },
  });
  // Leads on 09-04..09-10 fall inside the 14 days: not an exception yet.
  assertStrictEquals(at14.alert_eligible, false);
  assertStrictEquals(at14.status_tier, "watch");
});
