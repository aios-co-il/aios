import { useMemo } from "react";
import { MousePointerClick, Wallet } from "lucide-react";
import { ReportTrendChart } from "@/components/report-ui/ReportTrendChart";
import type { CampaignOffTable } from "@/lib/campaignOffState";
import type { DashboardFacebookCampaigns } from "@/lib/dashboardCampaignGoals";
import {
  leadsColumns,
  salesColumns,
  trafficColumns,
  type FacebookTabFormatters,
} from "./facebookColumns";
import { FacebookGoalTable } from "./FacebookGoalTable";
import { FacebookKpiStrip } from "./FacebookKpiStrip";
import {
  facebookCampaignRecords,
  facebookCampaignOnOf,
  facebookTabDays,
  facebookTabTotals,
  type FacebookTabRecord,
} from "./facebookTabFigures";

type Props = FacebookTabFormatters & {
  /** The tab's campaigns by goal (dashboardFacebookCampaigns). */
  campaigns: DashboardFacebookCampaigns;
  /** The dashboard's records in the period; the tab reads the Meta ones. */
  records: Array<FacebookTabRecord>;
  /** The dashboard's report tables, whose switch and status mark campaigns off. */
  tables: Array<CampaignOffTable>;
  /** The previous period's campaigns; the tables compare with it while set. */
  previous?: DashboardFacebookCampaigns | null;
};

/**
 * The Facebook tab of the internal and shared dashboards in the report
 * design: headline figures, spend and clicks per day, then a table per goal
 * (sales, leads, traffic) with each campaign's Meta on/off state.
 */
export function FacebookReportTab({
  campaigns,
  records,
  tables,
  previous,
  ...formats
}: Props) {
  const metaRecords = useMemo(
    () => facebookCampaignRecords(records),
    [records],
  );
  const days = useMemo(() => facebookTabDays(metaRecords), [metaRecords]);
  const onOf = useMemo(
    () => facebookCampaignOnOf(metaRecords, tables),
    [metaRecords, tables],
  );
  const byName = useMemo(
    () => new Map((previous?.all ?? []).map((row) => [row.name, row])),
    [previous],
  );
  /** A goal table's previous period, or null while there is none to show. */
  function previousOf(goal: "ecommerce" | "leads" | "traffic") {
    return previous ? { byName, campaigns: previous[goal] } : null;
  }
  const { ecommerce, leads, traffic, all } = campaigns;
  if (all.length === 0) {
    return null;
  }
  return (
    <div className="space-y-4">
      <FacebookKpiStrip
        totals={facebookTabTotals(all)}
        goals={{
          sales: ecommerce.length > 0 ? facebookTabTotals(ecommerce) : null,
          leads: leads.length > 0 ? facebookTabTotals(leads) : null,
        }}
        {...formats}
      />
      {days.length > 1 && (
        <div className="grid gap-4 md:grid-cols-2">
          <ReportTrendChart
            title="הוצאה יומית"
            icon={Wallet}
            data={days}
            xKey="day"
            valueKey="spend"
            valueName="הוצאה"
            format={formats.formatCurrency}
          />
          <ReportTrendChart
            title="קליקים יומיים"
            icon={MousePointerClick}
            data={days}
            xKey="day"
            valueKey="clicks"
            valueName="קליקים"
            format={formats.formatNumber}
          />
        </div>
      )}
      {ecommerce.length > 0 && (
        <FacebookGoalTable
          title="קמפיינים איקומרס - Facebook"
          campaigns={ecommerce}
          columns={salesColumns(ecommerce, formats)}
          onOf={onOf}
          previous={previousOf("ecommerce")}
        />
      )}
      {leads.length > 0 && (
        <FacebookGoalTable
          title="קמפיינים לידים - Facebook"
          campaigns={leads}
          columns={leadsColumns(formats)}
          onOf={onOf}
          previous={previousOf("leads")}
        />
      )}
      {traffic.length > 0 && (
        <FacebookGoalTable
          title="קמפיינים טראפיק - Facebook"
          campaigns={traffic}
          columns={trafficColumns(traffic, formats)}
          onOf={onOf}
          previous={previousOf("traffic")}
          withTotal
        />
      )}
      <p className="px-1 text-xs text-muted-foreground">
        * נתוני רכישות וערך רכישות מבוססים על דיווח פייסבוק (כולל ייחוס צפייה
        וחלון 7 ימים). ה-ROAS הכללי בשורת הסה"כ מחושב לפי הכנסות WooCommerce /
        Analytics בפועל.
      </p>
    </div>
  );
}
