import {
  Eye,
  MousePointerClick,
  Percent,
  Tag,
  Users,
  Wallet,
} from "lucide-react";
import { ReportKpiCard } from "@/components/report-ui/ReportKpiCard";
import { kpiChange } from "@/components/report-ui/kpiChange";
import { ratio } from "@/lib/reportNumber";
import type { FacebookTabFormatters } from "./facebookColumns";
import { FacebookSalesCards } from "./FacebookSalesCards";
import { costPer, type FacebookTabTotals } from "./facebookTabFigures";

/** The tab's figures: every campaign's, and each goal's that has campaigns. */
export type FacebookKpiFigures = {
  totals: FacebookTabTotals;
  goals: { sales: FacebookTabTotals | null; leads: FacebookTabTotals | null };
};

type Props = FacebookTabFormatters &
  FacebookKpiFigures & {
    /** The previous period's figures; each card shows its change while set. */
    previous?: FacebookKpiFigures | null;
  };

/**
 * The tab's headline figures: spend and delivery over every campaign, then
 * the leads cards when there are lead campaigns and the sales cards when
 * there are sales campaigns, each over that goal's campaigns as in its table.
 */
export function FacebookKpiStrip({
  totals,
  goals,
  previous,
  formatCurrency,
  formatNumber,
  formatUnitCost,
}: Props) {
  const { sales, leads } = goals;
  const before = previous?.totals;
  const leadsBefore = previous?.goals.leads;
  return (
    <div className="grid auto-rows-fr grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      <ReportKpiCard
        icon={Wallet}
        label="הוצאה כוללת"
        value={formatCurrency(totals.spend)}
        delta={kpiChange(totals.spend, before?.spend, "either")}
      />
      <ReportKpiCard
        icon={Eye}
        label="חשיפות"
        value={formatNumber(totals.impressions)}
        delta={kpiChange(totals.impressions, before?.impressions, "up")}
      />
      <ReportKpiCard
        icon={MousePointerClick}
        label="קליקים"
        value={formatNumber(totals.clicks)}
        delta={kpiChange(totals.clicks, before?.clicks, "up")}
      />
      <ReportKpiCard
        icon={Percent}
        label="CTR"
        value={`${(ratio(totals.clicks, totals.impressions) * 100).toFixed(2)}%`}
        delta={kpiChange(
          ratio(totals.clicks, totals.impressions),
          before && ratio(before.clicks, before.impressions),
          "up",
        )}
      />
      <ReportKpiCard
        icon={Tag}
        label="עלות לקליק"
        value={formatUnitCost(ratio(totals.spend, totals.clicks))}
        delta={kpiChange(
          ratio(totals.spend, totals.clicks),
          before && ratio(before.spend, before.clicks),
          "down",
        )}
      />
      {leads && (
        <>
          <ReportKpiCard
            icon={Users}
            label="לידים"
            value={formatNumber(leads.leads)}
            hint="קמפייני לידים"
            delta={kpiChange(leads.leads, leadsBefore?.leads, "up")}
          />
          <ReportKpiCard
            icon={Tag}
            label="עלות לליד"
            value={
              leads.leads > 0 ? formatCurrency(leads.spend / leads.leads) : "-"
            }
            delta={kpiChange(
              costPer(leads.spend, leads.leads),
              leadsBefore && costPer(leadsBefore.spend, leadsBefore.leads),
              "down",
            )}
          />
        </>
      )}
      {sales && (
        <FacebookSalesCards
          sales={sales}
          before={previous?.goals.sales ?? null}
          {...{ formatCurrency, formatNumber }}
        />
      )}
    </div>
  );
}
