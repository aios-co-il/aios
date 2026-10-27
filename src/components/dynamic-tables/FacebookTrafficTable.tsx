import { Card } from "@/components/ui/card";
import {
  costPerFollower,
  FOLLOWER_COLUMN_LABELS,
  showsFollowerColumns,
  sumFacebookFollowers,
} from "@/lib/facebookFollowers";
import type {
  FacebookReportCampaign,
  FacebookReportEntry,
} from "./facebookReportCampaigns";

type Props = {
  rows: FacebookReportEntry[];
  entityHeader: string;
  currency: string;
};

/**
 * The report's Facebook traffic campaigns. A click is their result, so the
 * table shows CTR and cost per click, plus new followers and cost per follower
 * once a campaign sends people to a Page or profile.
 */
export function FacebookTrafficTable({ rows, entityHeader, currency }: Props) {
  const campaigns = rows.map(([, campaign]) => campaign);
  const withFollowers = showsFollowerColumns(campaigns);
  const headers = ["חשיפות", "קליקים", "הוצאה", "CTR", "עלות לקליק"];
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
                key={`traffic-${groupKey}`}
                className="border-b hover:bg-muted/30"
              >
                <td className="p-2 text-right font-medium">{campaign.name}</td>
                <TrafficCells
                  campaigns={[campaign]}
                  currency={currency}
                  withFollowers={withFollowers}
                  emphasis=" font-medium"
                />
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-primary/10 font-bold">
            <tr>
              <td className="p-2 text-right">סה״כ</td>
              <TrafficCells
                campaigns={campaigns}
                currency={currency}
                withFollowers={withFollowers}
                emphasis=""
              />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

/** Metric cells of one campaign or, given every campaign, of the total row. */
function TrafficCells({
  campaigns,
  currency,
  withFollowers,
  emphasis,
}: {
  campaigns: FacebookReportCampaign[];
  currency: string;
  withFollowers: boolean;
  emphasis: string;
}) {
  const sum = (metric: (campaign: FacebookReportCampaign) => number) =>
    campaigns.reduce((total, campaign) => total + metric(campaign), 0);
  const impressions = sum((campaign) => campaign.impressions);
  const clicks = sum((campaign) => campaign.clicks);
  const spend = sum((campaign) => campaign.spend);
  const followerCost = costPerFollower(campaigns);
  return (
    <>
      <td className="p-2 text-center">{fmt(impressions)}</td>
      <td className={`p-2 text-center text-green-600${emphasis}`}>
        {fmt(clicks)}
      </td>
      <td className="p-2 text-center">
        {currency}
        {fmt(spend)}
      </td>
      <td className="p-2 text-center">
        {fmt(ratio(clicks, impressions) * 100, 2)}%
      </td>
      <td className={`p-2 text-center text-blue-600${emphasis}`}>
        {currency}
        {fmt(ratio(spend, clicks), 2)}
      </td>
      {withFollowers && (
        <>
          <td className={`p-2 text-center text-green-600${emphasis}`}>
            {fmt(sumFacebookFollowers(campaigns).newFollowers)}
          </td>
          <td className={`p-2 text-center text-blue-600${emphasis}`}>
            {followerCost === null ? "—" : `${currency}${fmt(followerCost, 2)}`}
          </td>
        </>
      )}
    </>
  );
}

/** A table number in Hebrew locale, rounded to `digits`. */
const fmt = (value: number, digits = 0) =>
  value.toLocaleString("he-IL", { maximumFractionDigits: digits });

/** a ÷ b, or 0 when there is nothing to divide by. */
const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);
