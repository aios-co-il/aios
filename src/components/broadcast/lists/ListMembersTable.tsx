import type { ListMember } from "@/hooks/useBroadcastLists";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2 } from "lucide-react";

/** Members of a mailing list, including their custom (file/sheet) fields. */
export function ListMembersTable({
  members,
  onRemove,
}: {
  members: ListMember[];
  onRemove: (memberId: string) => void;
}) {
  return (
    <div className="max-h-72 overflow-y-auto rounded border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">שם</TableHead>
            <TableHead className="text-right">טלפון</TableHead>
            <TableHead className="text-right">אימייל</TableHead>
            <TableHead className="text-right">שדות</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((mem) => (
            <TableRow key={mem.id}>
              <TableCell>{mem.name || "—"}</TableCell>
              <TableCell dir="ltr" className="text-right">
                {mem.phone || "—"}
              </TableCell>
              <TableCell dir="ltr" className="text-right">
                {mem.email || "—"}
              </TableCell>
              <TableCell
                className="max-w-[160px] truncate text-xs text-muted-foreground"
                title={Object.entries(mem.custom_fields || {})
                  .map(([k, v]) => `${k}: ${v}`)
                  .join("\n")}
              >
                {Object.keys(mem.custom_fields || {}).join(", ") || "—"}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemove(mem.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {members.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={5}
                className="text-center text-muted-foreground py-6"
              >
                אין חברים ברשימה
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
