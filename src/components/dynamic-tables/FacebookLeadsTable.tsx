import { Fragment } from "react";
import { CampaignOffBadge } from "@/components/reports/CampaignOffBadge";
import { previousCellsFor } from "@/components/reports/PreviousPeriod/previousCells";
import { PreviousValueHead } from "@/components/reports/PreviousPeriod/PreviousValueCell";
import { Card } from "@/components/ui/card";
import { formatReportNumber, ratio, resultCellClass } from "@/lib/reportNumber";
import {
  type FacebookTablePrevious,
  previousRowsOf,
} from "./facebookPreviousPeriod";
import type {
  FacebookReportCampaign,
  FacebookReportEntry,
} from "./facebookReportCampaigns";

type Props = {
  rows: Array<FacebookReportEntry>;
  entityHeader: string;
  currency: string;
  /** The previous period; its columns show while it is set. */
  previous?: FacebookTablePrevious | null;
};

type Rows = Array<FacebookReportCampaign>;

const HEADERS: Array<{ label: string; compared?: boolean }> = [
  { label: "חשיפות" },
  { label: "קליקים" },
  { label: "לידים", compared: true },
  { label: "הוצאה", compared: true },
  { label: "עלות לליד", compared: true },
];

/**
 * The report's Facebook lead campaigns with leads and cost per lead. With the
 * previous period on, leads, spend and cost per lead each get its value
 * beside them.
 */
export function FacebookLeadsTable({
  rows,
  entityHeader,
  currency,
  previous,
}: Props) {
  const campaigns = rows.map(([, campaign]) => campaign);
  const compare = !!previous;
  return (
    <Card className="mb-4 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" dir="rtl">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="p-2 text-right font-medium">{entityHeader}</th>
              {HEADERS.map(({ label, compared }) => (
                <Fragment key={label}>
                  <th className="p-2 text-center font-medium">{label}</th>
                  {compare && compared && <PreviousValueHead />}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([groupKey, campaign]) => (
              <tr
                key={`lead-${groupKey}`}
                className="border-b hover:bg-muted/30"
              >
                <td className="p-2 text-right font-medium">
                  <CampaignOffBadge off={campaign.off} />
                  {campaign.name}
                </td>
                <LeadCells
                  campaigns={[campaign]}
                  previous={previousRowsOf(previous, groupKey)}
                  currency={currency}
                  isTotal={false}
                />
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-primary/10 font-bold">
            <tr>
              <td className="p-2 text-right">סה״כ</td>
              <LeadCells
                campaigns={campaigns}
                previous={previousRowsOf(previous, null)}
                currency={currency}
                isTotal
              />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

/** Metric cells of one campaign or, given every campaign, of the total row. */
function LeadCells({
  campaigns,
  previous,
  currency,
  isTotal,
}: {
  campaigns: Rows;
  /** Null when the entity did not run then; undefined with comparison off. */
  previous: Rows | null | undefined;
  currency: string;
  isTotal: boolean;
}) {
  const prev = previousCellsFor(campaigns, previous);
  /** An amount in the report's currency. */
  function money(value: number, digits = 0) {
    return `${currency}${formatReportNumber(value, digits)}`;
  }
  return (
    <>
      <td className="p-2 text-center">
        {formatReportNumber(sumOf(campaigns, "impressions"))}
      </td>
      <td className="p-2 text-center">
        {formatReportNumber(sumOf(campaigns, "clicks"))}
      </td>
      <td className={resultCellClass("text-green-600", isTotal)}>
        {formatReportNumber(sumOf(campaigns, "leads"))}
      </td>
      {prev((rows) => sumOf(rows, "leads"), formatReportNumber, "higher")}
      <td className="p-2 text-center">{money(sumOf(campaigns, "spend"))}</td>
      {prev((rows) => sumOf(rows, "spend"), money, "neutral")}
      <td className={resultCellClass("text-blue-600", isTotal)}>
        {money(costPerLead(campaigns), 1)}
      </td>
      {prev(costPerLead, (value) => money(value, 1), "lower")}
    </>
  );
}

/** Spend per lead of the rows. */
function costPerLead(rows: Rows): number {
  return ratio(sumOf(rows, "spend"), sumOf(rows, "leads"));
}

/** One number summed over the rows. */
function sumOf(
  rows: Rows,
  key: "impressions" | "clicks" | "spend" | "leads",
): number {
  return rows.reduce((total, row) => total + row[key], 0);
}
