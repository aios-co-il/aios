import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  purchaseValueUnreported,
  type DashboardCombinedSales,
} from "@/lib/dashboardCombinedFigures";
import { hasSeveralGoals } from "@/lib/dashboardGoalSummary";
import {
  REVENUE_SOURCE_LABELS,
  unvaluedSales,
  type BreakdownProps,
} from "./breakdownFigures";
import { GoalSections } from "./GoalSections";
import { MixedRows } from "./MixedRows";

const DELIVERY_HEADERS = [
  "פלטפורמה",
  "הוצאה",
  "חשיפות",
  "קליקים",
  "עלות לקליק",
];
const SALES_HEADERS = [
  "הוספה לעגלה",
  "רכישות",
  "עלות לרכישה",
  "הכנסות",
  "ROAS",
];

/**
 * The sales columns; without revenue and ROAS when the purchases carry no
 * value, which are then measured by cost per purchase alone.
 */
function salesHeaders(sales: DashboardCombinedSales): Array<string> {
  return purchaseValueUnreported(sales)
    ? SALES_HEADERS.filter((label) => label !== "הכנסות" && label !== "ROAS")
    : SALES_HEADERS;
}
const LEAD_HEADERS = ["לידים", "עלות לליד"];

/**
 * The "All" tab's breakdown of the internal and shared dashboards: a row per
 * platform and goal. Sales columns show only when the dashboard has a sales
 * campaign and lead columns only when it has a lead campaign, and each row
 * fills only its own goal's columns, as in the reports' tables. With several
 * goals the rows sit under their goal with its subtotal (GoalSections).
 */
export function DashboardPlatformBreakdown({
  summary,
  sales,
  leads,
  revenueSource,
  platformLabel,
  format,
  currencies,
}: BreakdownProps) {
  const showSales = summary.hasEcommerce;
  const showLeads = summary.hasLeads;
  const headers = [
    ...DELIVERY_HEADERS,
    ...(showSales ? salesHeaders(sales) : []),
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
              {hasSeveralGoals(summary) ? (
                <GoalSections
                  summary={summary}
                  sales={sales}
                  leads={leads}
                  revenueSource={revenueSource}
                  platformLabel={platformLabel}
                  format={format}
                  currencies={currencies}
                  columnCount={headers.length}
                />
              ) : (
                <MixedRows
                  summary={summary}
                  sales={sales}
                  leads={leads}
                  revenueSource={revenueSource}
                  platformLabel={platformLabel}
                  format={format}
                  currencies={currencies}
                />
              )}
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
            {unvaluedSales(summary) &&
              " קמפיין מכירות שמדווח רכישות בלי ערך רכישה (למשל מוצר במתנה) נמדד בעלות לרכישה ולא ב-ROAS."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
