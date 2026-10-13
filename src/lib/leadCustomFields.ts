export interface LeadCustomFieldDefinition {
  id: string;
  field_key: string;
  field_label: string;
  field_type: string;
  is_required: boolean;
  is_visible: boolean;
  options: unknown;
  sort_order: number;
}

export type LeadCustomFieldValue = string | boolean;
export type LeadCustomFieldValues = Record<string, LeadCustomFieldValue>;

export const LEAD_SYSTEM_FIELD_KEYS = new Set([
  "company_name",
  "contact_name",
  "phone",
  "email",
  "source",
  "status",
  "response_status",
  "notes",
  "products",
  "campaign_name",
  "industry",
  "monthly_budget",
  "three_month_budget",
  "estimated_deal_value",
  "proposal_date",
  "won_date",
  "meeting_date",
  "meeting_time",
  "meeting_location",
  "folder_link",
  "lost_reason",
  "tags",
  "follow_up_date",
  "created_at",
  "sales_person",
  "sales_person_id",
  "agency_id",
  "manychat_subscriber_id",
  "itai_meeting_date",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isEditableValue(value: unknown): boolean {
  return (
    value == null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

export function getVisibleLeadCustomFields(
  fields: LeadCustomFieldDefinition[],
): LeadCustomFieldDefinition[] {
  return fields
    .filter(
      (field) =>
        field.is_visible && !LEAD_SYSTEM_FIELD_KEYS.has(field.field_key),
    )
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function getLeadCustomFieldInitialValues(
  fields: LeadCustomFieldDefinition[],
  formData: unknown,
): LeadCustomFieldValues {
  const stored = asRecord(formData);

  return Object.fromEntries(
    fields.map((field) => {
      const value = stored[field.field_key];
      if (!isEditableValue(value)) return [field.field_key, ""];
      if (field.field_type === "checkbox") {
        return [field.field_key, value === true || value === "true"];
      }
      return [field.field_key, value == null ? "" : String(value)];
    }),
  );
}

export function getMissingRequiredLeadCustomFields(
  fields: LeadCustomFieldDefinition[],
  values: LeadCustomFieldValues,
): LeadCustomFieldDefinition[] {
  return fields.filter((field) => {
    if (!field.is_required) return false;
    const value = values[field.field_key];
    return field.field_type === "checkbox"
      ? value !== true
      : !String(value ?? "").trim();
  });
}

export function mergeLeadCustomFieldValues(
  formData: unknown,
  fields: LeadCustomFieldDefinition[],
  values: LeadCustomFieldValues,
): Record<string, unknown> {
  const merged = { ...asRecord(formData) };

  for (const field of fields) {
    if (!isEditableValue(merged[field.field_key])) continue;

    const value = values[field.field_key];
    if (field.field_type === "checkbox") {
      merged[field.field_key] = value === true;
      continue;
    }

    const text = String(value ?? "").trim();
    if (!text) {
      delete merged[field.field_key];
    } else if (field.field_type === "number") {
      const parsed = Number(text);
      merged[field.field_key] = Number.isFinite(parsed) ? parsed : text;
    } else {
      merged[field.field_key] = text;
    }
  }

  return merged;
}
