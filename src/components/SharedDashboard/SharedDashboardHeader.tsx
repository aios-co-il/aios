import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import type { AdAccountShortcut } from "@/lib/adAccountUrl";
import { showsPreviousToggle } from "@/components/report-ui/dashboard/previousPlatformTabs";
import { PreviousPeriodToggle } from "@/components/reports/PreviousPeriod/PreviousPeriodToggle";
import { AdAccountButtons } from "@/components/reports/ReportHeader/AdAccountButtons";
import {
  type DashboardDateRange,
  DashboardDateControls,
} from "@/components/reports/ReportHeader/DashboardDateControls";
import { ReportHeader } from "@/components/reports/ReportHeader/ReportHeader";
import { Button } from "@/components/ui/button";
import {
  ResponsiveTabsList,
  type ResponsiveTabItem,
} from "@/components/ui/responsive-tabs-list";
import { Tabs } from "@/components/ui/tabs";
import type { SharedPrevious } from "./useSharedPreviousPeriod";

type SharedDashboardHeaderProps = {
  shareToken: string | undefined;
  dashboard: { name: string; client_name?: string; agency_name?: string };
  /** The "open ad account" buttons, built by public-dashboard. */
  adAccountLinks: Array<AdAccountShortcut> | undefined;
  tabItems: Array<ResponsiveTabItem>;
  tab: string;
  onTabChange: (tab: string) => void;
  dateFilter: string;
  onDateFilterChange: (filter: string) => void;
  customDateRange: DashboardDateRange;
  onCustomDateRangeChange: (range: DashboardDateRange) => void;
  comparePrevious: boolean;
  onComparePreviousChange: (on: boolean) => void;
  previous: Pick<SharedPrevious, "range" | "loading">;
  /** Off-screen capture: no refresh, dates or comparison button. */
  snapshotMode: boolean;
};

/**
 * The shared dashboard's two thin rows, as on the signed-in dashboard: the
 * title with the client and agency, the ad account buttons and a refresh
 * button, then the platform tabs with the same dates, custom range included,
 * and the previous-period button. No sync status: the client does not see
 * sync failures (David).
 */
export function SharedDashboardHeader({
  shareToken,
  dashboard,
  adAccountLinks,
  tabItems,
  tab,
  onTabChange,
  dateFilter,
  onDateFilterChange,
  customDateRange,
  onCustomDateRangeChange,
  comparePrevious,
  onComparePreviousChange,
  previous,
  snapshotMode,
}: SharedDashboardHeaderProps) {
  const meta = [dashboard.client_name, dashboard.agency_name]
    .filter(Boolean)
    .join(" • ");
  return (
    <ReportHeader
      title={dashboard.name}
      meta={meta && <span>{meta}</span>}
      actions={
        !snapshotMode && (
          <>
            <AdAccountButtons links={adAccountLinks} />
            <RefreshButton shareToken={shareToken} />
          </>
        )
      }
      tabs={
        tabItems.length > 1 && (
          <Tabs value={tab} onValueChange={onTabChange}>
            <ResponsiveTabsList
              items={tabItems}
              value={tab}
              onValueChange={onTabChange}
              mobileLabel="בחר פלטפורמה"
              className="w-auto h-9"
            />
          </Tabs>
        )
      }
      controls={
        !snapshotMode && (
          <DashboardDateControls
            dateFilter={dateFilter}
            onDateFilterChange={onDateFilterChange}
            customDateRange={customDateRange}
            onCustomDateRangeChange={onCustomDateRangeChange}
          >
            {showsPreviousToggle(tab) && (
              <PreviousPeriodToggle
                on={comparePrevious}
                onChange={onComparePreviousChange}
                range={previous.range}
                loading={comparePrevious && previous.loading}
              />
            )}
          </DashboardDateControls>
        )
      }
    />
  );
}

/** Reloads every read of the share link, the compared period included. */
function RefreshButton({ shareToken }: { shareToken: string | undefined }) {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      disabled={isRefreshing}
      onClick={async () => {
        setIsRefreshing(true);
        try {
          await queryClient.invalidateQueries({
            queryKey: ["shared-dashboard", shareToken],
          });
        } finally {
          setIsRefreshing(false);
        }
      }}
    >
      <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
      רענן נתונים
    </Button>
  );
}
