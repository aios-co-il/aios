/**
 * Minimal in-memory stand-in for the supabase-js query builder, for Deno tests.
 * Supports select/insert with eq, neq, in, order, limit, maybeSingle, single
 * and await. Every query is recorded in `queries` so tests can assert what
 * was asked (for example, which integration types were requested).
 * A plain column list in select() is honoured: rows come back with only those
 * columns, so code that forgets to select a column it reads fails its test.
 * Its type does not yet satisfy Pick<DbClient, …> under deno check, which CI
 * skips (--no-check); typing the fakes is AIO-34.
 */

type Row = Record<string, unknown>;

type Filter = ["eq" | "neq" | "in", string, unknown];

type FakeError = { message: string };

type Result = { data: unknown; error: FakeError | null };

/** One recorded from(table) call and what it asked for. */
export type FakeQuery = {
  table: string;
  columns?: string;
  filters: Filter[];
  order: { col: string; asc: boolean } | null;
  limit: number | null;
};

export type FakeSupabaseOptions = {
  rpc?: Record<string, (args: Row) => unknown>;
  /** Access token → user id that auth.getUser accepts. */
  users?: Record<string, string>;
  /** Table or rpc name → the error message every call to it returns. */
  failing?: Record<string, string>;
};

/** An in-memory client over `tables`, recording queries and inserts. */
export function fakeSupabase(
  tables: Record<string, Row[]> = {},
  { rpc = {}, users = {}, failing = {} }: FakeSupabaseOptions = {},
) {
  const queries: FakeQuery[] = [];
  const inserts: { table: string; rows: Row[] }[] = [];
  const errorOf = (name: string): FakeError | null =>
    failing[name] ? { message: failing[name] } : null;
  const answer = (table: string, data: unknown): Promise<Result> => {
    const error = errorOf(table);
    return Promise.resolve(error ? { data: null, error } : { data, error });
  };

  function from(table: string) {
    const q: FakeQuery = { table, filters: [], order: null, limit: null };
    queries.push(q);
    const rows = () => selectRows(tables[table] || [], q);
    const builder = {
      select(columns: string) {
        q.columns = columns;
        return builder;
      },
      insert(payload: Row | Row[]) {
        const list = Array.isArray(payload) ? payload : [payload];
        inserts.push({ table, rows: list });
        if (!errorOf(table)) {
          (tables[table] ||= []).push(...list);
        }
        return answer(table, null);
      },
      eq: (col: string, val: unknown) => filter(["eq", col, val]),
      neq: (col: string, val: unknown) => filter(["neq", col, val]),
      in: (col: string, vals: unknown[]) => filter(["in", col, vals]),
      order(col: string, opts: { ascending?: boolean } = {}) {
        q.order = { col, asc: opts.ascending !== false };
        return builder;
      },
      limit(n: number) {
        q.limit = n;
        return builder;
      },
      maybeSingle: () => answer(table, rows()[0] ?? null),
      single: () => answer(table, rows()[0] ?? null),
      then<T>(resolve: (r: Result) => T, reject?: (e: unknown) => T) {
        return answer(table, rows()).then(resolve, reject);
      },
    };
    const filter = (f: Filter) => (q.filters.push(f), builder);
    return builder;
  }

  return {
    from,
    queries,
    inserts,
    rpc(name: string, args: Row) {
      const fn = rpc[name];
      return answer(name, fn ? fn(args) : null);
    },
    auth: {
      getUser(token: string) {
        const id = users[token];
        return Promise.resolve(
          id
            ? { data: { user: { id } }, error: null }
            : { data: { user: null }, error: { message: "invalid token" } },
        );
      },
    },
  };
}

/** The rows a recorded query matches, ordered, limited and projected. */
function selectRows(source: Row[], q: FakeQuery): Row[] {
  let out = source.filter((row) => q.filters.every((f) => passes(row, f)));
  if (q.order) {
    const { col, asc } = q.order;
    out = [...out].sort((a, b) => compare(a[col], b[col]) * (asc ? 1 : -1));
  }
  if (q.limit != null) {
    out = out.slice(0, q.limit);
  }
  return out.map((row) => project(row, q.columns));
}

/** Whether a row passes one eq / neq / in filter. */
function passes(row: Row, [op, col, val]: Filter): boolean {
  if (op === "eq") {
    return row[col] === val;
  }
  if (op === "neq") {
    return row[col] !== val;
  }
  return Array.isArray(val) && val.includes(row[col]);
}

/** Orders values the way the fake sorts them: missing as "", then < / >. */
function compare(a: unknown, b: unknown): number {
  const x = String(a ?? "");
  const y = String(b ?? "");
  if (x === y) {
    return 0;
  }
  return x < y ? -1 : 1;
}

/** Only the selected columns of a plain column list; anything else as is. */
function project(row: Row, cols: string | undefined): Row {
  if (typeof cols !== "string" || cols.trim() === "*" || /[()]/.test(cols)) {
    return row;
  }
  const picked: Row = {};
  for (const col of cols.split(",").map((c) => c.trim())) {
    if (col && col in row) {
      picked[col] = row[col];
    }
  }
  return picked;
}
