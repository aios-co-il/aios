import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SharedTablePayload, SharedTableRecord } from "./publicTableApi";
import { formatCellValue } from "./sharedFormat";

type Props = {
  fields: SharedTablePayload["fields"];
  records: Array<SharedTableRecord>;
};

/** A table without an integration: its fields as columns, or its rows' keys. */
export function SharedGenericTable({ fields, records }: Props) {
  const columns = genericColumns(fields, records);
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead
                    key={col.key}
                    className="text-right whitespace-nowrap"
                  >
                    {col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length || 1}
                    className="text-center py-12 text-muted-foreground"
                  >
                    אין נתונים לתקופה זו
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record, index) => (
                  <TableRow key={record.id || index}>
                    {columns.map((col) => (
                      <TableCell key={col.key} className="whitespace-nowrap">
                        {formatCellValue(record.data?.[col.key])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/** The table's fields, or the first row's keys when it has none. */
function genericColumns(
  fields: SharedTablePayload["fields"],
  records: Array<SharedTableRecord>,
): Array<{ key: string; label: string }> {
  if (fields?.length || !records.length) {
    return (fields || []).map((field) => ({
      key: field.field_key,
      label: field.field_label,
    }));
  }
  return Object.keys(records[0]?.data || {})
    .filter((key) => !key.startsWith("_") && key !== "report_type")
    .map((key) => ({ key, label: key }));
}
