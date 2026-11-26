import type { ReactNode } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import {
  leadCustomFieldOptions,
  type LeadCustomFieldDefinition,
  type LeadCustomFieldValue,
} from "@/lib/leadCustomFields";
import { readLeadCustomColumnValue } from "@/lib/leadTableColumns";
import { LeadEditableCell } from "./LeadEditableCell";
import { LeadSelectCell } from "./LeadSelectCell";
import {
  customFieldEditorKind,
  leadCellEditValue,
  leadCustomCellPatch,
} from "./leadCellValues";
import type { LeadFieldsPatch } from "./useSaveLeadFields";

interface LeadCustomFieldCellProps {
  lead: { id: string; form_data?: unknown };
  field: LeadCustomFieldDefinition;
  onSave: (save: { leadId: string; patch: LeadFieldsPatch }) => void;
  /** The cell as the table shows it. */
  children: ReactNode;
}

/**
 * A tenant's custom field edited in its table cell: a checkbox toggles, a
 * field with choices picks one, and every other type opens its field.
 */
export function LeadCustomFieldCell({
  lead,
  field,
  onSave,
  children,
}: LeadCustomFieldCellProps) {
  const stored = readLeadCustomColumnValue(lead.form_data, field.field_key);

  function save(value: LeadCustomFieldValue) {
    onSave({
      leadId: lead.id,
      patch: leadCustomCellPatch(lead.form_data, field, value),
    });
  }

  if (field.field_type === "checkbox") {
    return (
      <Checkbox
        checked={stored === true || stored === "true"}
        aria-label={field.field_label}
        onClick={(event) => event.stopPropagation()}
        onCheckedChange={(checked) => save(checked === true)}
      />
    );
  }

  const options = leadCustomFieldOptions(field.options);
  if (field.field_type === "select" && options.length > 0) {
    return (
      <LeadSelectCell
        value={leadCellEditValue(stored, "text") || undefined}
        options={options}
        label={field.field_label}
        onSave={save}
      >
        {children}
      </LeadSelectCell>
    );
  }

  const kind = customFieldEditorKind(field.field_type);

  return (
    <LeadEditableCell
      kind={kind}
      value={leadCellEditValue(stored, kind)}
      label={field.field_label}
      onSave={save}
    >
      {children}
    </LeadEditableCell>
  );
}
