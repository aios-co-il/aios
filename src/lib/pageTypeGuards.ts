import type { Json } from "@/integrations/supabase/types";

export type JsonObject = { [key: string]: Json | undefined };

export const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const jsonField = (value: unknown, key: string): unknown =>
  isJsonObject(value) ? value[key] : undefined;

export const isPresent = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;

export const readErrorMessage = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null || !("message" in error)) {
    return undefined;
  }
  return typeof error.message === "string" ? error.message : undefined;
};
