import { assertEquals } from "jsr:@std/assert@1";

import {
  DASHBOARD_CAMPAIGN_ROWS_FILTER,
  isAdsTableType,
  withDashboardCampaignRows,
} from "./dashboard-rows.ts";
import type { RecordsClient } from "./campaign-records.ts";
import { createFakeDb, fakeClient, type Row } from "./tests/fake-postgrest.ts";

/**
 * Each stored `data`, and whether the dashboards sum its row
 * (shouldIncludeInAdsDashboardAggregate: the level, lowercased, is not
 * adset or ad).
 */
const LEVELS: Array<[Row["data"], boolean]> = [
  [{ entity_level: "campaign" }, true],
  [{ entity_level: "Campaign" }, true],
  [{}, true],
  [{ entity_level: null }, true],
  [{ entity_level: "" }, true],
  [{ entity_level: "account" }, true],
  [{ entity_level: " ad" }, true],
  [{ entity_level: "adsets" }, true],
  [null, true],
  [{ entity_level: "adset" }, false],
  [{ entity_level: "AdSet" }, false],
  [{ entity_level: "ad" }, false],
  [{ entity_level: "AD" }, false],
];

/** The ids `filter` keeps of one row per LEVELS entry, read through the fake. */
async function keptIds(filter: string): Promise<Array<string>> {
  const rows = LEVELS.map(([data], index) => ({ id: `r${index}`, data }));
  const db = createFakeDb({ crm_records: rows });
  const client: RecordsClient = fakeClient(db);
  const { data } = await client
    .from("crm_records")
    .select("id, data")
    .or(filter)
    .range(0, 999);
  return (data as Array<Row>).map((row) => String(row.id));
}

const SUMMED_IDS = LEVELS.flatMap(([, summed], index) =>
  summed ? [`r${index}`] : [],
);

Deno.test("the filter keeps exactly the rows the dashboards sum", async () => {
  assertEquals(await keptIds(DASHBOARD_CAMPAIGN_ROWS_FILTER), SUMMED_IDS);
});

Deno.test("a window filter and the rows filter nest in one or value", () => {
  assertEquals(withDashboardCampaignRows(null), DASHBOARD_CAMPAIGN_ROWS_FILTER);
  assertEquals(
    withDashboardCampaignRows("data->>date.gte.2026-09-01,data->>date.is.null"),
    "and(or(data->>date.gte.2026-09-01,data->>date.is.null)," +
      `or(${DASHBOARD_CAMPAIGN_ROWS_FILTER}))`,
  );
});

Deno.test("the nested filter applies both term lists", async () => {
  const dated = withDashboardCampaignRows("data->>entity_level.is.null");
  assertEquals(await keptIds(dated), ["r2", "r3", "r8"]);
});

Deno.test("only ads tables carry levels", () => {
  assertEquals(
    ["facebook_insights", "google_ads", "tiktok", "google_analytics", null].map(
      isAdsTableType,
    ),
    [true, true, true, false, false],
  );
});
