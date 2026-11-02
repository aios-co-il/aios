/** Helpers for the rows the jobs read through PostgREST (db.select). */

/** A PostgREST `in.(...)` list of ids, each encoded. */
export const inList = (ids) => `(${ids.map(encodeURIComponent).join(",")})`;

/** A row's `meta` as an object: parsed when it arrived as JSON text, else {}. */
export const metaOf = (row) => {
  const meta = row?.meta;
  if (typeof meta === "string") {
    try {
      return JSON.parse(meta);
    } catch {
      return {};
    }
  }
  return meta && typeof meta === "object" ? meta : {};
};
