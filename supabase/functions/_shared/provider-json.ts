// Narrow readers for untrusted provider / webhook JSON and caught errors. Each
// reader returns undefined (or an empty value) when the data has another shape.

export type JsonObject = { [key: string]: unknown };

export type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const asRecord = (value: unknown): JsonObject =>
  isJsonObject(value) ? value : {};

export const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

export const asRecords = (value: unknown): JsonObject[] =>
  asArray(value).filter(isJsonObject);

export const optString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

export const optNumber = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

export function getPath(value: unknown, ...keys: string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (!isJsonObject(current)) return undefined;
    current = current[key];
  }
  return current;
}

export function getString(
  value: unknown,
  ...keys: string[]
): string | undefined {
  return optString(getPath(value, ...keys));
}

export function getNumber(
  value: unknown,
  ...keys: string[]
): number | undefined {
  return optNumber(getPath(value, ...keys));
}

export function getArray(value: unknown, ...keys: string[]): unknown[] {
  return asArray(getPath(value, ...keys));
}

export function getObject(
  value: unknown,
  ...keys: string[]
): JsonObject | undefined {
  const found = getPath(value, ...keys);
  return isJsonObject(found) ? found : undefined;
}

/** Same as reading `e?.message` on an untyped catch value. */
export function errorMessage(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("message" in error)) {
    return undefined;
  }
  return typeof error.message === "string" ? error.message : undefined;
}

/** The error's message, or the value itself as a string. */
export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return getString(error, "message") ?? String(error);
}

/** Merges a JSON object body into a string parameter bag (form/query style). */
export function mergeJsonStringParams(
  params: Record<string, string>,
  body: unknown,
): void {
  if (!isJsonObject(body)) return;
  for (const [key, value] of Object.entries(body)) {
    if (value === null || value === undefined) delete params[key];
    else params[key] = String(value);
  }
}
