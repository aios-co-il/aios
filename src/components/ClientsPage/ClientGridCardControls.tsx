import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import AddTaskForm from "@/components/forms/AddTaskForm";
import { CampaignerAssignmentPicker } from "@/components/clients/CampaignerAssignmentPicker";
import { assignedCampaignerIds, type ClientRow } from "./clientRow";
import { ClientFolderLinkField } from "./ClientFolderLinkField";
import { ClientMoodSelect, ClientStatusSelect } from "./ClientRowSelects";
import type { ClientRowMutations } from "./useClientRowMutations";

/**
 * The grid card's footer: status, mood, folder link, campaigner and a new
 * task. Clicks here stay in the footer and do not open the client.
 */
export function ClientGridCardControls({
  client,
  mutations,
  canAssignCampaigners,
}: {
  client: ClientRow;
  mutations: ClientRowMutations;
  canAssignCampaigners: boolean;
}) {
  return (
    <div
      className="mt-auto space-y-3 rounded-b-2xl border-t bg-surface-inset/60 p-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="grid grid-cols-2 gap-2">
        <ControlField label="סטטוס">
          <ClientStatusSelect client={client} mutations={mutations} />
        </ControlField>
        <ControlField label="מצב לקוח">
          <ClientMoodSelect client={client} mutations={mutations} />
        </ControlField>
      </div>
      <ControlField label="קישור לתיקיה">
        <ClientFolderLinkField client={client} mutations={mutations} />
      </ControlField>
      {canAssignCampaigners && (
        <ControlField label="הוסף קמפיינר">
          <CampaignerAssignmentPicker
            assignedCampaignerIds={assignedCampaignerIds(client)}
            triggerClassName="h-9 w-full bg-card"
            onAssign={(campaignerId) =>
              mutations.assignCampaigner.mutateAsync({
                clientId: client.id,
                campaignerId,
              })
            }
          />
        </ControlField>
      )}
      <AddTaskForm
        clientId={client.id}
        agencyId={client.agency_id ?? undefined}
        triggerButton={
          <Button size="sm" variant="outline" className="w-full gap-2 bg-card">
            <Plus className="h-4 w-4" />
            הוסף משימה
          </Button>
        }
      />
    </div>
  );
}

/** A small caption above a footer control. */
function ControlField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
