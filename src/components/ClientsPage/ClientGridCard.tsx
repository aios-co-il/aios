import { Building2, Copy, Pencil, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClientAvatar } from "@/components/clients/ClientAvatar";
import {
  ClientMoodChip,
  ClientServiceChips,
  ClientStatusChip,
  ClientTeamPills,
} from "@/components/clients/ClientChips";
import type { ClientRow } from "./clientRow";
import { ClientContactLines } from "./ClientContactLines";
import { ClientGridCardControls } from "./ClientGridCardControls";
import type { ClientRowMutations } from "./useClientRowMutations";

interface ClientGridCardProps {
  client: ClientRow;
  mutations: ClientRowMutations;
  /** False for pure campaigners, who may not assign campaigners. */
  canAssignCampaigners: boolean;
  onOpen: (clientId: string) => void;
  onDuplicate: (client: { id: string; name: string }) => void;
  onDelete: (client: ClientRow) => void;
}

/**
 * One client in the grid: identity and status on top, contact and team in the
 * middle, and the row's quick controls in a quiet footer. Clicking the card
 * opens the client in the chat view.
 */
export function ClientGridCard({
  client,
  mutations,
  canAssignCampaigners,
  onOpen,
  onDuplicate,
  onDelete,
}: ClientGridCardProps) {
  const team = client.client_team ?? [];
  return (
    <article
      className="group flex cursor-pointer flex-col rounded-2xl border bg-card text-card-foreground shadow-elevation-1 transition-shadow hover:shadow-elevation-2"
      onClick={() => onOpen(client.id)}
    >
      <div className="space-y-4 p-5">
        <header className="flex items-start gap-3">
          <ClientAvatar name={client.name} status={client.status} />
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-base font-bold leading-snug">
              {client.name}
            </h3>
            {client.agencies && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
                {client.agencies.name}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              title="ערוך"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              title="שכפל לקוח"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate({ id: client.id, name: client.name });
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 hover:bg-surface-status-red hover:text-destructive"
              title="מחק לקוח"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(client);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-1.5">
          <ClientStatusChip status={client.status} />
          <ClientMoodChip mood={client.mood_status} />
        </div>
        <ClientServiceChips services={client.services} />

        <ClientContactLines client={client} />

        {team.length > 0 && (
          <div className="flex items-start gap-2 text-sm">
            <Users
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
              aria-label="קמפיינרים משויכים"
            />
            <ClientTeamPills team={team} />
          </div>
        )}
      </div>

      <ClientGridCardControls
        client={client}
        mutations={mutations}
        canAssignCampaigners={canAssignCampaigners}
      />
    </article>
  );
}
