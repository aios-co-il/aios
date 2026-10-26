import type { TenantIntegrationRow } from "@/lib/tenantIntegrationsClient";

export type JsonObject = { [key: string]: unknown };

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asJsonObject(value: unknown): JsonObject {
  return isJsonObject(value) ? value : {};
}

/** Reads `.message` from Error and error-like objects (e.g. PostgREST errors). */
export function errorMessageOf(error: unknown): string | undefined {
  if (!isJsonObject(error)) return undefined;
  const { message } = error;
  return message === undefined || message === null
    ? undefined
    : String(message);
}

/** String setting from an untrusted JSON object; numbers are stringified. */
export function readText(source: unknown, key: string): string | undefined {
  const value = asJsonObject(source)[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/** String-valued entries of a JSON object column; null when the value is not an object. */
export function asStringMap(value: unknown): Record<string, string> | null {
  if (!isJsonObject(value)) return null;
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

const isNullableString = (value: unknown) =>
  value === undefined || value === null || typeof value === "string";

export function isTenantIntegrationRow(
  value: unknown,
): value is TenantIntegrationRow {
  if (!isJsonObject(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.tenant_id === "string" &&
    typeof value.integration_type === "string" &&
    isNullableString(value.user_id) &&
    (value.settings === undefined ||
      value.settings === null ||
      isJsonObject(value.settings))
  );
}
