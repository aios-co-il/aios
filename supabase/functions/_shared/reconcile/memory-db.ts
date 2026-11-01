/**
 * Test helper (not imported by any edge function): an in-memory stand-in for
 * the PostgREST builder the reconcile code reads with (AIO-238). It applies the
 * filters for real (eq, neq, in, gt, gte, lt, lte, `is null`, `not is null`,
 * simple `or` lists), ordering and paging over plain rows, so scoping tests
 * check which rows come back rather than which calls were made. Embedded
 * selects such as `clients(name)` are read from the row as stored.
 */
import { asRecord } from "./json.ts";

type Row = Record<string, unknown>;

type Filter = (row: Row) => boolean;

type Result<T> =
  { data: T; error: null } | { data: null; error: { message: string } };

type Builder = {
  select: (columns?: string) => Builder;
  eq: (column: string, value: unknown) => Builder;
  neq: (column: string, value: unknown) => Builder;
  in: (column: string, values: unknown[]) => Builder;
  gt: (column: string, value: string) => Builder;
  gte: (column: string, value: string) => Builder;
  lt: (column: string, value: string) => Builder;
  lte: (column: string, value: string) => Builder;
  is: (column: string, value: null) => Builder;
  not: (column: string, op: string, value: unknown) => Builder;
  or: (expr: string) => Builder;
  order: (column: string, opts?: { ascending?: boolean }) => Builder;
  limit: (n: number) => Builder;
  range: (from: number, to: number) => Builder;
  maybeSingle: () => Promise<Result<Row | null>>;
  then: <T>(
    resolve: (value: Result<Row[]>) => T,
    reject?: (error: unknown) => T,
  ) => Promise<T>;
};

/**
 * A client whose `from(table)` reads `tables[table]`; `queries` lists the
 * filters each query used. Every query of a table named in `failing` returns
 * `{ data: null, error }` with that message, for error-path tests.
 */
export function memoryDb(
  tables: Record<string, Row[]>,
  failing: Record<string, string> = {},
) {
  const queries: Array<{ table: string; filters: string[] }> = [];
  return {
    queries,
    from(table: string): Builder {
      return tableQuery(
        tables[table] || [],
        (filters) => queries.push({ table, filters }),
        failing[table],
      );
    },
  };
}

/** A builder over `source` that reports its filter labels through `record`. */
function tableQuery(
  source: Row[],
  record: (filters: string[]) => void,
  errorMessage?: string,
): Builder {
  const filters: Filter[] = [];
  const described: string[] = [];
  let sort: { column: string; ascending: boolean } | null = null;
  let limit: number | null = null;
  let range: [number, number] | null = null;
  record(described);

  const rows = () => {
    let out = source.filter((r) => filters.every((f) => f(r)));
    if (sort) {
      const { column, ascending } = sort;
      out = [...out].sort((a, b) => {
        const x = String(read(a, column) ?? "");
        const y = String(read(b, column) ?? "");
        return ascending ? x.localeCompare(y) : y.localeCompare(x);
      });
    }
    if (range) {
      out = out.slice(range[0], range[1] + 1);
    }
    if (limit !== null) {
      out = out.slice(0, limit);
    }
    return out;
  };
  const result = <T>(data: () => T): Result<T> =>
    errorMessage === undefined
      ? { data: data(), error: null }
      : { data: null, error: { message: errorMessage } };
  const add = (label: string, f: Filter) => {
    described.push(label);
    filters.push(f);
    return builder;
  };
  const builder: Builder = {
    select: () => builder,
    eq: (c, v) => add(`eq ${c}`, (r) => read(r, c) === v),
    neq: (c, v) => add(`neq ${c}`, (r) => read(r, c) !== v),
    in: (c, vs) => add(`in ${c}`, (r) => vs.includes(read(r, c))),
    gt: (c, v) => add(`gt ${c}`, (r) => String(read(r, c)) > v),
    gte: (c, v) => add(`gte ${c}`, (r) => String(read(r, c)) >= v),
    lt: (c, v) => add(`lt ${c}`, (r) => String(read(r, c)) < v),
    lte: (c, v) => add(`lte ${c}`, (r) => String(read(r, c)) <= v),
    is: (c) => add(`is ${c} null`, (r) => read(r, c) == null),
    not: (c, op, v) => {
      if (op !== "is" || v !== null) {
        throw new Error(`memory db: unsupported not ${op}`);
      }
      return add(`not ${c} is null`, (r) => read(r, c) != null);
    },
    or: (expr) => {
      const terms = expr.split(",").map(orTerm);
      return add(`or ${expr}`, (r) => terms.some((t) => t(r)));
    },
    order: (column, opts) => {
      sort = { column, ascending: opts?.ascending !== false };
      return builder;
    },
    limit: (n) => {
      limit = n;
      return builder;
    },
    range: (from, to) => {
      range = [from, to];
      return builder;
    },
    maybeSingle: () => Promise.resolve(result(() => rows()[0] ?? null)),
    then: (resolve, reject) =>
      Promise.resolve(result(rows)).then(resolve, reject),
  };
  return builder;
}

/** A column, or a `data->>key` JSON text path. */
function read(row: Row, column: string): unknown {
  const [col, key] = column.split("->>");
  if (key === undefined) {
    return row[col];
  }
  const value = asRecord(row[col])[key];
  return value == null ? null : String(value);
}

/** One `or` term such as `user_id.is.null` or `connection_visibility.eq.org`. */
function orTerm(term: string): Filter {
  const [column, op, ...rest] = term.split(".");
  const value = rest.join(".");
  if (op === "is" && value === "null") {
    return (r) => read(r, column) == null;
  }
  if (op === "eq") {
    return (r) => String(read(r, column)) === value;
  }
  throw new Error(`memory db: unsupported or term ${term}`);
}
