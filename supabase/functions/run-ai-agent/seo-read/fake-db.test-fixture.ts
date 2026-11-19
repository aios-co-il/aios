/**
 * An in-memory stand-in for the supabase-js reads the SEO tools make: select
 * (with `alias:column->key` JSON paths and head counts), eq, neq, in, gte, lt,
 * order, limit, range, maybeSingle and await. Records each read's filters so
 * tests can assert tenant scoping.
 */
export * from "./seo-fixtures.test-fixture.ts";

type Row = Record<string, unknown>;
type Result = {
  data: unknown;
  count?: number | null;
  error: { message: string } | null;
};

/** One read: the table and the columns it filtered on. */
export type Read = { table: string; filters: Array<string> };

/** Query builder the fake returns from `from()`. */
type Query = {
  select: (
    columns?: string,
    options?: { count?: string; head?: boolean },
  ) => Query;
  eq: (column: string, value: unknown) => Query;
  neq: (column: string, value: unknown) => Query;
  in: (column: string, values: Array<unknown>) => Query;
  gte: (column: string, value: string) => Query;
  lt: (column: string, value: string) => Query;
  order: (column: string, options?: { ascending?: boolean }) => Query;
  limit: (count: number) => Query;
  range: (from: number, to: number) => Query;
  maybeSingle: () => Promise<Result>;
  then: (
    resolve: (result: Result) => unknown,
    reject?: (error: unknown) => unknown,
  ) => Promise<unknown>;
};

/** Tables in memory; reads of a table in `failTables` return a database error. */
export function fakeSeoDb(
  seed: Record<string, Array<Row>>,
  failTables: Array<string> = [],
) {
  const reads: Array<Read> = [];
  function from(table: string): Query {
    const rows = structuredClone(seed[table] ?? []);
    const filters: Array<(row: Row) => boolean> = [];
    const read: Read = { table, filters: [] };
    reads.push(read);
    const sorts: Array<{ column: string; ascending: boolean }> = [];
    let window = { from: 0, to: Infinity };
    let paths: Array<[string, Array<string>]> = [];
    let head = false;
    let counted = false;
    function filter(column: string, test: (value: unknown) => boolean) {
      read.filters.push(column);
      filters.push((row) => test(row[column]));
      return api;
    }
    function run(): Result {
      if (failTables.includes(table)) {
        return { data: null, error: { message: `${table} read failed` } };
      }
      const matched = rows.filter((row) => filters.every((f) => f(row)));
      for (const { column, ascending } of [...sorts].reverse()) {
        matched.sort((a, b) => {
          const order = String(a[column] ?? "").localeCompare(
            String(b[column] ?? ""),
          );
          return ascending ? order : -order;
        });
      }
      const page = matched
        .slice(window.from, window.to + 1)
        .map((row) => withPaths(row, paths));
      return {
        data: head ? null : page,
        count: counted ? matched.length : null,
        error: null,
      };
    }
    const api: Query = {
      select(columns = "*", options) {
        paths = jsonPaths(columns);
        head = options?.head === true;
        counted = !!options?.count;
        return api;
      },
      eq: (column, value) => filter(column, (v) => v === value),
      neq: (column, value) => filter(column, (v) => v !== value),
      in: (column, values) => filter(column, (v) => values.includes(v)),
      gte: (column, value) => filter(column, (v) => String(v ?? "") >= value),
      lt: (column, value) => filter(column, (v) => String(v ?? "") < value),
      order(column, options) {
        sorts.push({ column, ascending: options?.ascending ?? true });
        return api;
      },
      limit(count) {
        window = { from: window.from, to: window.from + count - 1 };
        return api;
      },
      range(start, end) {
        window = { from: start, to: end };
        return api;
      },
      maybeSingle() {
        const result = run();
        const list = Array.isArray(result.data) ? result.data : [];
        return Promise.resolve({ data: list[0] ?? null, error: result.error });
      },
      then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
    };
    return api;
  }
  return { from, reads };
}

/** The `alias:column->key->key` entries of a select list. */
function jsonPaths(columns: string): Array<[string, Array<string>]> {
  return columns.split(",").flatMap((part) => {
    const match = part.trim().match(/^(\w+):(.+)$/);
    return match ? [[match[1], match[2].split(/->>?/)]] : [];
  });
}

/** The row with each JSON-path alias filled in, as PostgREST returns it. */
function withPaths(row: Row, paths: Array<[string, Array<string>]>): Row {
  const out: Row = { ...row };
  for (const [alias, [column, ...keys]] of paths) {
    let value: unknown = row[column];
    for (const key of keys) {
      value =
        value && typeof value === "object"
          ? ((value as Row)[key] ?? null)
          : null;
    }
    out[alias] = value ?? null;
  }
  return out;
}
