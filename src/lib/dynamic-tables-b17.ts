import type { Json, Tables } from "@/integrations/supabase/types";

export type JsonObject = { [key: string]: Json | undefined };

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asJsonObject(value: unknown): JsonObject {
  return isJsonObject(value) ? value : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function jsonObjects(value: unknown): JsonObject[] {
  return asArray(value).filter(isJsonObject);
}

export function readString(obj: unknown, key: string): string | undefined {
  if (!isJsonObject(obj)) return undefined;
  const value = obj[key];
  return typeof value === "string" ? value : undefined;
}

export function readNumber(obj: unknown, key: string): number | undefined {
  if (!isJsonObject(obj)) return undefined;
  const value = obj[key];
  return typeof value === "number" ? value : undefined;
}

export function errorMessage(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("message" in error)) {
    return undefined;
  }
  const { message } = error;
  return typeof message === "string" ? message : undefined;
}

export function readField(obj: unknown, key: string): Json | undefined {
  return isJsonObject(obj) ? obj[key] : undefined;
}

export function readFloat(obj: unknown, key: string): number {
  return parseFloat(String(readField(obj, key)));
}

export function asJsonArray(value: Json | null | undefined): Json[] {
  return Array.isArray(value) ? value : [];
}

export type CrmTableRow = Tables<"crm_tables">;

export function readText(obj: unknown, key: string): string | undefined {
  const value = readField(obj, key);
  if (typeof value === "string") return value;
  return typeof value === "number" ? String(value) : undefined;
}

export type SeoReportRecord = Partial<
  Pick<
    Tables<"ahrefs_reports">,
    | "id"
    | "client_id"
    | "domain"
    | "received_at"
    | "report_date"
    | "report_type"
    | "report_data"
    | "comparison_data"
    | "metadata"
  >
>;

export function readDateInput(
  obj: unknown,
  key: string,
): string | number | undefined {
  const value = readField(obj, key);
  return typeof value === "string" || typeof value === "number"
    ? value
    : undefined;
}

export type SeoReportRow = Pick<
  Tables<"ahrefs_reports">,
  "id" | "domain" | "received_at" | "report_date" | "report_data"
> &
  SeoReportRecord;

export interface DynamicRecord {
  id?: string;
  data?: JsonObject | null;
}

export type LangFilterValue = "all" | "he" | "en";

export function toLangFilter(value: unknown): LangFilterValue {
  return value === "he" || value === "en" ? value : "all";
}
