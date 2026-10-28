import type { DbClient } from "../../_shared/supabase-clients.ts";
import {
  evalFilter,
  likeToRegex,
  parseOrFilter,
  type Row,
} from "./fake-db-filter.ts";

/** What a list query resolves to. */
export interface FakeResult {
  data: Row[] | null;
  error: unknown;
}

/** The supabase-js builder calls the chat scope and the chat readers use. */
export interface FakeQuery extends PromiseLike<FakeResult> {
  select(columns?: string): FakeQuery;
  eq(col: string, val: unknown): FakeQuery;
  neq(col: string, val: unknown): FakeQuery;
  in(col: string, vals: unknown[]): FakeQuery;
  is(col: string, val: null): FakeQuery;
  not(col: string, op: string, val: unknown): FakeQuery;
  gte(col: string, val: string): FakeQuery;
  ilike(col: string, pattern: string): FakeQuery;
  or(value: string): FakeQuery;
  order(col: string, o?: { ascending?: boolean }): FakeQuery;
  limit(n: number): FakeQuery;
  maybeSingle(): Promise<{ data: Row | null; error: unknown }>;
  single(): Promise<{ data: Row | null; error: unknown }>;
}

export type QueryLog = { table: string; ors: string[]; calls: string[] };

/**
 * In-memory stand-in for the Supabase client, for the Deno tests of the chat
 * scope. Queries on a table listed in `errors` resolve with that error.
 */
export function fakeDb(
  tables: Record<string, Row[]>,
  rpcs: Record<string, (args: Row) => unknown> = {},
  errors: Record<string, Error> = {},
) {
  const queries: QueryLog[] = [];
  const rpcCalls: { fn: string; args: Row }[] = [];

  /** A query builder over one table. */
  function from(table: string): FakeQuery {
    const preds: ((r: Row) => boolean)[] = [];
    const log: QueryLog = { table, ors: [], calls: [] };
    queries.push(log);
    let orderBy: { col: string; asc: boolean } | null = null;
    let max: number | null = null;

    /** The table's rows that pass every filter, ordered and limited. */
    const run = (): Row[] => {
      let rows = (tables[table] ?? []).filter((r) => preds.every((p) => p(r)));
      if (orderBy) {
        const { col, asc } = orderBy;
        rows = [...rows].sort(
          (a, b) =>
            String(a[col]).localeCompare(String(b[col])) * (asc ? 1 : -1),
        );
      }

      return (max == null ? rows : rows.slice(0, max)).map((r) => ({ ...r }));
    };
    /** Records a builder call and its row predicate. */
    const add = (name: string, pred: (r: Row) => boolean) => {
      log.calls.push(name);
      preds.push(pred);
      return b;
    };
    /** maybeSingle() / single(): the first row, or the table's error. */
    const one = () =>
      Promise.resolve(
        errors[table]
          ? { data: null, error: errors[table] }
          : { data: run()[0] ?? null, error: null },
      );

    const b: FakeQuery = {
      select: () => b,
      eq: (col, val) =>
        add(`eq:${col}`, (r) => r[col] != null && r[col] === val),
      neq: (col, val) =>
        add(`neq:${col}`, (r) => r[col] != null && r[col] !== val),
      in: (col, vals) => add(`in:${col}`, (r) => vals.includes(r[col])),
      is: (col, val) =>
        add(`is:${col}`, (r) => (val === null ? r[col] == null : false)),
      not: (col, op, val) => {
        if (op !== "is" || val !== null) {
          throw new Error("unsupported not()");
        }

        return add(`not:${col}`, (r) => r[col] != null);
      },
      gte: (col, val) =>
        add(`gte:${col}`, (r) => r[col] != null && String(r[col]) >= val),
      ilike: (col, pattern) =>
        add(
          `ilike:${col}`,
          (r) => r[col] != null && likeToRegex(pattern).test(String(r[col])),
        ),
      or: (value) => {
        log.ors.push(value);
        const tree = parseOrFilter(value);
        return add("or", (r) => evalFilter(r, tree));
      },
      order: (col, o) => {
        orderBy = { col, asc: o?.ascending !== false };
        return b;
      },
      limit: (n) => {
        max = n;
        return b;
      },
      maybeSingle: one,
      single: one,
      then: (ok, fail) =>
        Promise.resolve<FakeResult>(
          errors[table]
            ? { data: null, error: errors[table] }
            : { data: run(), error: null },
        ).then(ok, fail),
    };
    return b;
  }

  /** Calls the rpc handler; a throwing handler becomes the result's error. */
  function rpc(fn: string, args: Row) {
    rpcCalls.push({ fn, args });
    const handler = rpcs[fn];
    try {
      if (!handler) {
        throw new Error(`unexpected rpc ${fn}`);
      }

      return Promise.resolve({ data: handler(args), error: null });
    } catch (error) {
      return Promise.resolve({ data: null, error });
    }
  }

  // The fake implements only the builder calls in FakeQuery; typing it as the
  // client the chat scope takes lets tests pass it where production code does.
  const db = { from, rpc } as unknown as Pick<DbClient, "from" | "rpc">;
  return { db, queries, rpcCalls };
}
