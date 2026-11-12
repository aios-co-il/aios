import { describe, expect, it } from "vitest";
import {
  ADS_TABLE_TYPES,
  CAMPAIGN_ROWS_ONLY_TYPES,
  DASHBOARD_CAMPAIGN_ROWS_FILTER,
} from "@functions/_shared/ads-sync/dashboard-rows.ts";
import type { RecordsClient } from "@functions/_shared/ads-sync/campaign-records.ts";
import {
  createFakeDb,
  fakeClient,
  type Row,
} from "@functions/_shared/ads-sync/tests/fake-postgrest.ts";
import { googleCampaignNames } from "@/components/dynamic-tables/CampaignContinents/continentSections";
import { summarizeGoogleAdsCampaigns } from "@/components/dynamic-tables/GoogleAdsCampaignSection/summarizeGoogleAdsCampaigns";
import { buildReportPeriod } from "@/components/report-ui/data/buildReportPeriod";
import { dashboardReportInput } from "@/components/report-ui/dashboard/dashboardReportInput";
import { previousPlatformTabsOf } from "@/components/report-ui/dashboard/previousPlatformTabs";
import { shouldIncludeInAdsDashboardAggregate } from "@/lib/adsEntityLevel";
import {
  dashboardFacebookCampaigns,
  dashboardRecordGoalOf,
  dashboardRecordLeads,
} from "@/lib/dashboardCampaignGoals";
import { googleCampaignGoalsForRecords } from "@/lib/googleCampaignGoals";
import { buildWeeklyCampaignSections } from "@/lib/weeklyAdsComparison";
import { attachTableSettings } from "./attachTableSettings";
import {
  fullAnswer,
  TABLES,
  type FixtureAnswer,
  type FixtureRecord,
} from "./attachTableSettings.test-fixture";

const META_AND_GOOGLE = new Set([
  "facebook_insights",
  "facebook_ecommerce",
  "google_ads",
]);

/**
 * The answer as a page holds it once the rows of `trimmedTypes` are read
 * through the functions' own filter (evaluated by the PostgREST fake) and the
 * settings are sent once per table, then filled back.
 */
async function trimmedAnswer(
  trimmedTypes: ReadonlyArray<string>,
): Promise<FixtureAnswer> {
  const full = fullAnswer();
  const records: Array<FixtureRecord> = [];
  for (const table of TABLES) {
    const rows = full.records.filter((record) => record._tableId === table.id);
    const kept = trimmedTypes.includes(table.integration_type)
      ? await readSummedRows(rows)
      : rows;
    for (const record of kept) {
      const sent = { ...record };
      delete sent._integrationSettings;
      records.push(sent);
    }
  }
  return attachTableSettings({ tables: full.tables, records });
}

/** The rows DASHBOARD_CAMPAIGN_ROWS_FILTER keeps, in their stored order. */
async function readSummedRows(
  rows: Array<FixtureRecord>,
): Promise<Array<FixtureRecord>> {
  const db = createFakeDb({ crm_records: rows });
  const client: RecordsClient = fakeClient(db);
  const { data } = await client
    .from("crm_records")
    .select("id, data")
    .or(DASHBOARD_CAMPAIGN_ROWS_FILTER)
    .range(0, 999);
  const ids = new Set((data as Array<Row>).map((row) => row.id));
  return rows.filter((row) => ids.has(row.id));
}

/**
 * Every figure the dashboards build from records, each by the function the
 * pages call: the overview report, the Facebook and Google tabs, their
 * previous-period tables, the weekly comparison, the continents tab's
 * campaign names and the daily chart's leads.
 */
function dashboardFigures({ records, tables }: FixtureAnswer) {
  // The pages' filteredRecords on the "all" tab.
  const filtered = records.filter(
    (record) =>
      !META_AND_GOOGLE.has(record._source) ||
      shouldIncludeInAdsDashboardAggregate(record.data, record._source),
  );
  const google = records.filter((record) => record._source === "google_ads");
  const goalOf = dashboardRecordGoalOf(records, tables);
  return {
    report: buildReportPeriod(
      dashboardReportInput({ records, tables, woo: null }),
    ),
    facebook: dashboardFacebookCampaigns(filtered, goalOf),
    google: summarizeGoogleAdsCampaigns(google, tables),
    previousFacebook: previousPlatformTabsOf(records, tables, "facebook"),
    previousGoogle: previousPlatformTabsOf(records, tables, "google_ads"),
    weekly: buildWeeklyCampaignSections(records, {
      now: new Date("2026-09-12T12:00:00Z"),
      googleCampaignGoals: googleCampaignGoalsForRecords(google, tables),
    }),
    continentNames: googleCampaignNames(records),
    leads: filtered.map((record) => dashboardRecordLeads(record, goalOf)),
  };
}

/** The previous period's figures: the overview report and the tabs' tables. */
function previousFigures({ records, tables }: FixtureAnswer) {
  return {
    report: buildReportPeriod(
      dashboardReportInput({ records, tables, woo: null }),
    ),
    facebook: previousPlatformTabsOf(records, tables, "facebook"),
    google: previousPlatformTabsOf(records, tables, "google_ads"),
  };
}

describe("attachTableSettings", () => {
  it("fills each record with its table's settings, as the answer sent before", () => {
    const full = fullAnswer();
    const sent = full.records.map((record) => {
      const copy = { ...record };
      delete copy._integrationSettings;
      return copy;
    });
    expect(attachTableSettings({ ...full, records: sent })).toEqual(full);
  });

  it("keeps settings an older answer sent on the record", () => {
    const own = { ...fullAnswer().records[0], _integrationSettings: { a: 1 } };
    const [record] = attachTableSettings({
      tables: TABLES,
      records: [own],
    }).records;
    expect(record._integrationSettings).toEqual({ a: 1 });
  });
});

describe("share links read Meta campaign rows only", () => {
  it("sends fewer rows, and the same records the page counts", async () => {
    const full = fullAnswer();
    const trimmed = await trimmedAnswer(CAMPAIGN_ROWS_ONLY_TYPES);
    const counted = full.records.filter(
      (record) =>
        !CAMPAIGN_ROWS_ONLY_TYPES.includes(record._source) ||
        shouldIncludeInAdsDashboardAggregate(record.data, record._source),
    );
    expect(trimmed.records.length).toBeLessThan(full.records.length);
    expect(trimmed.records).toEqual(counted);
  });

  it("leaves every dashboard figure as it was", async () => {
    const before = dashboardFigures(fullAnswer());
    const after = dashboardFigures(
      await trimmedAnswer(CAMPAIGN_ROWS_ONLY_TYPES),
    );
    expect(before.report.scopes.all).toBeDefined();
    expect(before.facebook.all.length).toBeGreaterThan(0);
    expect(before.weekly.length).toBeGreaterThan(0);
    expect(after).toEqual(before);
  });
});

describe("the previous period reads campaign rows of every ads table", () => {
  it("leaves the report and the platform tabs' comparison as they were", async () => {
    const trimmed = await trimmedAnswer(ADS_TABLE_TYPES);
    expect(trimmed.records.length).toBeLessThan(
      (await trimmedAnswer(CAMPAIGN_ROWS_ONLY_TYPES)).records.length,
    );
    expect(previousFigures(trimmed)).toEqual(previousFigures(fullAnswer()));
  });
});
