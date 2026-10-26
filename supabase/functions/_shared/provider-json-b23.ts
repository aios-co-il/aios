/** Narrowing helpers for untrusted provider / webhook JSON and caught errors. */

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const asRecord = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

export const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

export const asRecords = (value: unknown): Record<string, unknown>[] =>
  asArray(value).filter(isRecord);

export const optString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

export const optNumber = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

/** Same as reading `e?.message` on an untyped catch value. */
export const errorMessage = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null || !("message" in error)) {
    return undefined;
  }
  return typeof error.message === "string" ? error.message : undefined;
};

export type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};
