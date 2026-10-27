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
