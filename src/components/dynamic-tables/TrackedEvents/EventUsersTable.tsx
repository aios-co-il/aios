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
  EventUsersResult,
  EventUsersRow,
} from "../../../../supabase/functions/ga-event-users/reports.ts";

type Props = {
  /** The GA answer; undefined while it loads. */
  result: EventUsersResult | undefined;
  loading: boolean;
  failed: boolean;
  formatNumber: (value: number) => string;
};

/**
 * How many people did each followed event, in total and per traffic source,
 * and under each step after the first, the share of the previous step's
 * people who went on to it.
 */
export function EventUsersTable({
  result,
  loading,
  failed,
  formatNumber,
}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">משתמשים לפי מקור תנועה</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">
            טוען נתונים מ-Google Analytics…
          </p>
        ) : !result && !failed ? (
          <p className="text-sm text-muted-foreground">
            בחרו טווח תאריכים כדי לראות את המשתמשים
          </p>
        ) : failed || !result ? (
          <p className="text-sm text-muted-foreground">
            לא הצלחנו לטעון את נתוני המשתמשים מ-Google Analytics
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מקור תנועה</TableHead>
                    {result.steps.map((step) => (
                      <TableHead key={step.event} className="text-center">
                        {step.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <UsersRow
                    row={result.total}
                    result={result}
                    formatNumber={formatNumber}
                    isTotal
                  />
                  {result.sources.map((row) => (
                    <UsersRow
                      key={row.source}
                      row={row}
                      result={result}
                      formatNumber={formatNumber}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              {result.funnelAvailable
                ? "המספרים הם משתמשים ייחודיים. האחוז מתחת לכל שלב: מתוך מי שעשה את השלב הקודם, כמה המשיכו לשלב הזה."
                : "המספרים הם משתמשים ייחודיים. אחוזי ההמרה לא זמינים כרגע מ-Google Analytics."}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** One source's people per step, with the step conversion under each. */
function UsersRow({
  row,
  result,
  formatNumber,
  isTotal = false,
}: {
  row: EventUsersRow;
  result: EventUsersResult;
  formatNumber: (value: number) => string;
  isTotal?: boolean;
}) {
  return (
    <TableRow className={isTotal ? "bg-muted/50 font-semibold" : undefined}>
      <TableCell className="text-right whitespace-nowrap" dir="ltr">
        {row.source}
      </TableCell>
      {result.steps.map((step, index) => {
        const rate = row.stepRates[step.event];
        return (
          <TableCell key={step.event} className="text-center">
            <div>{formatNumber(row.users[step.event] ?? 0)}</div>
            {index > 0 && (
              <div className="text-xs font-normal text-muted-foreground">
                {rate === null || rate === undefined
                  ? "—"
                  : `${(rate * 100).toFixed(1)}%`}
              </div>
            )}
          </TableCell>
        );
      })}
    </TableRow>
  );
}
