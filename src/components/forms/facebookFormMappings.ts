import type { Json } from "@/integrations/supabase/types";
import { isJsonObject, type JsonObject } from "@/types/marketing-b21";

export type FormMapping = {
  field_mappings: Record<string, string>;
  agency_id: string | null;
  client_id?: string | null;
  create_crm_lead?: boolean;
  sales_person_id: string | null; // legacy single
  sales_person_ids?: string[] | null; // new multi-select
  tag_id: string | null;
};

export type StoredFormMapping = FormMapping & {
  form_name?: string;
  page_id?: string | null;
};

const optString = (v: Json | undefined) =>
  typeof v === "string" ? v : undefined;
const nullableString = (v: Json | undefined) =>
  typeof v === "string" ? v : null;

function stringRecord(value: Json | undefined): Record<string, string> {
  if (!isJsonObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function parseFormMapping(value: Json | undefined): StoredFormMapping | null {
  if (!isJsonObject(value)) return null;
  const ids = value.sales_person_ids;
  return {
    field_mappings: stringRecord(value.field_mappings),
    agency_id: nullableString(value.agency_id),
    client_id: nullableString(value.client_id),
    create_crm_lead:
      typeof value.create_crm_lead === "boolean"
        ? value.create_crm_lead
        : undefined,
    sales_person_id: nullableString(value.sales_person_id),
    sales_person_ids: Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === "string")
      : undefined,
    tag_id: nullableString(value.tag_id),
    form_name: optString(value.form_name),
    page_id: optString(value.page_id),
  };
}

/** The raw form_mappings object of a Facebook integration's settings. */
export function rawFormMappings(settings: JsonObject | null): JsonObject {
  const mappings = settings?.form_mappings;
  return isJsonObject(mappings) ? { ...mappings } : {};
}

/** Readable form mappings; entries that are not objects are skipped. */
export function parseFormMappings(
  settings: JsonObject | null,
): Record<string, StoredFormMapping> {
  const result: Record<string, StoredFormMapping> = {};
  for (const [formId, value] of Object.entries(rawFormMappings(settings))) {
    const mapping = parseFormMapping(value);
    if (mapping) result[formId] = mapping;
  }
  return result;
}
