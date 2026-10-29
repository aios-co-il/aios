import { formatDateTime } from "@/lib/formatDateTime";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RECIPIENT_STATUS_LABEL } from "./broadcastStats";
import type { RecipientStatsRow } from "./useBroadcastRecipients";

/** One row per recipient: address, status (with the failure reason) and event times. */
export function RecipientsTable({
  rows,
  isEmail,
}: {
  rows: RecipientStatsRow[];
  isEmail: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-right">נמען</TableHead>
          <TableHead className="text-right">סטטוס</TableHead>
          <TableHead className="text-right">נשלח</TableHead>
          {isEmail && <TableHead className="text-right">נפתח</TableHead>}
          {isEmail && <TableHead className="text-right">הקליק</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={5}
              className="py-6 text-center text-muted-foreground"
            >
              אין נמענים להצגה
            </TableCell>
          </TableRow>
        ) : (
          rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <div className="font-medium">{r.contact_name || "—"}</div>
                <div className="text-xs text-muted-foreground" dir="ltr">
                  {isEmail ? r.email : r.phone}
                </div>
              </TableCell>
              <TableCell>
                <span
                  className={r.status === "failed" ? "text-destructive" : ""}
                >
                  {RECIPIENT_STATUS_LABEL[r.status] || r.status}
                </span>
                {r.status === "failed" && r.error && (
                  <div
                    className="max-w-[220px] truncate text-xs text-muted-foreground"
                    title={r.error}
                  >
                    {r.error}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-xs tabular-nums">
                {formatDateTime(r.sent_at) || "—"}
              </TableCell>
              {isEmail && (
                <TableCell className="text-xs tabular-nums">
                  {formatDateTime(r.opened_at) || "—"}
                </TableCell>
              )}
              {isEmail && (
                <TableCell className="text-xs tabular-nums">
                  {formatDateTime(r.clicked_at) || "—"}
                </TableCell>
              )}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
