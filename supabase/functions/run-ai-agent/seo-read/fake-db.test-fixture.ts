/**
 * An in-memory stand-in for the supabase-js reads the SEO tools make: select,
 * eq, in, order, limit, maybeSingle and await. Records each read's filters so
 * tests can assert tenant scoping.
 */
type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string } | null };

/** One read: the table and the columns it filtered on. */
export type Read = { table: string; filters: Array<string> };

/** Query builder the fake returns from `from()`. */
type Query = {
  select: (columns?: string) => Query;
  eq: (column: string, value: unknown) => Query;
  in: (column: string, values: Array<unknown>) => Query;
  order: (column: string, options?: { ascending?: boolean }) => Query;
  limit: (count: number) => Query;
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
    let sort: { column: string; ascending: boolean } | null = null;
    let max = Infinity;
    function run(): Result {
      if (failTables.includes(table)) {
        return { data: null, error: { message: `${table} read failed` } };
      }
      let matched = rows.filter((row) => filters.every((f) => f(row)));
      if (sort) {
        const { column, ascending } = sort;
        matched = matched.sort((a, b) => {
          const order = String(a[column] ?? "").localeCompare(
            String(b[column] ?? ""),
          );
          return ascending ? order : -order;
        });
      }
      return { data: matched.slice(0, max), error: null };
    }
    const api: Query = {
      select: () => api,
      eq(column, value) {
        read.filters.push(column);
        filters.push((row) => row[column] === value);
        return api;
      },
      in(column, values) {
        read.filters.push(column);
        filters.push((row) => values.includes(row[column]));
        return api;
      },
      order(column, options) {
        sort = { column, ascending: options?.ascending ?? true };
        return api;
      },
      limit(count) {
        max = count;
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

export const TENANT = "11111111-1111-4111-8111-111111111111";
export const OTHER_TENANT = "22222222-2222-4222-8222-222222222222";
export const CLIENT_ID = "33333333-3333-4333-8333-333333333333";

/** The client every test reads, on example.co.il. */
export function clientRow(overrides: Row = {}): Row {
  return {
    id: CLIENT_ID,
    name: "שיפוצי אבי",
    tenant_id: TENANT,
    website: "https://www.example.co.il/",
    ahrefs_domain: null,
    gsc_site_url: null,
    ...overrides,
  };
}

/** A caller in TENANT whose access check passes unless `deny` is given. */
export function seoCtx(deny?: Error) {
  return {
    tenantId: TENANT,
    accessibleTenantIds: [TENANT],
    assertClientAccess: () => (deny ? Promise.reject(deny) : Promise.resolve()),
    now: () => new Date("2026-11-19T10:00:00Z"),
  };
}

/** `key` of each item of a list (for asserting the order of an answer's rows). */
export function pluck(list: unknown, key: string): Array<unknown> {
  return Array.isArray(list) ? list.map((item) => item?.[key]) : [];
}
