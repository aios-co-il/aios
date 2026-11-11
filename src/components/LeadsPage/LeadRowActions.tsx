import { CheckSquare, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import AddTaskForm from "@/components/forms/AddTaskForm";
import { EditLeadDialog } from "@/components/forms/EditLeadDialog";
import type { LeadTableRow } from "./leadTableTypes";

const ICON_BUTTON =
  "h-7 w-7 rounded-full text-muted-foreground hover:bg-brand-accent-50 hover:text-brand-accent-700 dark:hover:bg-brand-accent-950 dark:hover:text-brand-accent-300";

/** Open the lead (or its edit dialog) and add a task for it. */
export function LeadRowActions({
  lead,
  onOpen,
}: {
  lead: LeadTableRow;
  onOpen?: () => void;
}) {
  return (
    <div className="flex justify-center gap-0.5">
      {onOpen ? (
        <Button
          variant="ghost"
          size="icon"
          className={ICON_BUTTON}
          title="פרטי ליד"
          onClick={onOpen}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <EditLeadDialog lead={lead} />
      )}
      <AddTaskForm
        leadId={lead.id}
        agencyId={lead.agency_id || undefined}
        triggerButton={
          <Button
            variant="ghost"
            size="icon"
            className={ICON_BUTTON}
            title="הוסף משימה"
          >
            <CheckSquare className="h-3.5 w-3.5" />
          </Button>
        }
      />
    </div>
  );
}
