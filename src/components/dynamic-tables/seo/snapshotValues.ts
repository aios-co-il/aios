import type { JsonObject } from "@/lib/jsonReaders";

export type SnapshotValue = number | string | undefined;

/** First non-null value among `keys`; values other than numbers and strings read as undefined. */
export function getVal(obj: JsonObject, ...keys: string[]): SnapshotValue {
  for (const k of keys) {
    const value = obj[k];
    if (value === undefined || value === null) continue;
    return typeof value === "number" || typeof value === "string"
      ? value
      : undefined;
  }
  return undefined;
}
