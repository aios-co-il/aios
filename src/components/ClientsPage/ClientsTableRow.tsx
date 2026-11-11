import { Building2, Globe, Mail, Phone } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { TableCell, TableRow } from "@/components/ui/table";
import { ClientAvatar } from "@/components/clients/ClientAvatar";
import { ClientTeamPills } from "@/components/clients/ClientChips";
import { Empty, LinkCell, RowActions } from "./ClientsTableCells";
import { CampaignerAssignmentPicker } from "@/components/clients/CampaignerAssignmentPicker";
import { cn } from "@/lib/utils";
import { assignedCampaignerIds, type ClientRow } from "./clientRow";
import {
  ClientFinanceCell,
  type ClientFinanceAccess,
} from "./ClientFinanceCell";
import { ClientFolderLinkField } from "./ClientFolderLinkField";
import { ClientStatusSelect } from "./ClientRowSelects";
import type { ClientRowMutations } from "./useClientRowMutations";

/** What every table row can do, shared by the table and its rows. */
export interface ClientsTableRowActions {
  mutations: ClientRowMutations;
  finance: ClientFinanceAccess;
  canAssignCampaigners: boolean;
  onOpen: (clientId: string) => void;
  onDuplicate: (client: { id: string; name: string }) => void;
  onDelete: (client: ClientRow) => void;
}

interface ClientsTableRowProps extends ClientsTableRowActions {
  client: ClientRow;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
}

/** One client in the table view. */
export function ClientsTableRow({
  client,
  selected,
  onSelectedChange,
  mutations,
  finance,
  canAssignCampaigners,
  onOpen,
  onDuplicate,
  onDelete,
}: ClientsTableRowProps) {
  const team = client.client_team ?? [];
  return (
    <TableRow
      className={cn(
        "border-b border-border/60 transition-colors hover:bg-surface-inset/60",
        selected && "bg-brand-accent-50 dark:bg-brand-accent-950/40",
      )}
    >
      <TableCell className="w-10 py-3">
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onSelectedChange(checked === true)}
        />
      </TableCell>
      <TableCell className="py-3">
        <RowActions
          client={client}
          onOpen={onOpen}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      </TableCell>
      <TableCell className="py-3">
        <div className="flex min-w-[180px] max-w-[240px] items-center gap-2.5">
          <ClientAvatar name={client.name} status={client.status} size="sm" />
          <span className="line-clamp-2 font-semibold">{client.name}</span>
        </div>
      </TableCell>
      <TableCell className="py-3">
        {client.agencies ? (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Building2 className="h-4 w-4" />
            {client.agencies.name}
          </span>
        ) : (
          <Empty />
        )}
      </TableCell>
      <TableCell className="py-3">
        <ClientStatusSelect
          client={client}
          mutations={mutations}
          className="w-[140px]"
        />
      </TableCell>
      <TableCell className="py-3">
        <ClientFinanceCell client={client} field="retainer" access={finance} />
      </TableCell>
      <TableCell className="py-3">
        <ClientFinanceCell
          client={client}
          field="monthly_budget"
          access={finance}
        />
      </TableCell>
      <TableCell className="py-3">
        <LinkCell icon={Phone} href={client.phone && `tel:${client.phone}`}>
          {client.phone}
        </LinkCell>
      </TableCell>
      <TableCell className="py-3">
        <LinkCell icon={Mail} href={client.email && `mailto:${client.email}`}>
          {client.email}
        </LinkCell>
      </TableCell>
      <TableCell className="py-3">
        <LinkCell icon={Globe} href={client.website} external>
          קישור
        </LinkCell>
      </TableCell>
      <TableCell className="py-3">
        <div className="min-w-[200px]">
          <ClientFolderLinkField client={client} mutations={mutations} dense />
        </div>
      </TableCell>
      <TableCell className="py-3">
        <div className="flex min-w-[180px] flex-col gap-2">
          {team.length > 0 && <ClientTeamPills team={team} />}
          {canAssignCampaigners && (
            <CampaignerAssignmentPicker
              assignedCampaignerIds={assignedCampaignerIds(client)}
              triggerClassName="h-8 w-full text-xs"
              onAssign={(campaignerId) =>
                mutations.assignCampaigner.mutateAsync({
                  clientId: client.id,
                  campaignerId,
                })
              }
            />
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
