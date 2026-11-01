/** The JSON object guard of the chat collector's stored settings, evidence and model answers. */
import type { Json } from "../../../_shared/database.types.ts";

export type JsonObject = { [key: string]: Json | undefined };

/** True for a JSON object (not an array or null). */
export function isJsonObject(
  value: Json | null | undefined,
): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
