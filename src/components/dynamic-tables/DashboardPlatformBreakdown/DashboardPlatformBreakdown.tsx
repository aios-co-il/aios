import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  goalCpl,
  goalRoas,
  type DashboardCombinedSales,
  type DashboardRevenueSource,
} from "@/lib/dashboardCombinedFigures";
import type {
  DashboardGoalRow,
  DashboardGoalSummary,
} from "@/lib/dashboardGoalSummary";
import type { GoogleAdsFormatters } from "../GoogleAdsCampaignSection/types";
import {
  DeliveryCells,
  GoalRowLabel,
  LeadCells,
  SalesCells,
  type PlatformLabelOf,
} from "./BreakdownCells";

type Props = {
  summary: DashboardGoalSummary;
  /** Combined sales of the total row (combinedDashboardSales). */
  sales: DashboardCombinedSales;
  /** Combined leads of the total row (combinedDashboardLeads). */
  leads: { leads: number; cpl: number };
  /** Null when the total row's revenue is what the sales campaigns report. */
  revenueSource: DashboardRevenueSource | null;
  platformLabel: PlatformLabelOf;
  format: GoogleAdsFormatters;
};

const DELIVERY_HEADERS = [
  "פלטפורמה",
  "הוצאה",
  "חשיפות",
  "קליקים",
  "עלות לקליק",
];
const SALES_HEADERS = ["הוספה לעגלה", "רכישות", "הכנסות", "ROAS"];
const LEAD_HEADERS = ["לידים", "עלות לליד"];

const REVENUE_SOURCE_LABELS: Record<DashboardRevenueSource, string> = {
  WooCommerce: "הכנסות WooCommerce",
  Analytics: "הכנסות מ-Analytics",
};

/**
 * The "All" tab's breakdown of the internal and shared dashboards: a row per
 * platform and goal. Sales columns show only when the dashboard has a sales
 * campaign and lead columns only when it has a lead campaign, and each row
 * fills only its own goal's columns, as in the reports' tables.
 */
export function DashboardPlatformBreakdown({
  summary,
  sales,
  leads,
  revenueSource,
  platformLabel,
  format,
}: Props) {
  const showSales = summary.hasEcommerce;
  const showLeads = summary.hasLeads;
  const headers = [
    ...DELIVERY_HEADERS,
    ...(showSales ? SALES_HEADERS : []),
    ...(showLeads ? LEAD_HEADERS : []),
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>פירוט לפי פלטפורמה</CardTitle>
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
              {summary.rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="font-medium">
                    <GoalRowLabel row={row} platformLabel={platformLabel} />
                  </TableCell>
                  <DeliveryCells metrics={row.metrics} format={format} />
                  {showSales && (
                    <SalesCells figures={rowSales(row)} format={format} />
                  )}
                  {showLeads && (
                    <LeadCells figures={rowLeads(row)} format={format} />
                  )}
                </TableRow>
              ))}
              <TableRow className="bg-muted/50 font-bold border-t-2">
                <TableCell>
                  סה"כ
                  {showSales && revenueSource && (
                    <span className="text-xs font-normal text-muted-foreground block">
                      {REVENUE_SOURCE_LABELS[revenueSource]} / הוצאות פרסום ללא
                      קמפייני לידים
                    </span>
                  )}
                </TableCell>
                <DeliveryCells metrics={summary.total} format={format} />
                {showSales && (
                  <SalesCells
                    figures={{
                      ...sales,
                      addToCartTracked: sales.addToCart > 0,
                    }}
                    format={format}
                  />
                )}
                {showLeads && <LeadCells figures={leads} format={format} />}
              </TableRow>
            </TableBody>
          </Table>
        </div>
        {showSales && (
          <p className="text-xs text-muted-foreground mt-3 px-1">
            * נתוני רכישות וערך רכישות של פייסבוק מבוססים על דיווח פייסבוק (כולל
            ייחוס צפייה וחלון 7 ימים), ועשויים להיות גבוהים מהמכירות בפועל בשל
            ספירה כפולה בין קמפיינים. ה-ROAS הכללי בשורת הסה"כ מחושב לפי{" "}
            {revenueSource
              ? `${REVENUE_SOURCE_LABELS[revenueSource]} בפועל חלקי הוצאות הפרסום ללא קמפייני הלידים.`
              : "ההכנסות שמדווחים קמפייני המכירות חלקי ההוצאה עליהם."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** A sales row's figures; null for a row of another goal. */
function rowSales({ goal, metrics }: DashboardGoalRow) {
  return goal === "ecommerce" ? { ...metrics, roas: goalRoas(metrics) } : null;
}

/** A lead row's leads and cost per lead; null for a row of another goal. */
function rowLeads({ goal, metrics }: DashboardGoalRow) {
  return goal === "leads"
    ? { leads: metrics.leads, cpl: goalCpl(metrics) }
    : null;
}
