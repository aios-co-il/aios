import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { ReportPeriodInput } from "@/components/report-ui/data/buildReportPeriod";
import {
  dashboardReportInput,
  type DashboardReportTable,
} from "@/components/report-ui/dashboard/dashboardReportInput";
import {
  isPlatformTab,
  NO_PREVIOUS_TABS,
  previousPlatformTabsOf,
  type PreviousPlatformTabs,
} from "@/components/report-ui/dashboard/previousPlatformTabs";
import {
  previousPeriodOf,
  type CalendarRange,
} from "@/components/report-ui/dashboard/previousPeriod";
import { getDashboardDateRange } from "@/lib/dashboardDateFilters";
import {
  filterWooOrdersForRevenue,
  sumWooRevenue,
} from "@/lib/wooOrderRevenue";
import { fetchSharedPeriod, type SharedPeriod } from "./fetchSharedPeriod";

/** The shared dashboard's previous period, as its reports compare with it. */
export type SharedPrevious = {
  /** The window compared with; null when the filter has no previous period. */
  range: CalendarRange | null;
  /** The overview's previous period; null while off or loading. */
  report: ReportPeriodInput | null;
  /** The open Facebook or Google tab's previous campaigns. */
  tabs: PreviousPlatformTabs;
  loading: boolean;
};

/**
 * The period of equal length before the share link's range, read from the
 * link's own endpoint and built as DashboardView builds its previous period.
 */
export function useSharedPreviousPeriod({
  shareToken,
  dateFilter,
  tables,
  tab,
  hasWooCommerce,
  enabled,
}: {
  shareToken: string | undefined;
  dateFilter: string;
  tables: ReadonlyArray<DashboardReportTable>;
  tab: string;
  hasWooCommerce: boolean;
  enabled: boolean;
}): SharedPrevious {
  const range = previousPeriodOf(getDashboardDateRange(dateFilter));
  const { data, isPlaceholderData } = useQuery({
    // Under the page's prefix, so its refresh button reloads this too.
    queryKey: [
      "shared-dashboard",
      shareToken,
      "previous",
      range?.startDate,
      range?.endDate,
    ],
    queryFn:
      enabled && shareToken && range
        ? () => fetchSharedPeriod(shareToken, range)
        : skipToken,
    retry: false,
    // As the page's own read. Not reportQueryOptions: its module reads sync
    // fields, which a share page's import graph must not (SharedPages test).
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
  // The last window's rows stay while a new one loads; those belong to
  // another period, so they are never compared.
  const period = enabled && !isPlaceholderData ? data : undefined;
  const report = useMemo(
    () =>
      period
        ? dashboardReportInput({
            records: period.records,
            tables,
            woo: hasWooCommerce ? wooTotals(period) : null,
          })
        : null,
    [period, tables, hasWooCommerce],
  );
  const tabs = useMemo(
    () =>
      period && isPlatformTab(tab)
        ? previousPlatformTabsOf(
            period.records.map((record) => ({
              ...record,
              _source: record._source ?? "",
            })),
            tables,
            tab,
          )
        : NO_PREVIOUS_TABS,
    [period, tables, tab],
  );
  return {
    range,
    report,
    tabs,
    loading: enabled && range !== null && !period,
  };
}

/** The store's sales in the period, counted as the page counts the current ones. */
function wooTotals(period: SharedPeriod): { revenue: number; orders: number } {
  const valid = filterWooOrdersForRevenue(period.woocommerce.orders, null);
  return { revenue: sumWooRevenue(valid), orders: valid.length };
}
