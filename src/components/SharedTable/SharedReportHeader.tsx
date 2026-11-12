import { BarChart3, Globe } from "lucide-react";
import type { AdsReportView } from "@/components/dynamic-tables/CampaignContinents/useContinentsReportView";
import { PreviousPeriodToggle } from "@/components/reports/PreviousPeriod/PreviousPeriodToggle";
import { ReportHeader } from "@/components/reports/ReportHeader/ReportHeader";
import { ResponsiveTabsList } from "@/components/ui/responsive-tabs-list";
import { Tabs } from "@/components/ui/tabs";
import { getIntegrationIcon } from "@/lib/integrationIcons";
import type { SharedTableInfo } from "./publicTableApi";
import { SharedDateFilter } from "./SharedDateFilter";
import type { SharedDateSelection } from "./useSharedTableData";
import type { useSharedPreviousPeriod } from "./useSharedPreviousPeriod";

type Props = {
  table: SharedTableInfo;
  /** The window picker; null in the send capture, which shows no controls. */
  dates: {
    value: SharedDateSelection;
    onChange: (dates: SharedDateSelection) => void;
  } | null;
  /** The ads report's views; null for other tables. */
  views: {
    value: AdsReportView;
    onChange: (view: AdsReportView) => void;
    hasContinents: boolean;
  } | null;
  /** The previous-period toggle; null where the view has no comparison. */
  comparison: {
    on: boolean;
    onChange: (on: boolean) => void;
    period: ReturnType<typeof useSharedPreviousPeriod>;
  } | null;
};

/**
 * The share link's header, in the internal report's two rows: the title with
 * its agency, then the views with the dates and the comparison. A share shows
 * no internal actions and no sync status.
 */
export function SharedReportHeader({ table, dates, views, comparison }: Props) {
  return (
    <ReportHeader
      title={table.name}
      badges={getIntegrationIcon(table.integration_type, "h-5 w-5 shrink-0")}
      meta={table.agency_name ? <span>{table.agency_name}</span> : undefined}
      tabs={views && <ViewTabs views={views} />}
      controls={
        (dates || comparison) && (
          <>
            {dates && (
              <SharedDateFilter value={dates.value} onChange={dates.onChange} />
            )}
            {comparison && (
              <PreviousPeriodToggle
                on={comparison.on}
                onChange={comparison.onChange}
                range={comparison.period.range}
                loading={comparison.period.isPending}
              />
            )}
          </>
        )
      }
    />
  );
}

/** The ads report's views: the report, the weekly comparison and continents. */
function ViewTabs({ views }: { views: NonNullable<Props["views"]> }) {
  /** Switches to the picked view. */
  function select(value: string) {
    if (value === "summary" || value === "weekly" || value === "continents") {
      views.onChange(value);
    }
  }
  return (
    <Tabs value={views.value} onValueChange={select}>
      <ResponsiveTabsList
        items={[
          { value: "summary", label: "הדוח" },
          { value: "weekly", label: "השוואה שבועית", icon: BarChart3 },
          ...(views.hasContinents
            ? [{ value: "continents", label: "לפי יבשות", icon: Globe }]
            : []),
        ]}
        value={views.value}
        onValueChange={select}
        mobileLabel="בחר תצוגה"
      />
    </Tabs>
  );
}
