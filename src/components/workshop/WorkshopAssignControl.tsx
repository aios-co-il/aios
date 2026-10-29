import { ClientSelector } from "@/components/marketing/ClientSelector";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  departmentLabel,
  isClientLocked,
  projectDepartment,
} from "../../../supabase/functions/_shared/workshop/departments.ts";
import { UNASSIGNED_LABEL, type WorkshopListRow } from "./workshopProjectList";

/**
 * The project's client, as a picker that assigns, moves or releases it (workshop_assign_client).
 * SEO and social projects stay with the client they have, so the picker is locked for them.
 */
export function WorkshopAssignControl({
  tenantId,
  item,
  busy = false,
  onAssign,
}: {
  tenantId: string | undefined;
  item: WorkshopListRow;
  busy?: boolean;
  onAssign: (clientId: string | null) => void;
}) {
  const locked = isClientLocked(item);
  const selector = (
    <ClientSelector
      tenantId={tenantId}
      value={item.client_id}
      valueLabel={item.client_name}
      // The client it already has: nothing to assign.
      onChange={(clientId) => {
        if (clientId !== item.client_id) onAssign(clientId);
      }}
      allowGeneral
      generalLabel={UNASSIGNED_LABEL}
      disabled={locked || busy}
    />
  );
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">שיוך:</span>
      {locked ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0}>{selector}</span>
          </TooltipTrigger>
          <TooltipContent>
            פרויקט {departmentLabel(projectDepartment(item))} נשאר אצל הלקוח
            שלו, ואי אפשר להעביר אותו או להסיר את השיוך
          </TooltipContent>
        </Tooltip>
      ) : (
        selector
      )}
    </div>
  );
}
