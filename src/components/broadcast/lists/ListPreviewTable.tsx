import type { ListPreview } from "@/hooks/useBroadcastLists";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Match counts and a sample of contacts for a CRM-filter preview. */
export function ListPreviewTable({ preview }: { preview: ListPreview }) {
  return (
    <div className="space-y-2">
      <div className="text-sm">
        {preview.total} אנשי קשר · {preview.withPhone} עם טלפון ·{" "}
        {preview.withEmail} עם אימייל
      </div>
      <div className="max-h-64 overflow-y-auto rounded border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">שם</TableHead>
              <TableHead className="text-right">טלפון</TableHead>
              <TableHead className="text-right">אימייל</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.sample.map((r, i) => (
              <TableRow key={i}>
                <TableCell>{r.name || "—"}</TableCell>
                <TableCell dir="ltr" className="text-right">
                  {r.phone || "—"}
                </TableCell>
                <TableCell dir="ltr" className="text-right">
                  {r.email || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
