import { useMemo } from "react";
import { summarizeGoogleAdsCampaigns } from "@/components/dynamic-tables/GoogleAdsCampaignSection/summarizeGoogleAdsCampaigns";
import type { FacebookCampaignRow } from "@/lib/adsMetrics";
import type { ReportCampaignGoal } from "@/lib/campaignGoals";
import {
  combinedDashboardLeads,
  combinedDashboardSales,
  dashboardCampaignMode,
  dashboardStore,
  type DashboardCombinedSales,
  type DashboardStore,
} from "@/lib/dashboardCombinedFigures";
import {
  summarizeDashboardGoals,
  type DashboardGoalSummary,
} from "@/lib/dashboardGoalSummary";
import type {
  GoogleAdsRowData,
  GoogleReportTable,
} from "@/lib/googleCampaignGoals";

/** A record of the dashboard's tab, tagged with its table by either page. */
export type DashboardTotalsRecord = {
  _source?: string;
  _tableId?: string;
  _integrationSettings?: Record<string, unknown> | null;
  data?: (GoogleAdsRowData & Record<string, unknown>) | null;
};

export type DashboardGoalTotalsInput = {
  /** Whether the "All" tab shows; Google Ads campaigns count only there. */
  showAll: boolean;
  /** The campaign tables the Facebook tab shows. */
  facebook: Record<ReportCampaignGoal, FacebookCampaignRow[]>;
  /** The tab's records, ads at campaign level only. */
  records: DashboardTotalsRecord[];
  tables: GoogleReportTable[];
  woo: { revenue: number; orders: number };
};

export type DashboardGoalTotals = {
  goals: DashboardGoalSummary;
  store: DashboardStore | null;
  mode: "ecommerce" | "leads";
  sales: DashboardCombinedSales;
  leads: { leads: number; cpl: number };
};

/**
 * The "All" tab's goals, store, KPI mode and combined figures, the same on the
 * internal dashboard and its share link.
 */
export function useDashboardGoalTotals({
  showAll,
  facebook,
  records,
  tables,
  woo: { revenue, orders },
}: DashboardGoalTotalsInput): DashboardGoalTotals {
  return useMemo(
    () =>
      dashboardGoalTotals({
        showAll,
        facebook,
        records,
        tables,
        woo: { revenue, orders },
      }),
    [showAll, facebook, records, tables, revenue, orders],
  );
}

/**
 * Each campaign counts toward its own goal, as on the platform tabs, and the
 * store is decided by dashboardStore from the same records on both pages.
 */
export function dashboardGoalTotals(
  input: DashboardGoalTotalsInput,
): DashboardGoalTotals {
  const googleRecords = input.showAll
    ? input.records.filter((record) => record._source === "google_ads")
    : [];
  const goals = summarizeDashboardGoals({
    facebook: input.facebook,
    google: summarizeGoogleAdsCampaigns(googleRecords, input.tables).campaigns,
  });
  const store = dashboardStore(input.records, input.woo);
  return {
    goals,
    store,
    mode: dashboardCampaignMode(goals, store, input.tables),
    sales: combinedDashboardSales(goals, store),
    leads: combinedDashboardLeads(goals),
  };
}
