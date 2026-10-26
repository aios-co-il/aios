import type { Json } from "@/integrations/supabase/types";

const stringsOnly = (values: unknown[]): string[] =>
  values.filter((value): value is string => typeof value === "string");

/** `clients.services` as a list of service codes (stored as a JSON array, legacy rows as a JSON string). */
export function parseClientServices(raw: Json | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return stringsOnly(raw);
  if (typeof raw !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? stringsOnly(parsed) : [];
  } catch {
    return [];
  }
}
