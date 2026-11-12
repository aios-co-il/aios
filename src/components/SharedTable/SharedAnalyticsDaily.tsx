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
  getPurchasesFromData,
  getRevenueFromData,
  getSessionsFromData,
} from "@/lib/adsMetrics";
import type { SharedTableRecord } from "./publicTableApi";
import { formatShortNumber } from "./sharedFormat";

type Props = {
  records: Array<SharedTableRecord>;
  formatCurrency: (amount: number) => string;
};

/** An analytics share's last 60 days, newest first. */
export function SharedAnalyticsDaily({ records, formatCurrency }: Props) {
  const days = [...records]
    .sort((a, b) => dayOf(b).localeCompare(dayOf(a)))
    .slice(0, 60);
  return (
    <Card>
      <CardHeader>
        <CardTitle>פירוט יומי</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">תאריך</TableHead>
                <TableHead className="text-right">סשנים</TableHead>
                <TableHead className="text-right">צפיות עמוד</TableHead>
                <TableHead className="text-right">רכישות</TableHead>
                <TableHead className="text-right">הכנסות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {days.map((record, index) => (
                <TableRow key={record.id || index}>
                  <TableCell>{dayOf(record) || "—"}</TableCell>
                  <TableCell>
                    {formatShortNumber(getSessionsFromData(record.data))}
                  </TableCell>
                  <TableCell>
                    {formatShortNumber(
                      Number(record.data?.screenPageViews) ||
                        Number(record.data?.pageviews) ||
                        0,
                    )}
                  </TableCell>
                  <TableCell>
                    {formatShortNumber(getPurchasesFromData(record.data))}
                  </TableCell>
                  <TableCell>
                    {formatCurrency(getRevenueFromData(record.data))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/** The row's yyyy-MM-dd day, empty when it has none. */
function dayOf(record: SharedTableRecord): string {
  const date = record.data?.date;
  return typeof date === "string" ? date : "";
}
