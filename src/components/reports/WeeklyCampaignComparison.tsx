import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  buildWeeklyCampaignSections,
  formatWeeklyRange,
  type WeeklyAdsRecord,
  type WeeklyAdsSource,
  type WeeklyCampaignKind,
  type WeeklyCampaignSection,
  type WeeklyGoalGroup,
  type WeeklyGoalTotals,
} from "@/lib/weeklyAdsComparison";
import { googleCampaignGoalsForRecords } from "@/lib/googleAdsReport";

type Props = {
  records: WeeklyAdsRecord[];
  currency?: string;
  defaultSource?: WeeklyAdsSource;
  sourceModes?: Partial<Record<WeeklyAdsSource, "leads" | "ecommerce">>;
  /** The report's tables: Google campaigns then show by their own goal. */
  tables?: Array<{
    id: string;
    integration_type?: string | null;
    integration_settings?: Record<string, unknown> | null;
    category?: string | null;
  }>;
  isLoading?: boolean;
};

const sourceLabel: Record<WeeklyAdsSource, string> = {
  facebook_insights: "Facebook",
  facebook_ecommerce: "Facebook",
  google_ads: "Google Ads",
};

const goalTitle: Record<WeeklyCampaignKind, string> = {
  ecommerce: "קמפייני מכירות",
  leads: "קמפייני לידים",
  traffic: "קמפייני תנועה",
};

const goalTotalLabel: Record<WeeklyCampaignKind, string> = {
  ecommerce: "סה״כ מכירות",
  leads: "סה״כ לידים",
  traffic: "סה״כ תנועה",
};

const number = (value: number, digits = 0) =>
  value.toLocaleString("he-IL", { maximumFractionDigits: digits });

type Column = {
  label: string;
  value: (metrics: WeeklyGoalTotals, currency: string) => string;
  className?: string;
};

const impressions: Column = {
  label: "חשיפות",
  value: (m) => number(m.impressions),
};
const clicks: Column = { label: "קליקים", value: (m) => number(m.clicks) };
const spend: Column = {
  label: "הוצאה",
  value: (m, currency) => `${currency}${number(m.spend)}`,
};
const results = (label: string): Column => ({
  label,
  value: (m) => number(m.results, 1),
  className: "font-medium text-green-600",
});
const costPerResult = (label: string, digits = 1): Column => ({
  label,
  value: (m, currency) =>
    m.results > 0 ? `${currency}${number(m.costPerResult, digits)}` : "—",
  className: "font-medium text-blue-600",
});

/** Each goal shows only its own metrics: no revenue or ROAS outside sales. */
const goalColumns: Record<WeeklyCampaignKind, Column[]> = {
  ecommerce: [
    impressions,
    clicks,
    results("רכישות"),
    spend,
    costPerResult("עלות לרכישה"),
    {
      label: "הכנסה",
      value: (m, currency) =>
        m.revenue > 0 ? `${currency}${number(m.revenue)}` : "—",
    },
    {
      label: "ROAS",
      value: (m) => (m.roas > 0 ? `${number(m.roas, 2)}x` : "—"),
    },
  ],
  leads: [
    impressions,
    clicks,
    results("לידים"),
    spend,
    costPerResult("עלות לליד"),
  ],
  // A traffic campaign's result is the click itself.
  traffic: [
    impressions,
    { ...clicks, className: "font-medium text-green-600" },
    spend,
    costPerResult("עלות לקליק", 2),
  ],
};

function weekTitle(week: WeeklyCampaignSection) {
  if (week.index === 0) return "השבוע";
  if (week.index === 1) return "שבוע שעבר";
  return `לפני ${week.index} שבועות`;
}

