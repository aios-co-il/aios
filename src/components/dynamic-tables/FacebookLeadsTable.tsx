import { CampaignOffBadge } from "@/components/reports/CampaignOffBadge";
import { Card } from "@/components/ui/card";
import {
  costPerFollower,
  FOLLOWER_COLUMN_LABELS,
  formatFollowerCell,
  showsFollowerColumns,
  sumFacebookFollowers,
} from "@/lib/facebookFollowers";
import { formatReportNumber, resultCellClass } from "@/lib/reportNumber";
import type {
  FacebookReportCampaign,
  FacebookReportEntry,
} from "./facebookReportCampaigns";

type Props = {
  rows: Array<FacebookReportEntry>;
  entityHeader: string;
  currency: string;
};

/**
 * The report's Facebook lead campaigns. A campaign that sends people to an
 * Instagram or Facebook profile can count as leads (AIO-514) and still gain
 * followers, so the follower columns show once one such campaign is in.
 */
export function FacebookLeadsTable({ rows, entityHeader, currency }: Props) {
  const campaigns = rows.map(([, campaign]) => campaign);
  const withFollowers = showsFollowerColumns(campaigns);
  const headers = ["חשיפות", "קליקים", "לידים", "הוצאה", "עלות לליד"];
  if (withFollowers) {
    headers.push(
      FOLLOWER_COLUMN_LABELS.newFollowers,
      FOLLOWER_COLUMN_LABELS.costPerFollower,
    );
  }

  return (
    <Card className="mb-4 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" dir="rtl">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="p-2 text-right font-medium">{entityHeader}</th>
              {headers.map((header) => (
                <th key={header} className="p-2 text-center font-medium">
                  {header}
                </th>
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
                  currency={currency}
                  withFollowers={withFollowers}
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
                currency={currency}
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

/** Metric cells of one campaign or, given every campaign, of the total row. */
function LeadCells({
  campaigns,
  currency,
  withFollowers,
  isTotal,
}: {
  campaigns: Array<FacebookReportCampaign>;
  currency: string;
  withFollowers: boolean;
  isTotal: boolean;
}) {
  function sum(metric: (campaign: FacebookReportCampaign) => number) {
    return campaigns.reduce((total, campaign) => total + metric(campaign), 0);
  }
  const leads = sum((campaign) => campaign.leads);
  const spend = sum((campaign) => campaign.spend);
  return (
    <>
      <td className="p-2 text-center">
        {formatReportNumber(sum((campaign) => campaign.impressions))}
      </td>
      <td className="p-2 text-center">
        {formatReportNumber(sum((campaign) => campaign.clicks))}
      </td>
      <td className={resultCellClass("text-green-600", isTotal)}>
        {formatReportNumber(leads)}
      </td>
      <td className="p-2 text-center">
        {currency}
        {formatReportNumber(spend)}
      </td>
      <td className={resultCellClass("text-blue-600", isTotal)}>
        {currency}
        {formatReportNumber(leads > 0 ? spend / leads : 0, 1)}
      </td>
      {withFollowers && (
        <>
          <td className={resultCellClass("text-green-600", isTotal)}>
            {formatFollowerCell(
              sumFacebookFollowers(campaigns).newFollowers,
              formatReportNumber,
            )}
          </td>
          <td className={resultCellClass("text-blue-600", isTotal)}>
            {formatFollowerCell(
              costPerFollower(campaigns),
              (cost) => `${currency}${formatReportNumber(cost, 2)}`,
            )}
          </td>
        </>
      )}
    </>
  );
}
