import type { TablesInsert } from "@/integrations/supabase/types";
import { isLeadSource } from "@/lib/crmEnums-b13";

export type LeadInsert = TablesInsert<"leads">;

/** A lead row being assembled from an import file, before it is checked against the table. */
export type LeadDraft = Partial<Omit<LeadInsert, "source">> & {
  source?: string;
};

const isBlank = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && value.trim() === "");

const isOwnKey = <T extends object>(obj: T, key: PropertyKey): key is keyof T =>
  Object.prototype.hasOwnProperty.call(obj, key);

/** Copy of the draft without undefined, null or whitespace-only fields. */
export function dropBlankFields(lead: LeadDraft): LeadDraft {
  const cleaned: LeadDraft = { ...lead };
  for (const [key, value] of Object.entries(lead)) {
    if (isBlank(value) && isOwnKey(cleaned, key)) delete cleaned[key];
  }
  return cleaned;
}

/**
 * The draft as a `leads` insert row. Throws the error the database would return
 * for a missing company name or a source outside the `lead_source` enum.
 */
export function toLeadInsert(lead: LeadDraft): LeadInsert {
  const { source, company_name, ...rest } = lead;
  if (company_name === undefined) {
    throw new Error(
      'null value in column "company_name" of relation "leads" violates not-null constraint',
    );
  }
  if (source !== undefined && !isLeadSource(source)) {
    throw new Error(`invalid input value for enum lead_source: "${source}"`);
  }
  return source === undefined
    ? { ...rest, company_name }
    : { ...rest, company_name, source };
}
