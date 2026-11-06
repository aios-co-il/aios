import { Facebook } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FacebookCampaignRow } from "@/lib/adsMetrics";
import {
  costPerPurchase,
  purchaseValueUnreported,
} from "@/lib/dashboardCombinedFigures";

type Props = {
  campaigns: FacebookCampaignRow[];
  formatCurrency: (value: number) => string;
  formatNumber: (value: number) => string;
};

/**
 * The Facebook tab's sales campaigns on the internal and shared dashboards.
 * When none of them reports a purchase value (a free course, say), purchases
 * are measured like leads: by cost per purchase, with no purchase-value or
 * ROAS column. Otherwise a campaign whose purchases carry no value shows a
 * dash for ROAS, and one that sold nothing keeps its 0x.
 */
export function FacebookSalesCampaignsCard({
  campaigns,
  formatCurrency,
  formatNumber,
}: Props) {
  const valued = campaigns.some((campaign) => campaign.purchase_value > 0);
  const headers = [
    "קמפיין",
    "חשיפות",
    "קליקים",
    "הוצאה",
    "הוספות לעגלה",
    "רכישות",
    ...(valued ? ["ערך רכישות", "ROAS"] : ["עלות לרכישה"]),
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Facebook className="h-5 w-5 text-blue-600" />
          קמפיינים איקומרס - Facebook
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {headers.map((label) => (
                  <TableHead key={label} className="text-right">
                    {label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign) => (
                <TableRow key={`ecom-${campaign.name}`}>
                  <TableCell className="font-medium max-w-[300px]">
                    {campaign.name}
                  </TableCell>
                  <TableCell>{formatNumber(campaign.impressions)}</TableCell>
                  <TableCell>{formatNumber(campaign.clicks)}</TableCell>
                  <TableCell>{formatCurrency(campaign.spend)}</TableCell>
                  <TableCell
                    className={
                      campaign.add_to_cart > 0
                        ? "text-orange-600 font-medium"
                        : ""
                    }
                  >
                    {formatNumber(campaign.add_to_cart)}
                  </TableCell>
                  <TableCell
                    className={
                      campaign.purchases > 0 ? "text-green-600 font-medium" : ""
                    }
                  >
                    {formatNumber(campaign.purchases)}
                  </TableCell>
                  {valued ? (
                    <ValueCells campaign={campaign} format={formatCurrency} />
                  ) : (
                    <TableCell>
                      {purchaseCost(campaign, formatCurrency)}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/** Purchase value and ROAS; a dash for ROAS when the purchases carry no value. */
function ValueCells({
  campaign,
  format,
}: {
  campaign: FacebookCampaignRow;
  format: (value: number) => string;
}) {
  const revenue = campaign.purchase_value;
  const roas = campaign.spend > 0 ? revenue / campaign.spend : 0;
  const unvalued = purchaseValueUnreported({
    purchases: campaign.purchases,
    revenue,
  });
  return (
    <>
      <TableCell className={revenue > 0 ? "text-green-600 font-medium" : ""}>
        {format(revenue)}
      </TableCell>
      <TableCell>
        {unvalued ? (
          "-"
        ) : (
          <span
            className={
              roas >= 1
                ? "text-green-600 font-semibold"
                : roas > 0
                  ? "text-red-600"
                  : ""
            }
          >
            {roas > 0 ? `${roas.toFixed(2)}x` : "0x"}
          </span>
        )}
      </TableCell>
    </>
  );
}

/** Spend over purchases, or a dash without purchases or spend. */
function purchaseCost(
  campaign: FacebookCampaignRow,
  format: (value: number) => string,
): string {
  const cost = costPerPurchase(campaign);
  return cost === null ? "-" : format(cost);
}
