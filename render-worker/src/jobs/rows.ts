/** Helpers for the rows the jobs read through PostgREST (db.select). */
import { objectOf } from "../providers/json.ts";
import type { RowMeta } from "./types.ts";

/** A PostgREST `in.(...)` list of ids, each encoded. */
export const inList = (ids: Array<string>) =>
  `(${ids.map(encodeURIComponent).join(",")})`;

/**
 * The rows of a PostgREST answer (db.select, or an rpc returning a set), [] when there are none.
 * `Row` names the columns the caller selected; their values are not checked (types.ts).
 */
export function rowsOf<Row>(answer: unknown): Array<Row> {
  return Array.isArray(answer) ? answer : [];
}

/** A row's `meta` as an object: parsed when it arrived as JSON text, else {}. */
export const metaOf = (row: { meta?: unknown } | null | undefined): RowMeta => {
  const meta = row?.meta;
  if (typeof meta === "string") {
    try {
      const parsed: RowMeta = JSON.parse(meta);
      return parsed;
    } catch {
      return {};
    }
  }
  return meta && typeof meta === "object" ? objectOf<RowMeta>(meta) : {};
};
