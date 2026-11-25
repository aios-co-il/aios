import type { ComponentProps } from "react";
import { format } from "date-fns";
import { GoogleAnalyticsDashboard } from "@/components/dynamic-tables/GoogleAnalyticsDashboard";
import { DashboardTrackedEvents } from "@/components/dynamic-tables/TrackedEvents/DashboardTrackedEvents";
import type { DashboardDateRange } from "@/components/reports/ReportHeader/DashboardDateControls";

type TrackedEventsProps = ComponentProps<typeof DashboardTrackedEvents>;
type AnalyticsProps = ComponentProps<typeof GoogleAnalyticsDashboard>;

type Props = Pick<
  TrackedEventsProps,
  | "records"
  | "settings"
  | "adsSpend"
  | "formatCurrency"
  | "formatNumber"
  | "source"
  | "editableDashboardId"
> & {
  /** Every GA row of the period, whatever its report type. */
  analyticsRecords: AnalyticsProps["records"];
  /** The dashboard's date filter, and its custom range when "custom". */
  dateFilter: string;
  customDateRange: DashboardDateRange;
  /** The GA tables, the first one holding the report mode toggle. */
  analyticsTableIds: Array<string>;
  reportMode: AnalyticsProps["defaultReportMode"];
  /** Set on the internal dashboard, which saves GA view choices per dashboard. */
  dashboardId?: string;
};

/**
 * A dashboard's Analytics tab: its site goals, then the GA report, both at
 * the dashboard's dates, custom range included. The signed-in dashboard and
 * its share link render this one component, so they read the same days.
 */
export function DashboardAnalyticsTab({
  analyticsRecords,
  dateFilter,
  customDateRange,
  analyticsTableIds,
  reportMode,
  dashboardId,
  ...trackedEvents
}: Props) {
  const { from, to } = customDateRange;
  return (
    <div className="space-y-4">
      <DashboardTrackedEvents
        {...trackedEvents}
        dateFilter={dateFilter}
        customFrom={from ? format(from, "yyyy-MM-dd") : ""}
        customTo={to ? format(to, "yyyy-MM-dd") : ""}
      />
      <GoogleAnalyticsDashboard
        records={analyticsRecords}
        externalDateFilter={dateFilter}
        externalCustomDateRange={{ from, to }}
        dashboardId={dashboardId}
        tableId={analyticsTableIds[0]}
        relatedTableIds={analyticsTableIds.slice(1)}
        defaultReportMode={reportMode}
      />
    </div>
  );
}
