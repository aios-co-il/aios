import { Fragment } from "react";
import { CampaignOffBadge } from "@/components/reports/CampaignOffBadge";
import { PreviousValueHead } from "@/components/reports/PreviousPeriod/PreviousValueCell";
import { Card } from "@/components/ui/card";
import {
  FOLLOWER_COLUMN_LABELS,
  showsFollowerColumns,
} from "@/lib/facebookFollowers";
import { TrafficCells } from "./FacebookTrafficCells";
import {
  type FacebookTablePrevious,
  previousRowsOf,
} from "./facebookPreviousPeriod";
import type { FacebookReportEntry } from "./facebookReportCampaigns";

type Props = {
  rows: Array<FacebookReportEntry>;
  entityHeader: string;
  currency: string;
  /** The previous period; its columns show while it is set. */
  previous?: FacebookTablePrevious | null;
};

/**
 * The report's Facebook traffic campaigns. A click is their result, so the
 * table shows CTR and cost per click, plus leads once a campaign measured any,
 * and new followers and cost per follower once a campaign sends people to a
 * Page or profile. With the previous period on, clicks, spend, cost per click,
 * leads and new followers each get its value beside them.
 */
export function FacebookTrafficTable({
  rows,
  entityHeader,
  currency,
  previous,
}: Props) {
  const campaigns = rows.map(([, campaign]) => campaign);
  const withLeads = campaigns.some((campaign) => campaign.leads > 0);
  const withFollowers = showsFollowerColumns(campaigns);
  const compare = !!previous;
  const headers: Array<{ label: string; compared?: boolean }> = [
    { label: "חשיפות" },
    { label: "קליקים", compared: true },
    { label: "הוצאה", compared: true },
    { label: "CTR" },
    { label: "עלות לקליק", compared: true },
  ];
  if (withLeads) {
    headers.push({ label: "לידים", compared: true });
  }
  if (withFollowers) {
    headers.push(
      { label: FOLLOWER_COLUMN_LABELS.newFollowers, compared: true },
      { label: FOLLOWER_COLUMN_LABELS.costPerFollower },
    );
  }

  return (
    <Card className="mb-4 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" dir="rtl">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="p-2 text-right font-medium">{entityHeader}</th>
              {headers.map(({ label, compared }) => (
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
                key={`traffic-${groupKey}`}
                className="border-b hover:bg-muted/30"
              >
                <td className="p-2 text-right font-medium">
                  <CampaignOffBadge off={campaign.off} />
                  {campaign.name}
                </td>
                <TrafficCells
                  campaigns={[campaign]}
                  previous={previousRowsOf(previous, groupKey)}
                  currency={currency}
                  withLeads={withLeads}
                  withFollowers={withFollowers}
                  isTotal={false}
                />
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-primary/10 font-bold">
            <tr>
              <td className="p-2 text-right">סה״כ</td>
              <TrafficCells
                campaigns={campaigns}
                previous={previousRowsOf(previous, null)}
                currency={currency}
                withLeads={withLeads}
                withFollowers={withFollowers}
                isTotal
              />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
