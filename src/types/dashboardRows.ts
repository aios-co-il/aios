import { z } from "zod";
import {
  jsonObjectSchema,
  listOf,
  parseEach,
  type JsonObject,
} from "@/lib/jsonReaders";

/** A `crm-records` report row: `crm_records.id` + its user-defined `data` jsonb. */
export type CrmRecordRow = { id: string; data: JsonObject | null };

const crmRecordRowSchema = z.object({
  id: z.string().catch(""),
  data: jsonObjectSchema.nullable().catch(null),
});

/** Narrow a `crm-records` response; non-object rows are dropped. */
export function toCrmRecordRows(value: unknown): CrmRecordRow[] {
  return parseEach(crmRecordRowSchema, value);
}

/** A `crm-tables` row as read by the combined dashboard; other columns pass through. */
export type DashboardTable = {
  id: string;
  name: string;
  client_id: string | null;
  integration_type: string | null;
  integration_settings: JsonObject | null;
  last_sync_at: string | null;
};

const textOrNull = z.string().nullable().catch(null);

const dashboardTableSchema = z
  .object({
    id: z.string(),
    name: z.string().catch(""),
    client_id: textOrNull,
    integration_type: textOrNull,
    integration_settings: jsonObjectSchema.nullable().catch(null),
    last_sync_at: textOrNull,
  })
  .passthrough();

/** Narrow a `crm-tables` response; rows without a string id are dropped. */
export function toDashboardTables(value: unknown): DashboardTable[] {
  return parseEach(dashboardTableSchema, value);
}

/** A `crm-fields` column definition (only what the raw report table renders). */
export type DashboardField = { key: string; name: string; position: number };

const dashboardFieldSchema = z.object({
  key: z.string(),
  name: z.string().catch(""),
  position: z.unknown().transform(Number),
});

const fieldsBodySchema = z
  .object({ fields: listOf(dashboardFieldSchema) })
  .catch({ fields: [] });

/** Narrow the `fields` of a `crm-fields` response; fields without a key are dropped. */
export function toDashboardFields(value: unknown): DashboardField[] {
  return fieldsBodySchema.parse(value).fields;
}
