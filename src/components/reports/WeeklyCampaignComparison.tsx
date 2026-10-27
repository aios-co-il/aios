import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  buildWeeklyCampaignSections,
  formatWeeklyRange,
  type WeeklyAdsRecord,
  type WeeklyAdsSource,
  type WeeklyCampaignSection,
  type WeeklySourceModes,
} from "@/lib/weeklyAdsComparison";
import type { GoogleReportTable } from "@/lib/googleCampaignGoals";
import { useWeeklyGoogleCampaignGoals } from "./useWeeklyGoogleCampaignGoals";
import { WeeklyGoalTable } from "./WeeklyGoalTable";
import { formatReportNumber } from "@/components/dynamic-tables/reportTableFormat";

type Props = {
  records: WeeklyAdsRecord[];
  currency?: string;
  defaultSource?: WeeklyAdsSource;
  sourceModes?: WeeklySourceModes;
  /** The report's tables: Google campaigns then show by their own goal. */
  tables?: GoogleReportTable[];
  isLoading?: boolean;
};

export function WeeklyCampaignComparison({
  records,
  currency = "₪",
  defaultSource,
  sourceModes,
  tables,
  isLoading = false,
}: Props) {
  const googleCampaignGoals = useWeeklyGoogleCampaignGoals(
    records,
    tables,
    defaultSource,
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
                <WeeklyGoalTable
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
                  {formatReportNumber(week.totals.spend)}
                </span>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/** Heading of a week: this week, last week, or how many weeks ago. */
function weekTitle(week: WeeklyCampaignSection) {
  if (week.index === 0) {
    return "השבוע";
  }
  if (week.index === 1) {
    return "שבוע שעבר";
  }
  return `לפני ${week.index} שבועות`;
}
