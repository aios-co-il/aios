import { assertEquals } from "jsr:@std/assert@1";
import {
  DASHBOARD_CAMPAIGN_ROWS_FILTER,
  withDashboardCampaignRows,
} from "../_shared/ads-sync/dashboard-rows.ts";
import { jsonDateFilter, recordsFilter } from "./records-filter.ts";

const SEPTEMBER = { startDate: "2026-09-01", endDate: "2026-09-30" };
const SEPTEMBER_FILTER =
  "and(data->>date.gte.2026-09-01,data->>date.lte.2026-09-30),data->>date.is.null";

Deno.test("a window keeps its dated rows and undated rows, as before", () => {
  assertEquals(jsonDateFilter(SEPTEMBER), SEPTEMBER_FILTER);
  assertEquals(
    jsonDateFilter({ startDate: "2026-09-01" }),
    "data->>date.gte.2026-09-01,data->>date.is.null",
  );
  assertEquals(jsonDateFilter({ startDate: null, endDate: null }), null);
});

Deno.test("without a level every row of the window is read", () => {
  assertEquals(
    recordsFilter(SEPTEMBER, { level: null, integrationType: "google_ads" }),
    SEPTEMBER_FILTER,
  );
});

Deno.test("level=campaign on an ads table reads the summed rows", () => {
  assertEquals(
    recordsFilter(SEPTEMBER, {
      level: "campaign",
      integrationType: "facebook_insights",
    }),
    withDashboardCampaignRows(SEPTEMBER_FILTER),
  );
  assertEquals(
    recordsFilter(
      { startDate: null, endDate: null },
      { level: "campaign", integrationType: "google_ads" },
    ),
    DASHBOARD_CAMPAIGN_ROWS_FILTER,
  );
});

Deno.test("level=campaign leaves other tables and levels whole", () => {
  assertEquals(
    recordsFilter(SEPTEMBER, {
      level: "campaign",
      integrationType: "google_analytics",
    }),
    SEPTEMBER_FILTER,
  );
  assertEquals(
    recordsFilter(SEPTEMBER, { level: "ad", integrationType: "google_ads" }),
    SEPTEMBER_FILTER,
  );
});
