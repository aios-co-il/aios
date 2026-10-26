// Narrowing helpers for untrusted JSON (request bodies, provider responses,
// JSON columns): read fields as `unknown` and check each one before use.

export type UnknownRecord = { readonly [key: string]: unknown };

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

/** The value when it is an object, else an empty record (reads yield undefined). */
export function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

/** JSON.parse that yields an empty record for invalid JSON or non-objects. */
export function parseJsonRecord(raw: string): UnknownRecord {
  try {
    return asRecord(JSON.parse(raw));
  } catch {
    return {};
  }
}

/** `e?.message ?? e` for a caught value of unknown shape. */
export function errorMessageOr(e: unknown): unknown {
  return (isRecord(e) ? e.message : undefined) ?? e;
}
