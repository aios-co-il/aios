import { useMemo } from "react";
import type { DashboardReportTable } from "./dashboardReportInput";
import {
  isPlatformTab,
  NO_PREVIOUS_TABS,
  previousPlatformTabsOf,
  type PreviousPlatformTabs,
} from "./previousPlatformTabs";
import { usePreviousDashboardRecords } from "./usePreviousReportPeriod";

/**
 * The open platform tab's campaigns in the period before the dashboard's
 * range, built as the tab builds the current ones. Null while they load,
 * while the comparison is off, or on another tab.
 */
export function usePreviousPlatformTabs({
  tables,
  dateFilter,
  customFrom,
  customTo,
  tab,
  enabled,
}: {
  tables: ReadonlyArray<DashboardReportTable>;
  dateFilter: string;
  customFrom: string;
  customTo: string;
  tab: string;
  enabled: boolean;
}): PreviousPlatformTabs {
  const platform = isPlatformTab(tab) ? tab : null;
  const records = usePreviousDashboardRecords({
    tables,
    dateFilter,
    customFrom,
    customTo,
    enabled: enabled && platform !== null,
  });
  return useMemo(() => {
    if (!records || !platform) {
      return NO_PREVIOUS_TABS;
    }
    // The previous rows carry only their table id; tag each with its
    // platform, as the dashboard tags the current ones.
    const typeOf = new Map(
      tables.map((table) => [table.id, table.integration_type ?? ""]),
    );
    const tagged = records.map((record) => ({
      ...record,
      _source: typeOf.get(record._tableId ?? "") ?? "",
    }));
    return previousPlatformTabsOf(tagged, tables, platform);
  }, [records, platform, tables]);
}
