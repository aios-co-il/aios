import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EventSourcesTable } from "./eventSources";
import type { TrackedEvent } from "./trackedEvents";

type Props = {
  table: NonNullable<EventSourcesTable>;
  events: Array<TrackedEvent>;
  formatNumber: (value: number) => string;
};

/**
 * Where each followed event came from: a row per source / medium, a column
 * per event, each cell the count and its share of the event's total.
 */
export function TrackedEventSources({ table, events, formatNumber }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>מקורות הגעה לכל אירוע</CardTitle>
      </CardHeader>
      <CardContent>
        {table.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            אין מקורות לאירועים שנבחרו בתקופה הזאת
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">מקור / מדיום</TableHead>
                  {events.map((item) => (
                    <TableHead key={item.event} className="text-right">
                      {item.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.rows.map((row) => (
                  <TableRow key={row.source}>
                    <TableCell className="font-medium" dir="ltr">
                      {row.source}
                    </TableCell>
                    {events.map((item) => {
                      const count = row.counts[item.event] ?? 0;
                      const total = table.totals[item.event] ?? 0;
                      return (
                        <TableCell key={item.event}>
                          {count > 0 ? formatNumber(count) : "-"}
                          {count > 0 && total > 0 && (
                            <span className="text-xs text-muted-foreground mr-1">
                              ({Math.round((count / total) * 100)}%)
                            </span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
