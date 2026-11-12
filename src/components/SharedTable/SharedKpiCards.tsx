import type { ReactNode } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatShortNumber } from "./sharedFormat";
import type { SharedTableSummary } from "./sharedTableSummary";

type Props = {
  summary: SharedTableSummary;
  isAds: boolean;
  isAnalytics: boolean;
  isGoogleAds: boolean;
  /** No sales campaigns: the cards show leads, clicks and cost per lead. */
  leadsOnly: boolean;
  formatCurrency: (amount: number) => string;
};

/** The share link's headline figures above the report's tables. */
export function SharedKpiCards({
  summary,
  isAds,
  isAnalytics,
  isGoogleAds,
  leadsOnly,
  formatCurrency,
}: Props) {
  const leadsLabel = isGoogleAds ? "המרות" : "לידים";
  const showSales = !leadsOnly && (summary.hasEcommerce || isAnalytics);
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {isAds && (
        <KpiCard tone="blue" label="הוצאה כוללת">
          {formatCurrency(summary.spend)}
        </KpiCard>
      )}
      {isAnalytics && (
        <KpiCard tone="orange" label="סשנים">
          {formatShortNumber(summary.sessions)}
        </KpiCard>
      )}
      {showSales ? (
        <>
          <KpiCard tone="green" label="הכנסות">
            {formatCurrency(summary.revenue)}
          </KpiCard>
          <KpiCard tone="purple" label="רכישות">
            {formatShortNumber(summary.purchases)}
          </KpiCard>
          {isAds && (
            <KpiCard tone={summary.roas >= 1 ? "emerald" : "red"} label="ROAS">
              <span className="flex items-center gap-2">
                {summary.roas.toFixed(2)}
                <RoasTrend roas={summary.roas} />
              </span>
            </KpiCard>
          )}
          {summary.hasLeads && (
            <>
              <KpiCard tone="cyan" label={leadsLabel}>
                {formatShortNumber(summary.leads)}
              </KpiCard>
              <KpiCard
                tone="teal"
                label={isGoogleAds ? "עלות להמרה" : "עלות לליד (CPL)"}
              >
                {formatCurrency(summary.cpl)}
              </KpiCard>
            </>
          )}
        </>
      ) : (
        <>
          <KpiCard tone="green" label={leadsLabel}>
            {formatShortNumber(summary.leads)}
          </KpiCard>
          <KpiCard tone="purple" label="קליקים">
            {formatShortNumber(summary.clicks)}
          </KpiCard>
          <KpiCard tone="emerald" label="עלות לליד (CPL)">
            {formatCurrency(summary.cpl)}
          </KpiCard>
        </>
      )}
    </div>
  );
}

const TONES = {
  blue: "from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900",
  orange:
    "from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900",
  green: "from-green-50 to-green-100 dark:from-green-950 dark:to-green-900",
  purple:
    "from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900",
  emerald:
    "from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900",
  red: "from-red-50 to-red-100 dark:from-red-950 dark:to-red-900",
  cyan: "from-cyan-50 to-cyan-100 dark:from-cyan-950 dark:to-cyan-900",
  teal: "from-teal-50 to-teal-100 dark:from-teal-950 dark:to-teal-900",
};

/** One headline figure on its coloured card. */
function KpiCard({
  tone,
  label,
  children,
}: {
  tone: keyof typeof TONES;
  label: string;
  children: ReactNode;
}) {
  return (
    <Card className={`bg-gradient-to-br ${TONES[tone]}`}>
      <CardContent className="p-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="text-3xl font-bold mt-2">{children}</div>
      </CardContent>
    </Card>
  );
}

/** Up when ads returned more than they cost, down when less. */
function RoasTrend({ roas }: { roas: number }) {
  if (roas > 1) {
    return <TrendingUp className="h-6 w-6 text-green-600" />;
  }
  if (roas < 1) {
    return <TrendingDown className="h-6 w-6 text-red-600" />;
  }
  return <Minus className="h-6 w-6 text-muted-foreground" />;
}
