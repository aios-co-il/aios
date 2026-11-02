import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { groupFacebookRowsByGoal } from "@/lib/facebookGoalGroups";
import { leadCampaigns, mixedCampaigns } from "@/lib/dashboardGoalFixtures";
import {
  dashboardGoalTotals,
  useDashboardGoalTotals,
  type DashboardTotalsRecord,
} from "./useDashboardGoalTotals";

type FixtureRecord = (typeof mixedCampaigns)[number];

const tables = [
  { id: "fb", integration_type: "facebook_insights", integration_settings: {} },
  { id: "g", integration_type: "google_ads", integration_settings: {} },
  { id: "ga", integration_type: "google_analytics", integration_settings: {} },
];

const analyticsRow = (data: Record<string, unknown>): FixtureRecord => ({
  _source: "google_analytics",
  _tableId: "ga",
  data: { date: "2026-10-20", report_type: "daily", sessions: 80, ...data },
});

/** Crm-records always returns the undated traffic-source rollups too. */
const trafficSourceRow: FixtureRecord = {
  _source: "google_analytics",
  _tableId: "ga",
  data: { report_type: "traffic_source", sessions: 300, purchase_value: 800 },
};

/** Records as the internal dashboard tags them (DashboardView). */
const internalShape = (record: FixtureRecord) => ({
  ...record,
  id: `${record._tableId}-${String(record.data.campaign_name ?? "")}`,
  _tableName: "דוח",
  _integrationType: record._source,
  _campaignType: "leads",
});

/** Records as the share link's public-dashboard function tags them. */
const sharedShape = (record: FixtureRecord) => ({
  ...record,
  id: `${record._tableId}-${String(record.data.campaign_name ?? "")}`,
  _tableName: "דוח",
  _integrationSettings: {},
});

function totalsOf(records: DashboardTotalsRecord[]) {
  return dashboardGoalTotals({
    showAll: true,
    facebook: groupFacebookRowsByGoal(
      records.filter((record) => record._source === "facebook_insights"),
      "campaign",
      { leadsOnly: false },
    ),
    records,
    tables,
    woo: { revenue: 0, orders: 0 },
  });
}

/** The totals each page would show for the same records. */
const bothPages = (records: FixtureRecord[]) => [
  totalsOf(records.map(internalShape)),
  totalsOf(records.map(sharedShape)),
];

describe("dashboardGoalTotals", () => {
  it("Analytics without daily rows in the range is no store on either page", () => {
    for (const totals of bothPages([...mixedCampaigns, trafficSourceRow])) {
      expect(totals.store).toBeNull();
      // The sales campaigns' ₪1,400 over their ₪400.
      expect(totals.sales.roas).toBe(3.5);
      expect(totals.mode).toBe("ecommerce");
    }
  });

  it("Analytics daily rows with sessions but no revenue are no store", () => {
    const records = [...mixedCampaigns, analyticsRow({ purchase_value: 0 })];
    for (const totals of bothPages(records)) {
      expect(totals.store).toBeNull();
      expect(totals.sales.roas).toBe(3.5);
    }
  });

  it("add-to-cart alone does not make lead campaigns a sales dashboard", () => {
    const records = [...leadCampaigns, analyticsRow({ add_to_cart: 12 })];
    for (const totals of bothPages(records)) {
      expect(totals.store).toBeNull();
      expect(totals.mode).toBe("leads");
      expect(totals.leads).toStrictEqual({ leads: 20, cpl: 20 });
    }
  });

  it("Analytics revenue is the store on both pages, over non-lead spend", () => {
    const records = [
      ...mixedCampaigns,
      trafficSourceRow,
      analyticsRow({ purchases: 9, purchase_value: 2250 }),
    ];
    for (const totals of bothPages(records)) {
      expect(totals.store).toMatchObject({
        source: "Analytics",
        revenue: 2250,
      });
      expect(totals.sales.roas).toBe(5);
    }
  });
});

describe("useDashboardGoalTotals", () => {
  it("gives the same totals as dashboardGoalTotals", () => {
    const records = mixedCampaigns.map(sharedShape);
    const input = {
      showAll: true,
      facebook: groupFacebookRowsByGoal(
        records.filter((record) => record._source === "facebook_insights"),
        "campaign",
        { leadsOnly: false },
      ),
      records,
      tables,
      woo: { revenue: 0, orders: 0 },
    };
    const { result } = renderHook(() => useDashboardGoalTotals(input));
    expect(result.current).toStrictEqual(dashboardGoalTotals(input));
  });
});
