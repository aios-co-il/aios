import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TrackedEventsChart } from "./TrackedEventsChart";
import { TrackedEventsFunnel } from "./TrackedEventsFunnel";
import type { TrackedEventsSummary } from "./trackedEvents";

type Props = {
  summary: TrackedEventsSummary;
  formatCurrency: (value: number) => string;
  formatNumber: (value: number) => string;
  /** Opens the event picker; the shared dashboard leaves it out. */
  onEdit?: () => void;
};

/**
 * The "אירועים באתר" tab: a card per followed site event with its count and
 * cost per event, the funnel between them, and a daily chart.
 */
export function TrackedEventsTab({
  summary,
  formatCurrency,
  formatNumber,
  onEdit,
}: Props) {
  if (summary.events.length === 0) {
    return (
      <Card className="p-12 text-center space-y-4">
        <p className="text-muted-foreground">
          עדיין לא נבחרו אירועים לדשבורד הזה
        </p>
        {onEdit && <Button onClick={onEdit}>בחירת אירועים</Button>}
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {onEdit && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Settings2 className="h-4 w-4 ml-2" />
            עריכת אירועים
          </Button>
        </div>
      )}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {summary.events.map((item) => (
          <Card key={item.event}>
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <p className="text-3xl font-bold mt-2">
                {formatNumber(item.count)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {item.cost === null
                  ? "עלות לאירוע: -"
                  : `עלות לאירוע: ${formatCurrency(item.cost)}`}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <TrackedEventsFunnel
        events={summary.events}
        formatNumber={formatNumber}
      />
      <TrackedEventsChart events={summary.events} days={summary.days} />
    </div>
  );
}
