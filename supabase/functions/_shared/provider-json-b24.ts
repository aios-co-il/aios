// Narrow readers for untrusted provider / webhook JSON. Each reader returns
// undefined (or an empty array) when the value at the path has another shape.

export type JsonObject = { readonly [key: string]: unknown };

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
  const found = getPath(value, ...keys);
  return typeof found === "string" ? found : undefined;
}

export function getNumber(
  value: unknown,
  ...keys: string[]
): number | undefined {
  const found = getPath(value, ...keys);
  return typeof found === "number" ? found : undefined;
}

export function getArray(value: unknown, ...keys: string[]): unknown[] {
  const found = getPath(value, ...keys);
  return Array.isArray(found) ? found : [];
}

export function getObject(
  value: unknown,
  ...keys: string[]
): JsonObject | undefined {
  const found = getPath(value, ...keys);
  return isJsonObject(found) ? found : undefined;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  const message = getPath(error, "message");
  return typeof message === "string" ? message : String(error);
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
