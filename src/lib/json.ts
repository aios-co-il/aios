import type { Json } from "@/integrations/supabase/types";

export function isJson(value: unknown): value is Json {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJson);
  if (typeof value !== "object") return false;
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  return Object.values(value).every((v) => v === undefined || isJson(v));
}

/** `value` typed as a JSON column value; throws when it holds non-JSON data (functions, class instances, ...). */
export function toJson(value: unknown): Json {
  if (!isJson(value)) throw new TypeError("Value is not JSON-serializable");
  return value;
}
