/**
 * An in-memory stand-in for the supabase-js query builder, for tests of the
 * pulse-target tools: only the calls they make.
 */

type Row = Record<string, unknown>;
type Op = "select" | "update" | "insert";
type Result = { data: unknown; error: { message: string } | null };
type Write = { table: string; op: Op; rows: Row[]; filters: string[] };

/** The chainable query the fake returns from `from()`. */
type Query = {
  select: (columns?: string) => Query;
  order: () => Query;
  limit: () => Query;
  eq: (column: string, value: unknown) => Query;
  in: (column: string, values: unknown[]) => Query;
  not: (column: string) => Query;
  update: (patch: Row) => Query;
  insert: (row: Row) => Query;
  maybeSingle: () => Promise<Result>;
  single: () => Promise<Result>;
  then: (
    resolve: (result: Result) => unknown,
    reject?: (error: unknown) => unknown,
  ) => Promise<unknown>;
};

/**
 * One table operation the fake answers with a database error or, with
 * `noMatch`, with success and no row (an update of a row deleted since it was
 * read, or one RLS hides).
 */
export type FailOn = { table: string; op: Op; noMatch?: boolean };

/**
 * crm_tables, snapshots, clients and the approval queue in memory. Updates and
 * inserts are applied and recorded with the columns they filtered on.
 */
export function fakeDb(seed: Record<string, Row[]>, failOn?: FailOn) {
  const tables: Record<string, Row[]> = structuredClone(seed);
  const writes: Write[] = [];
  let nextId = 1;
  function from(name: string): Query {
    tables[name] ??= [];
    const filters: Array<(row: Row) => boolean> = [];
    const filtered: string[] = [];
    let op: Op = "select";
    let payload: Row = {};
    let returning = false;
    const run = (): Result => {
      if (failOn?.table === name && failOn.op === op) {
        if (!failOn.noMatch) {
          // supabase-js reports a database error as an Error (PostgrestError).
          return { data: null, error: new Error(`${name} ${op} failed`) };
        }
        filters.push(() => false);
      }
      if (op === "insert") {
        const row = { id: `row-${nextId++}`, ...payload };
        tables[name].push(row);
        writes.push({ table: name, op, rows: [row], filters: filtered });
        return { data: [row], error: null };
      }
      const matched = tables[name].filter((row) =>
        filters.every((f) => f(row)),
      );
      if (op === "update") {
        for (const row of matched) {
          Object.assign(row, structuredClone(payload));
        }
        writes.push({ table: name, op, rows: matched, filters: filtered });
        // supabase-js returns the updated rows only when .select() asks for them.
        return { data: returning ? matched : null, error: null };
      }
      return { data: matched, error: null };
    };
    const first = (): Result => {
      const result = run();
      const rows = Array.isArray(result.data) ? result.data : [];
      return { data: rows[0] ?? null, error: result.error };
    };
    const api: Query = {
      select() {
        returning = op !== "select";
        return api;
      },
      order: () => api,
      limit: () => api,
      eq(column, value) {
        filtered.push(column);
        filters.push((row) => row[column] === value);
        return api;
      },
      in(column, values) {
        filtered.push(column);
        filters.push((row) => values.includes(row[column]));
        return api;
      },
      not(column) {
        filters.push(
          (row) => row[column] !== null && row[column] !== undefined,
        );
        return api;
      },
      update(patch) {
        op = "update";
        payload = patch;
        return api;
      },
      insert(row) {
        op = "insert";
        payload = row;
        return api;
      },
      maybeSingle: () => Promise.resolve(first()),
      single: () => Promise.resolve(first()),
      then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
    };
    return api;
  }
  return { from, tables, writes };
}

/** The fake's state, as returned by fakeDb. */
export type FakeDb = ReturnType<typeof fakeDb>;
