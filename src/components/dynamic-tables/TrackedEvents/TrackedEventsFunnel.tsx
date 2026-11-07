import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TrackedEventFigures } from "./trackedEvents";

type Props = {
  events: Array<TrackedEventFigures>;
  formatNumber: (value: number) => string;
};

/**
 * The followed events as funnel steps, in the order the dashboard lists them:
 * each bar is the step's share of the first step, and the rate beside it is
 * the step over the one before.
 */
export function TrackedEventsFunnel({ events, formatNumber }: Props) {
  const top = events[0]?.count ?? 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>משפך</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {events.map((item) => {
          const width = top > 0 ? Math.max((item.count / top) * 100, 1) : 0;
          return (
            <div key={item.event} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{item.label}</span>
                <span className="text-muted-foreground">
                  {formatNumber(item.count)}
                  {item.stepRate !== null &&
                    ` · ${(item.stepRate * 100).toFixed(1)}% מהשלב הקודם`}
                </span>
              </div>
              <div className="h-3 rounded bg-muted overflow-hidden">
                <div
                  className="h-full rounded bg-primary"
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
