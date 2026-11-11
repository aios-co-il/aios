import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getDashboardDateRange } from "@/lib/dashboardDateFilters";
import { reportQueryOptions } from "@/lib/reportQueryOptions";
import { reportRecordsQuery } from "@/lib/reportRecords";
import {
  fetchWooDashboardSummary,
  getWooDashboardDateRangeIso,
  wooDashboardQueryKeys,
} from "@/lib/wooDashboardQueries";
import type { ReportPeriodInput } from "../data/buildReportPeriod";
import {
  dashboardRecordTables,
  dashboardReportInput,
  type DashboardReportRecord,
  type DashboardReportTable,
} from "./dashboardReportInput";
import { previousPeriodOf, type CalendarRange } from "./previousPeriod";

interface UsePreviousReportPeriodOptions {
  tables: ReadonlyArray<DashboardReportTable>;
  dateFilter: string;
  customFrom: string;
  customTo: string;
  clientId: string | null | undefined;
  hasWooCommerce: boolean;
  /** False until the current period can load, e.g. a half-picked custom range. */
  enabled: boolean;
}

/**
 * The period of equal length before the dashboard's range, loaded the way the
 * current one is (crm-records per table, WooCommerce summary), so the report
 * can show each figure's change. Null while it loads or when the filter has
 * no previous period.
 */
export function usePreviousReportPeriod({
  tables,
  dateFilter,
  customFrom,
  customTo,
  clientId,
  hasWooCommerce,
  enabled,
}: UsePreviousReportPeriodOptions): ReportPeriodInput | null {
  const previous = enabled
    ? previousPeriodOf(
        getDashboardDateRange(dateFilter, new Date(), customFrom, customTo),
      )
    : null;
  const recordTables = dashboardRecordTables(tables);
  const records = usePreviousRecords(recordTables, previous);
  const woo = usePreviousWoo(hasWooCommerce ? clientId : null, previous);
  const wooReady = !hasWooCommerce || woo !== undefined;
  // Memoized so the report builds the previous period once per load.
  return useMemo(
    () =>
      records && wooReady
        ? dashboardReportInput({
            records,
            tables,
            woo: woo ? { revenue: woo.revenue, orders: woo.orders } : null,
          })
        : null,
    [records, tables, woo, wooReady],
  );
}

/**
 * The dashboard's record rows in the period before its range, for the
 * platform tabs' comparison columns. Undefined while they load or when the
 * filter has no previous period.
 */
export function usePreviousDashboardRecords({
  tables,
  dateFilter,
  customFrom,
  customTo,
  enabled,
}: Omit<UsePreviousReportPeriodOptions, "clientId" | "hasWooCommerce">):
  Array<DashboardReportRecord> | undefined {
  const previous = enabled
    ? previousPeriodOf(
        getDashboardDateRange(dateFilter, new Date(), customFrom, customTo),
      )
    : null;
  return usePreviousRecords(dashboardRecordTables(tables), previous);
}

/** Each record table's rows in the previous period. */
function usePreviousRecords(
  tables: Array<DashboardReportTable>,
  previous: CalendarRange | null,
): Array<DashboardReportRecord> | undefined {
  const queryClient = useQueryClient();
  const { data, isPlaceholderData } = useQuery({
    queryKey: [
      "crm-records-dashboard",
      tables.map((table) => table.id).join(","),
      "previous",
      previous?.startDate,
      previous?.endDate,
    ],
    queryFn:
      previous && tables.length > 0
        ? () =>
            fetchPeriodRecords(tables, previous, (query) =>
              queryClient.fetchQuery(query),
            )
        : skipToken,
    ...reportQueryOptions<Array<DashboardReportRecord>>(),
  });
  // The shared options keep the last range's rows while a new one loads;
  // those belong to another period, so they are never compared.
  return isPlaceholderData ? undefined : data;
}

/** Loads every table's rows in the range through the shared per-table cache. */
async function fetchPeriodRecords(
  tables: Array<DashboardReportTable>,
  range: CalendarRange,
  fetchQuery: (
    query: ReturnType<typeof reportRecordsQuery>,
  ) => Promise<Array<{ data: Record<string, unknown> }>>,
): Promise<Array<DashboardReportRecord>> {
  const perTable = await Promise.all(
    tables.map(async (table) => {
      const rows = await fetchQuery(
        reportRecordsQuery(
          supabase,
          table.id,
          "custom",
          range.startDate,
          range.endDate,
        ),
      );
      return rows.map((row) => ({ _tableId: table.id, data: row.data }));
    }),
  );
  return perTable.flat();
}

/** The store's sales in the previous period; undefined while loading. */
function usePreviousWoo(
  clientId: string | null | undefined,
  previous: CalendarRange | null,
): { revenue: number; orders: number } | undefined {
  const { data } = useQuery({
    queryKey: [
      ...wooDashboardQueryKeys.wooSummaryPrefix,
      clientId,
      "previous",
      previous?.startDate,
      previous?.endDate,
    ],
    queryFn:
      clientId && previous
        ? () =>
            fetchWooDashboardSummary(
              clientId,
              getWooDashboardDateRangeIso("custom", {
                customFrom: previous.startDate,
                customTo: previous.endDate,
              }),
            )
        : skipToken,
  });
  return data;
}
