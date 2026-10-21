// PostgREST paging helpers (and small value helpers) for audience queries.

const PAGE = 1000;
const IN_CHUNK = 200;

type Result<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/** A query builder that can be paged with `.range()`. */
export type Pageable<T> = { range(from: number, to: number): Result<T> };

/** Page through a PostgREST query builder factory (default max_rows is 1000). */
export async function fetchAll<T>(build: () => Pageable<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Run `query` over de-duplicated ids in chunks small enough for `.in()`. */
export async function fetchByIds<T>(
  ids: (string | null | undefined)[],
  query: (chunk: string[]) => Result<T>,
): Promise<T[]> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  const out: T[] = [];
  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    const { data, error } = await query(unique.slice(i, i + IN_CHUNK));
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

export const hasItems = (a: unknown): a is string[] =>
  Array.isArray(a) && a.length > 0;

export function flatObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

/** Today's date (UTC) as YYYY-MM-DD, for client_team end_date checks. */
export const todayIso = () => new Date().toISOString().slice(0, 10);
