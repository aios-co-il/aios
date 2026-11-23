import { ListChecks } from "lucide-react";
import type { LeadCustomFieldDefinition } from "@/lib/leadCustomFields";
import {
  formatLeadTableFieldValue,
  readLeadCustomColumnValue,
} from "@/lib/leadTableColumns";

interface LeadCustomFieldsCardProps {
  /** Visible tenant custom fields, already sorted for display. */
  fields: Array<LeadCustomFieldDefinition>;
  formData: unknown;
}

/** The lead's custom field values (saved in `form_data`) for the chat details tab. */
export function LeadCustomFieldsCard({
  fields,
  formData,
}: LeadCustomFieldsCardProps) {
  if (fields.length === 0) {
    return null;
  }

  return (
    <div className="bg-card border border-border/60 rounded-xl p-4 space-y-3 text-right shadow-sm">
      <h3 className="font-semibold text-sm flex items-center gap-2 justify-end text-foreground">
        שדות נוספים
        <ListChecks className="h-4 w-4 text-primary" />
      </h3>
      <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        {fields.map((field) => (
          <div
            key={field.id}
            className="flex items-start justify-end gap-2 min-w-0"
          >
            <span
              className="font-medium min-w-0 whitespace-pre-wrap break-words"
              dir="auto"
            >
              {formatLeadTableFieldValue(
                readLeadCustomColumnValue(formData, field.field_key),
                field.field_type,
              )}
            </span>
            <span className="text-muted-foreground shrink-0">
              :{field.field_label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
