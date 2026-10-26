import type { Json } from "@/integrations/supabase/types";

/** A JSON object as stored in jsonb columns (`crm_records.data`, settings). */
export type JsonObject = { [key: string]: Json | undefined };

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The object form of a JSON value; null, primitives and arrays read as `{}`. */
export function asJsonObject(value: unknown): JsonObject {
  return isJsonObject(value) ? value : {};
}

/** A `crm-records` report row: `crm_records.id` + its user-defined `data` jsonb. */
export type CrmRecordRow = { id: string; data: JsonObject | null };

/** Narrow a `crm-records` response; non-object rows are dropped. */
export function toCrmRecordRows(value: unknown): CrmRecordRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row: unknown) =>
    isJsonObject(row)
      ? [
          {
            id: typeof row.id === "string" ? row.id : "",
            data: isJsonObject(row.data) ? row.data : null,
          },
        ]
      : [],
  );
}

/** `parseFloat` on a JSON value, with the same implicit string coercion. */
export const parseJsonFloat = (value: Json | undefined): number =>
  parseFloat(String(value));

/** `err?.message` for any thrown value (Error, PostgrestError, plain objects). */
export function thrownMessage(err: unknown): unknown {
  return typeof err === "object" && err !== null && "message" in err
    ? err.message
    : undefined;
}

/** `err?.code` for any thrown value (PostgrestError / FunctionsError). */
export function thrownCode(err: unknown): unknown {
  return typeof err === "object" && err !== null && "code" in err
    ? err.code
    : undefined;
}

/** A `crm-tables` row as read by the combined dashboard; other columns pass through. */
export type DashboardTable = {
  id: string;
  name: string;
  integration_type: string | null;
  integration_settings: JsonObject | null;
  last_sync_at: string | null;
};

const stringOr = <T>(value: Json | undefined, fallback: T): string | T =>
  typeof value === "string" ? value : fallback;

/** Narrow a `crm-tables` response; rows without a string id are dropped. */
export function toDashboardTables(value: unknown): DashboardTable[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row: unknown) =>
    isJsonObject(row) && typeof row.id === "string"
      ? [
          {
            ...row,
            id: row.id,
            name: stringOr(row.name, ""),
            integration_type: stringOr(row.integration_type, null),
            integration_settings: isJsonObject(row.integration_settings)
              ? row.integration_settings
              : null,
            last_sync_at: stringOr(row.last_sync_at, null),
          },
        ]
      : [],
  );
}

/** A `crm-fields` column definition (only what the raw report table renders). */
export type DashboardField = { key: string; name: string; position: number };

/** Narrow the `fields` of a `crm-fields` response; fields without a key are dropped. */
export function toDashboardFields(value: unknown): DashboardField[] {
  const fields = asJsonObject(value).fields;
  if (!Array.isArray(fields)) return [];
  return fields.flatMap((field) =>
    isJsonObject(field) && typeof field.key === "string"
      ? [
          {
            key: field.key,
            name: stringOr(field.name, ""),
            position: Number(field.position),
          },
        ]
      : [],
  );
}
