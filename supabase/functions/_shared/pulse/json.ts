/** A JSON value, as stored in crm_tables.integration_settings or pulse_alert_rules. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };

/** A JSON object; the shape every settings column holds at its top level. */
export type JsonObject = { [key: string]: JsonValue | undefined };

/**
 * A non-array object. Settings come from JSON columns, so an object read from
 * them holds JSON values only.
 */
export function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Do two JSON values hold the same data, whatever the order of their keys? */
export function sameJson(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, i) => sameJson(value, b[i]))
    );
  }
  if (isJsonObject(a) && isJsonObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((key) => sameJson(a[key], b[key]));
  }
  return a === b;
}
