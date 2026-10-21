// In-memory stand-in for the Supabase client, for node tests of the
// broadcast modules. Supports the builder calls they use: select / eq / in /
// is / not / order / range / limit / maybeSingle / single, update / insert /
// delete, and rpc (with .range and .single). Writes are recorded, not applied.

type Row = Record<string, unknown>;
type Filter = { kind: "eq" | "in" | "is"; col: string; val: unknown };
type Result = { data: unknown; error: null };

export type Write = {
  table: string;
  op: "update" | "insert" | "delete";
  values: unknown;
  filters: Filter[];
};

const passes = (row: Row, f: Filter) => {
  if (f.kind === "eq") return row[f.col] === f.val;
  if (f.kind === "is") return (row[f.col] ?? null) === f.val;
  return Array.isArray(f.val) && f.val.includes(row[f.col]);
};

const done = (data: unknown): Promise<Result> =>
  Promise.resolve({ data, error: null });

const first = (data: unknown) =>
  Array.isArray(data) ? (data[0] ?? null) : data;

export function fakeDb(
  tables: Record<string, Row[]>,
  rpcs: Record<string, (args: Row) => unknown> = {},
) {
  const writes: Write[] = [];
  const rpcCalls: { fn: string; args: Row }[] = [];

  function from(table: string) {
    let op: "select" | Write["op"] = "select";
    let values: unknown = null;
    const filters: Filter[] = [];
    let orderBy: { col: string; asc: boolean } | null = null;
    let span: [number, number] | null = null;

    const run = (): unknown => {
      if (op !== "select") {
        writes.push({ table, op, values, filters });
        return null;
      }
      let rows = (tables[table] ?? []).filter((r) =>
        filters.every((f) => passes(r, f)),
      );
      if (orderBy) {
        const { col, asc } = orderBy;
        rows = [...rows].sort(
          (a, b) =>
            String(a[col]).localeCompare(String(b[col])) * (asc ? 1 : -1),
        );
      }
      return span ? rows.slice(span[0], span[1] + 1) : rows;
    };

    const filter = (kind: Filter["kind"]) => (col: string, val: unknown) => {
      filters.push({ kind, col, val });
      return b;
    };
    const write =
      (next: Write["op"]) =>
      (v: unknown = null) => {
        op = next;
        values = v;
        return b;
      };
    const b = {
      select: () => b,
      not: () => b,
      eq: filter("eq"),
      in: filter("in"),
      is: filter("is"),
      order: (col: string, o?: { ascending?: boolean }) => {
        orderBy = { col, asc: o?.ascending !== false };
        return b;
      },
      range: (a: number, z: number) => {
        span = [a, z];
        return b;
      },
      limit: (n: number) => {
        span = [0, n - 1];
        return b;
      },
      update: write("update"),
      insert: write("insert"),
      delete: write("delete"),
      maybeSingle: () => done(first(run())),
      single: () => done(first(run())),
      then: (ok: (r: Result) => unknown, fail?: (e: unknown) => unknown) =>
        done(run()).then(ok, fail),
    };
    return b;
  }

  function rpc(fn: string, args: Row) {
    rpcCalls.push({ fn, args });
    const handler = rpcs[fn];
    if (!handler) throw new Error(`unexpected rpc ${fn}`);
    const value = handler(args);
    return {
      range: (a: number, z: number) =>
        done(Array.isArray(value) ? value.slice(a, z + 1) : value),
      single: () => done(first(value)),
      then: (ok: (r: Result) => unknown, fail?: (e: unknown) => unknown) =>
        done(value).then(ok, fail),
    };
  }

  return { db: { from, rpc }, writes, rpcCalls };
}
