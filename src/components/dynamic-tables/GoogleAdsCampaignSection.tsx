import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  GoogleAdsCampaignSummary,
  GoogleAdsCampaignSummaryRow,
  GoogleAdsTotals,
} from "@/lib/googleAdsReport";

export type GoogleWooOverlay = {
  purchases: number;
  revenue: number;
  organicOrders: number;
  organicRevenue: number;
};

type Props = {
  summary: GoogleAdsCampaignSummary;
  icon: ReactNode;
  formatCurrency: (value: number) => string;
  formatNumber: (value: number) => string;
  formatUnitCost: (value: number) => string;
  /** WooCommerce attribution replaces the ecommerce purchases/revenue totals. */
  woo?: GoogleWooOverlay | null;
};

const CARD = "h-full bg-gradient-to-br";
const CARD_BODY =
  "p-6 flex flex-col items-center justify-center h-full text-center";

function KpiCard({
  tone,
  label,
  value,
  note,
}: {
  tone: string;
  label: string;
  value: string;
  note?: string | null;
}) {
  return (
    <Card className={`${CARD} ${tone}`}>
      <CardContent className={CARD_BODY}>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-3xl font-bold mt-2">{value}</p>
        {note && <p className="text-xs text-muted-foreground mt-1">{note}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Google Ads tab of a client dashboard. Each campaign is shown by its own goal:
 * ecommerce campaigns with purchases, revenue and ROAS, lead campaigns with
 * conversions and cost per conversion. Mixed accounts get one table per goal.
 */
export function GoogleAdsCampaignSection({
  summary,
  icon,
  formatCurrency,
  formatNumber,
  formatUnitCost,
  woo,
}: Props) {
  const { totals, ecommerce, leads, hasEcommerce, hasLeads } = summary;
  const mixed = hasEcommerce && hasLeads;
  const storePurchases = woo ? woo.purchases : ecommerce.conversions;
  const storeRevenue = woo ? woo.revenue : ecommerce.conversions_value;
  const storeRoas = ecommerce.spend > 0 ? storeRevenue / ecommerce.spend : 0;
  const wooDiffers =
    !!woo &&
    (storePurchases !== ecommerce.conversions ||
      Math.abs(storeRevenue - ecommerce.conversions_value) > 1);
  const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

  const renderTable = (
    rows: GoogleAdsCampaignSummaryRow[],
    goal: "ecommerce" | "leads",
    groupTotals: GoogleAdsTotals,
  ) => {
    const isEcommerce = goal === "ecommerce";
    const title = !mixed
      ? "סיכום קמפיינים - Google Ads"
      : isEcommerce
        ? "קמפייני מכירות - Google Ads"
        : "קמפייני לידים - Google Ads";
    const totalCtr = ratio(groupTotals.clicks, groupTotals.impressions) * 100;
    const totalCpc = ratio(groupTotals.spend, groupTotals.clicks);
    const totalCpa = ratio(groupTotals.spend, groupTotals.conversions);
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {icon}
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">קמפיין</TableHead>
                  <TableHead className="text-right">חשיפות</TableHead>
                  <TableHead className="text-right">קליקים</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">CPC</TableHead>
                  <TableHead className="text-right">הוצאה</TableHead>
                  {isEcommerce ? (
                    <>
                      <TableHead className="text-right">רכישות</TableHead>
                      <TableHead className="text-right">הכנסות</TableHead>
                      <TableHead className="text-right">ROAS</TableHead>
                      <TableHead className="text-right">AOV</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead className="text-right">המרות</TableHead>
                      <TableHead className="text-right">עלות להמרה</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c, i) => {
                  const cpc = ratio(c.spend, c.clicks);
                  const cpa = ratio(c.spend, c.conversions);
                  const roas = ratio(c.conversions_value, c.spend);
                  const aov = ratio(c.conversions_value, c.conversions);
                  const good = (value: number) =>
                    value > 0 ? "text-green-600 font-medium" : "";
                  return (
                    <TableRow key={`${c.campaign_id || c.name}-${i}`}>
                      <TableCell className="font-medium max-w-[300px]">
                        {c.name}
                      </TableCell>
                      <TableCell>{formatNumber(c.impressions)}</TableCell>
                      <TableCell>{formatNumber(c.clicks)}</TableCell>
                      <TableCell>
                        {(ratio(c.clicks, c.impressions) * 100).toFixed(2)}%
                      </TableCell>
                      <TableCell>
                        {cpc > 0 ? formatUnitCost(cpc) : "-"}
                      </TableCell>
                      <TableCell>{formatCurrency(c.spend)}</TableCell>
                      {isEcommerce ? (
                        <>
                          <TableCell className={good(c.conversions)}>
                            {formatNumber(c.conversions)}
                          </TableCell>
                          <TableCell className={good(c.conversions_value)}>
                            {formatCurrency(c.conversions_value)}
                          </TableCell>
                          <TableCell>
                            {roas > 0 ? roas.toFixed(2) : "-"}
                          </TableCell>
                          <TableCell>
                            {aov > 0 ? formatCurrency(aov) : "-"}
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className={good(c.conversions)}>
                            {formatNumber(c.conversions)}
                          </TableCell>
                          <TableCell>
                            {cpa > 0 ? formatCurrency(cpa) : "-"}
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  );
                })}
                <TableRow className="bg-muted/50 font-bold border-t-2">
                  <TableCell>סה"כ</TableCell>
                  <TableCell>{formatNumber(groupTotals.impressions)}</TableCell>
                  <TableCell>{formatNumber(groupTotals.clicks)}</TableCell>
                  <TableCell>{totalCtr.toFixed(2)}%</TableCell>
                  <TableCell>
                    {totalCpc > 0 ? formatUnitCost(totalCpc) : "-"}
                  </TableCell>
                  <TableCell>{formatCurrency(groupTotals.spend)}</TableCell>
                  {isEcommerce ? (
                    <>
                      <TableCell className="text-green-600">
                        {formatNumber(storePurchases)}
                      </TableCell>
                      <TableCell className="text-green-600">
                        {formatCurrency(storeRevenue)}
                      </TableCell>
                      <TableCell>
                        {groupTotals.spend > 0 ? storeRoas.toFixed(2) : "-"}
                      </TableCell>
                      <TableCell>
                        {storePurchases > 0
                          ? formatCurrency(storeRevenue / storePurchases)
                          : "-"}
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="text-green-600">
                        {formatNumber(groupTotals.conversions)}
                      </TableCell>
                      <TableCell>
                        {totalCpa > 0 ? formatCurrency(totalCpa) : "-"}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    );
  };

  const ecommerceRows = summary.campaigns.filter((c) => c.goal === "ecommerce");
  const leadRows = summary.campaigns.filter((c) => c.goal === "leads");

  return (
    <>
      {woo && wooDiffers && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          רכישות והכנסות בכרטיסים למטה מבוססים על ייחוס WooCommerce (Google
          ממומן). דיווח Google Ads: {formatNumber(ecommerce.conversions)} המרות,{" "}
          {formatCurrency(ecommerce.conversions_value)} ערך המרה.
          {woo.organicOrders > 0 && (
            <>
              {" "}
              בנוסף: {formatNumber(woo.organicOrders)} רכישות Google אורגני (
              {formatCurrency(woo.organicRevenue)}).
            </>
          )}
        </div>
      )}
      <div
        className={`grid gap-3 grid-cols-2 md:grid-cols-3 ${mixed ? "lg:grid-cols-4" : "lg:grid-cols-5"} auto-rows-fr`}
      >
        <KpiCard
          tone="from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900"
          label="הוצאה כוללת"
          value={formatCurrency(totals.spend)}
        />
        <KpiCard
          tone="from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900"
          label="חשיפות"
          value={formatNumber(totals.impressions)}
        />
        <KpiCard
          tone="from-cyan-50 to-cyan-100 dark:from-cyan-950 dark:to-cyan-900"
          label="קליקים"
          value={formatNumber(totals.clicks)}
        />
        {hasEcommerce && (
          <>
            <KpiCard
              tone="from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900"
              label={woo ? "רכישות (WooCommerce)" : "רכישות"}
              value={formatNumber(storePurchases)}
              note={
                wooDiffers
                  ? `Google Ads: ${formatNumber(ecommerce.conversions)}`
                  : mixed
                    ? "קמפייני מכירות"
                    : null
              }
            />
            <KpiCard
              tone="from-green-50 to-green-100 dark:from-green-950 dark:to-green-900"
              label={woo ? "הכנסות (WooCommerce)" : "הכנסות"}
              value={formatCurrency(storeRevenue)}
              note={
                wooDiffers
                  ? `Google Ads: ${formatCurrency(ecommerce.conversions_value)}`
                  : null
              }
            />
            <KpiCard
              tone="from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900"
              label={woo ? "ROAS (WooCommerce)" : "ROAS"}
              value={ecommerce.spend > 0 ? storeRoas.toFixed(2) : "-"}
            />
          </>
        )}
        {hasLeads && (
          <>
            <KpiCard
              tone="from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900"
              label="המרות"
              value={formatNumber(leads.conversions)}
              note={mixed ? "קמפייני לידים" : null}
            />
            <KpiCard
              tone="from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900"
              label="עלות להמרה"
              value={
                leads.conversions > 0
                  ? formatCurrency(leads.spend / leads.conversions)
                  : "-"
              }
            />
          </>
        )}
      </div>

      {ecommerceRows.length > 0 &&
        renderTable(ecommerceRows, "ecommerce", ecommerce)}
      {leadRows.length > 0 && renderTable(leadRows, "leads", leads)}

      {summary.campaigns.length === 0 && (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">
            אין נתוני Google Ads בטווח התאריכים הנבחר
          </p>
        </Card>
      )}
      {woo && (
        <p className="text-xs text-muted-foreground px-1">
          * שורת הסה"כ וכרטיסי הרכישות/הכנסות/ROAS מבוססים על ייחוס WooCommerce
          (Google ממומן). עמודות לפי קמפיין מציגות את דיווח Google Ads API.
        </p>
      )}
    </>
  );
}
