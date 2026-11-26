import type { Json } from "@/integrations/supabase/types";
import {
  mergeLeadCustomFieldValues,
  type LeadCustomFieldDefinition,
  type LeadCustomFieldValue,
} from "@/lib/leadCustomFields";
import type { LeadCellEditorKind } from "./LeadCellEditor";
import type { LeadFieldsPatch } from "./useSaveLeadFields";

/** The lead columns a table cell edits in place, with the field each opens. */
const EDITABLE_LEAD_FIELDS = {
  contact_name: "text",
  phone: "tel",
  company_name: "text",
  campaign_name: "text",
  email: "email",
  industry: "text",
  monthly_budget: "number",
  three_month_budget: "number",
  estimated_deal_value: "number",
  proposal_date: "date",
  won_date: "date",
  meeting_date: "date",
  meeting_time: "text",
  meeting_location: "text",
  folder_link: "text",
  lost_reason: "text",
} as const satisfies Partial<Record<keyof LeadFieldsPatch, LeadCellEditorKind>>;

export type EditableLeadField = keyof typeof EDITABLE_LEAD_FIELDS;

/** A patch to save, or the reason the typed value is refused. */
export type LeadCellPatchResult =
  { patch: LeadFieldsPatch } | { error: string };

const CUSTOM_FIELD_EDITORS: Record<string, LeadCellEditorKind | undefined> = {
  phone: "tel",
  email: "email",
  number: "number",
  date: "date",
  textarea: "textarea",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEditableLeadField(key: string): key is EditableLeadField {
  return key in EDITABLE_LEAD_FIELDS;
}

export function leadCellEditorKind(
  field: EditableLeadField,
): LeadCellEditorKind {
  return EDITABLE_LEAD_FIELDS[field];
}

/** The editor for a custom field's type; other types edit as text. */
export function customFieldEditorKind(fieldType: string): LeadCellEditorKind {
  return CUSTOM_FIELD_EDITORS[fieldType] ?? "text";
}

/** A stored value as its field edits it: empty when unset, a date as yyyy-mm-dd. */
export function leadCellEditValue(
  value: unknown,
  kind: LeadCellEditorKind,
): string {
  if (value == null || typeof value === "object") {
    return "";
  }
  const text = String(value);

  return kind === "date" ? text.slice(0, 10) : text;
}

/** The patch that saves a cell's trimmed draft; an empty draft clears the field. */
export function leadCellPatch(
  field: EditableLeadField,
  draft: string,
): LeadCellPatchResult {
  if (field === "company_name" && !draft) {
    return { error: "שם החברה הוא שדה חובה" };
  }
  if (field === "email" && draft && !EMAIL_PATTERN.test(draft)) {
    return { error: "כתובת אימייל לא תקינה" };
  }

  const kind = EDITABLE_LEAD_FIELDS[field];
  if (kind !== "number" || !draft) {
    return { patch: { [field]: draft || null } };
  }

  const amount = Number(draft);
  if (!Number.isFinite(amount)) {
    return { error: "יש להזין מספר" };
  }

  return { patch: { [field]: amount } };
}

/** The patch that saves one custom field into the lead's stored form data. */
export function leadCustomCellPatch(
  formData: unknown,
  field: LeadCustomFieldDefinition,
  value: LeadCustomFieldValue,
): LeadFieldsPatch {
  const merged = mergeLeadCustomFieldValues(formData, [field], {
    [field.field_key]: value,
  });

  // The merge keeps the stored JSON and replaces one scalar in it.
  return { form_data: merged as Json };
}
