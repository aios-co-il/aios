/**
 * Test-only, in-memory stand-in for the PostgREST builder the reconcile code
 * uses (AIO-238). It applies the filters for real (eq, neq, in, gt, gte, lt,
 * lte, `not is null`, simple `or` lists), ordering and paging over plain rows,
 * so scoping tests check which rows come back rather than which calls were made.
 * Embedded selects such as `clients(name)` are read from the row as stored.
 * Not used by any edge function.
 */

type Row = Record<string, any>;
type Filter = (row: Row) => boolean;

/** A column, or a `data->>key` JSON text path. */
function read(row: Row, column: string): unknown {
  const [col, key] = column.split("->>");
  if (key === undefined) return row[col];
  const value = row[col]?.[key];
  return value == null ? null : String(value);
}

/** One `or` term such as `user_id.is.null` or `connection_visibility.eq.org`. */
function orTerm(term: string): Filter {
  const [column, op, ...rest] = term.split(".");
  const value = rest.join(".");
  if (op === "is" && value === "null") return (r) => read(r, column) == null;
  if (op === "eq") return (r) => String(read(r, column)) === value;
  throw new Error(`memory db: unsupported or term ${term}`);
}

export function memoryDb(tables: Record<string, Row[]>) {
  const queries: Array<{ table: string; filters: string[] }> = [];
  const db = {
    queries,
    from(table: string) {
      const filters: Filter[] = [];
      const described: string[] = [];
      let sort: { column: string; ascending: boolean } | null = null;
      let limit: number | null = null;
      let range: [number, number] | null = null;
      queries.push({ table, filters: described });

      const rows = () => {
        let out = (tables[table] || []).filter((r) =>
          filters.every((f) => f(r)),
        );
        if (sort) {
          const { column, ascending } = sort;
          out = [...out].sort((a, b) => {
            const x = String(read(a, column) ?? "");
            const y = String(read(b, column) ?? "");
            return ascending ? x.localeCompare(y) : y.localeCompare(x);
          });
        }
        if (range) out = out.slice(range[0], range[1] + 1);
        if (limit !== null) out = out.slice(0, limit);
        return out;
      };
      const add = (label: string, f: Filter) => {
        described.push(label);
        filters.push(f);
        return builder;
      };
      const builder: Record<string, any> = {
        select: () => builder,
        eq: (c: string, v: unknown) => add(`eq ${c}`, (r) => read(r, c) === v),
        neq: (c: string, v: unknown) =>
          add(`neq ${c}`, (r) => read(r, c) !== v),
        in: (c: string, vs: unknown[]) =>
          add(`in ${c}`, (r) => vs.includes(read(r, c))),
        gt: (c: string, v: string) =>
          add(`gt ${c}`, (r) => String(read(r, c)) > v),
        gte: (c: string, v: string) =>
          add(`gte ${c}`, (r) => String(read(r, c)) >= v),
        lt: (c: string, v: string) =>
          add(`lt ${c}`, (r) => String(read(r, c)) < v),
        lte: (c: string, v: string) =>
          add(`lte ${c}`, (r) => String(read(r, c)) <= v),
        not: (c: string, op: string, v: unknown) => {
          if (op !== "is" || v !== null)
            throw new Error(`memory db: unsupported not ${op}`);
          return add(`not ${c} is null`, (r) => read(r, c) != null);
        },
        or: (expr: string) => {
          const terms = expr.split(",").map(orTerm);
          return add(`or ${expr}`, (r) => terms.some((t) => t(r)));
        },
        order: (column: string, opts?: { ascending?: boolean }) => {
          sort = { column, ascending: opts?.ascending !== false };
          return builder;
        },
        limit: (n: number) => {
          limit = n;
          return builder;
        },
        range: (from: number, to: number) => {
          range = [from, to];
          return builder;
        },
        maybeSingle: () =>
          Promise.resolve({ data: rows()[0] ?? null, error: null }),
        then: (
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown,
        ) =>
          Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
      };
      return builder;
    },
  };
  return db;
}
