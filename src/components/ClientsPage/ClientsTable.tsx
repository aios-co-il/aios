import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClientsMultiSelectToolbar } from "@/components/clients/ClientsMultiSelectToolbar";
import type { ClientRow } from "./clientRow";
import {
  ClientsTableRow,
  type ClientsTableRowActions,
} from "./ClientsTableRow";

/** The table's columns: the custom-label field and its default label. */
const COLUMNS: ReadonlyArray<[field: string, fallback: string]> = [
  ["name", "שם"],
  ["agency_id", "סוכנות"],
  ["status", "סטטוס"],
  ["retainer", "ריטיינר"],
  ["monthly_budget", "תקציב חודשי"],
  ["phone", "טלפון"],
  ["email", "אימייל"],
  ["website", "אתר"],
  ["folder_link", "תיקיה"],
  ["campaigners", "קמפיינרים"],
];

interface ClientsTableProps extends ClientsTableRowActions {
  clients: ReadonlyArray<ClientRow>;
  selectedIds: Array<string>;
  onSelectedIdsChange: (update: (ids: Array<string>) => Array<string>) => void;
  getFieldLabel: (field: string, fallback: string) => string;
  tenantId: string | null | undefined;
}

/** The table view: a selectable row per client inside a soft card. */
export function ClientsTable({
  clients,
  selectedIds,
  onSelectedIdsChange,
  getFieldLabel,
  tenantId,
  ...rowActions
}: ClientsTableProps) {
  const allIds = clients.map((c) => c.id);
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-elevation-1">
      {selectedIds.length > 0 && (
        <div className="border-b p-2">
          <ClientsMultiSelectToolbar
            selectedIds={selectedIds}
            onClearSelection={() => onSelectedIdsChange(() => [])}
            onSelectAll={() => onSelectedIdsChange(() => allIds)}
            totalCount={clients.length}
            tenantId={tenantId}
          />
        </div>
      )}
      <Table className="relative">
        <TableHeader>
          <TableRow className="border-b bg-surface-inset hover:bg-surface-inset">
            <TableHead className="w-10">
              <Checkbox
                checked={
                  clients.length > 0 && selectedIds.length === clients.length
                }
                onCheckedChange={(checked) =>
                  onSelectedIdsChange(() => (checked ? allIds : []))
                }
              />
            </TableHead>
            <TableHead className="h-11 text-right text-xs font-semibold text-muted-foreground">
              פעולות
            </TableHead>
            {COLUMNS.map(([field, fallback]) => (
              <TableHead
                key={field}
                className="text-right text-xs font-semibold text-muted-foreground"
              >
                {getFieldLabel(field, fallback)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((client) => (
            <ClientsTableRow
              key={client.id}
              client={client}
              selected={selectedIds.includes(client.id)}
              onSelectedChange={(checked) =>
                onSelectedIdsChange((ids) =>
                  checked
                    ? [...ids, client.id]
                    : ids.filter((id) => id !== client.id),
                )
              }
              {...rowActions}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