function GoalTable({
  group,
  currency,
  showPlatform,
  showTitle,
}: {
  group: WeeklyGoalGroup;
  currency: string;
  showPlatform: boolean;
  showTitle: boolean;
}) {
  const columns = goalColumns[group.kind];
  return (
    <section aria-label={goalTitle[group.kind]}>
      {showTitle && (
        <h4 className="border-b bg-muted/10 px-4 py-2 text-sm font-semibold">
          {goalTitle[group.kind]}
        </h4>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b bg-muted/20">
            <tr>
              {showPlatform && (
                <th className="p-2 text-right font-medium">פלטפורמה</th>
              )}
              <th className="p-2 text-right font-medium">קמפיין</th>
              {columns.map((column) => (
                <th key={column.label} className="p-2 text-center font-medium">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {group.rows.map((row) => (
              <tr
                key={row.key}
                className="border-b last:border-0 hover:bg-muted/20"
              >
                {showPlatform && (
                  <td className="p-2 text-right">{sourceLabel[row.source]}</td>
                )}
                <td className="p-2 text-right font-medium">{row.campaign}</td>
                {columns.map((column) => (
                  <td
                    key={column.label}
                    className={`p-2 text-center ${column.className ?? ""}`}
                  >
                    {column.value(row, currency)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-primary/10 font-bold">
            <tr>
              {showPlatform && <td />}
              <td className="p-2 text-right">
                {showTitle ? goalTotalLabel[group.kind] : "סה״כ שבועי"}
              </td>
              {columns.map((column) => (
                <td
                  key={column.label}
                  className={`p-2 text-center ${column.className ?? ""}`}
                >
                  {column.value(group.totals, currency)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

export function WeeklyCampaignComparison({
  records,
  currency = "₪",
  defaultSource,
  sourceModes,
  tables,
  isLoading = false,
}: Props) {
  const googleCampaignGoals = useMemo(
    () =>
      tables
        ? googleCampaignGoalsForRecords(
            records.filter(
              (record) => (record._source ?? defaultSource) === "google_ads",
            ),
            tables,
          )
        : undefined,
    [records, tables, defaultSource],
  );
  const weeks = buildWeeklyCampaignSections(records, {
    defaultSource,
    sourceModes,
    googleCampaignGoals,
    maxWeeks: 53,
  });
  const sources = new Set(
    weeks.flatMap((week) => week.rows.map((row) => row.source)),
  );
  const showPlatform = sources.size > 1;

  if (isLoading) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        טוען השוואה שבועית…
      </Card>
    );
  }

  if (weeks.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground" dir="rtl">
        אין עדיין נתונים שבועיים להשוואה.
      </Card>
    );
  }

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h2 className="text-lg font-semibold">השוואה שבועית לפי קמפיין</h2>
        <p className="text-sm text-muted-foreground">
          כל שבוע מוצג מראשון עד שבת, מהשבוע האחרון ועד שנה אחורה לפי הנתונים
          הזמינים. כל קמפיין מוצג לפי היעד שלו: מכירות, לידים או תנועה.
        </p>
      </div>

      {weeks.map((week) => {
        const multipleGoals = week.groups.length > 1;
        return (
          <Card key={week.key} className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-3">
              <div>
                <h3 className="font-semibold">{weekTitle(week)}</h3>
                <p className="text-xs text-muted-foreground">
                  {formatWeeklyRange(week.startDate, week.endDate)}
                </p>
              </div>
              {week.isCurrentWeek && (
                <Badge variant="secondary">שבוע נוכחי · נתונים חלקיים</Badge>
              )}
            </div>

            <div className={multipleGoals ? "divide-y" : undefined}>
              {week.groups.map((group) => (
                <GoalTable
                  key={group.kind}
                  group={group}
                  currency={currency}
                  showPlatform={showPlatform}
                  showTitle={multipleGoals}
                />
              ))}
            </div>

            {multipleGoals && (
              <div className="flex items-center justify-between border-t bg-muted/40 px-4 py-2 text-sm font-semibold">
                <span>הוצאה כוללת בשבוע (כל היעדים)</span>
                <span>
                  {currency}
                  {number(week.totals.spend)}
                </span>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
