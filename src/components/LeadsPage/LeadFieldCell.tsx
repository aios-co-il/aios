import type { ReactNode } from "react";
import { toast } from "sonner";

import { LeadEditableCell } from "./LeadEditableCell";
import {
  leadCellEditorKind,
  leadCellEditValue,
  leadCellPatch,
  type EditableLeadField,
} from "./leadCellValues";
import type { LeadFieldsPatch } from "./useSaveLeadFields";

interface LeadFieldCellProps {
  lead: { id: string } & Partial<Record<EditableLeadField, unknown>>;
  field: EditableLeadField;
  /** The column's name, for the tooltip. */
  label: string;
  /** See `LeadEditableCell`: "icon" when the value has clicks of its own. */
  trigger?: "cell" | "icon";
  onSave: (save: { leadId: string; patch: LeadFieldsPatch }) => void;
  /** The cell as the table shows it. */
  children: ReactNode;
}

/** One lead column edited in its table cell; a refused value shows why. */
export function LeadFieldCell({
  lead,
  field,
  label,
  trigger,
  onSave,
  children,
}: LeadFieldCellProps) {
  const kind = leadCellEditorKind(field);

  function save(draft: string) {
    const result = leadCellPatch(field, draft);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    onSave({ leadId: lead.id, patch: result.patch });
  }

  return (
    <LeadEditableCell
      kind={kind}
      value={leadCellEditValue(lead[field], kind)}
      label={label}
      trigger={trigger}
      onSave={save}
    >
      {children}
    </LeadEditableCell>
  );
}
