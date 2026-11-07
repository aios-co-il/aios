import { z } from "zod";
import { isJsonObject, type JsonColumnObject } from "@/lib/jsonFields";

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

const optString = z.string().optional().catch(undefined);
const nullableString = z.string().nullable().catch(null);

/** The string-valued entries of an object; anything else reads as `{}`. */
const stringRecord = z
  .record(z.unknown())
  .catch({})
  .transform((value) =>
    Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]): [string, string][] => {
        const text = z.string().safeParse(entry);
        return text.success ? [[key, text.data]] : [];
      }),
    ),
  );

const storedFormMappingSchema = z.object({
  field_mappings: stringRecord,
  agency_id: nullableString,
  client_id: nullableString,
  create_crm_lead: z.boolean().optional().catch(undefined),
  sales_person_id: nullableString,
  sales_person_ids: z
    .array(z.unknown())
    .transform((ids) =>
      ids.filter((id): id is string => typeof id === "string"),
    )
    .optional()
    .catch(undefined),
  tag_id: nullableString,
  form_name: optString,
  page_id: optString,
});

/** The raw form_mappings object of a Facebook integration's settings. */
export function rawFormMappings(
  settings: JsonColumnObject | null,
): JsonColumnObject {
  const mappings = settings?.form_mappings;
  return isJsonObject(mappings) ? { ...mappings } : {};
}

/** Readable form mappings; entries that are not objects are skipped. */
export function parseFormMappings(
  settings: JsonColumnObject | null,
): Record<string, StoredFormMapping> {
  const result: Record<string, StoredFormMapping> = {};
  for (const [formId, value] of Object.entries(rawFormMappings(settings))) {
    const mapping = storedFormMappingSchema.safeParse(value);
    if (mapping.success) result[formId] = mapping.data;
  }
  return result;
}
