import type { Json } from "./database.types.ts";

export type JsonObject = { [key: string]: Json | undefined };

/** The value as a JSON object, or null for scalars, arrays, null and undefined. */
export function asJsonObject(value: Json | undefined): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : null;
}

/** `JSON.parse(text)`, or `{ raw: text }` when the text is not valid JSON. */
export function parseJsonOrRaw(text: string): Json {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/** `e.message` when the thrown value carries one, otherwise undefined. */
export function thrownMessage(e: unknown): unknown {
  return typeof e === "object" && e !== null && "message" in e
    ? e.message
    : undefined;
}

/** `e.name` when the thrown value carries one, otherwise undefined. */
export function thrownName(e: unknown): unknown {
  return typeof e === "object" && e !== null && "name" in e
    ? e.name
    : undefined;
}
