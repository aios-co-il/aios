// In-memory stand-in for the Supabase client, for node tests of chat-scope.ts.
// Supports the builder calls the chat readers use: select / eq / neq / in /
// is / not / gte / ilike / or / order / limit / maybeSingle / single, and rpc.
// or() strings are parsed with PostgREST's logic-tree grammar
// (and(...), or(...), col.[not.]op.value), so a test runs the exact filter
// string chat-scope.ts would send.

type Row = Record<string, unknown>;
type Result = { data: unknown; error: unknown };

export type FilterNode =
  | { kind: "and" | "or"; items: FilterNode[] }
  | { kind: "cond"; col: string; not: boolean; op: string; value: string };

function readValue(s: string, i: number): [string, number] {
  if (s[i] === "(") {
    const end = s.indexOf(")", i);
    return [s.slice(i, end + 1), end + 1];
  }
  let j = i;
  while (j < s.length && s[j] !== "," && s[j] !== ")") j += 1;
  return [s.slice(i, j), j];
}

function parseExpr(s: string, i: number): [FilterNode, number] {
  for (const kind of ["and", "or"] as const) {
    if (s.startsWith(`${kind}(`, i)) {
      const [items, next] = parseList(s, i + kind.length + 1);
      if (s[next] !== ")") throw new Error(`unclosed ${kind}( at ${i}: ${s}`);
      return [{ kind, items }, next + 1];
    }
  }
  const dot = s.indexOf(".", i);
  const col = s.slice(i, dot);
  let j = dot + 1;
  let not = false;
  if (s.startsWith("not.", j)) {
    not = true;
    j += 4;
  }
  const opEnd = s.indexOf(".", j);
  const op = s.slice(j, opEnd);
  const [value, next] = readValue(s, opEnd + 1);
  if (!col || !op) throw new Error(`bad condition at ${i}: ${s}`);
  return [{ kind: "cond", col, not, op, value }, next];
}

function parseList(s: string, i: number): [FilterNode[], number] {
  const items: FilterNode[] = [];
  let pos = i;
  for (;;) {
    const [node, next] = parseExpr(s, pos);
    items.push(node);
    if (s[next] === ",") pos = next + 1;
    else return [items, next];
  }
}

/** Parses the argument of supabase-js .or(): a comma list under an implicit or(). */
export function parseOrFilter(value: string): FilterNode {
  const [items, end] = parseList(value, 0);
  if (end !== value.length) throw new Error(`trailing input: ${value}`);
  return { kind: "or", items };
}

function likeToRegex(pattern: string): RegExp {
  const body = pattern
    .split(/[*%]/)
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}$`, "i");
}

/** SQL-style: comparisons with NULL are not true. */
function evalCond(row: Row, c: Extract<FilterNode, { kind: "cond" }>) {
  const v = row[c.col];
  let result: boolean;
  if (c.op === "is") result = c.value === "null" ? v == null : false;
  else if (v == null) return false;
  else if (c.op === "eq") result = String(v) === c.value;
  else if (c.op === "neq") result = String(v) !== c.value;
  else if (c.op === "in")
    result = c.value
      .slice(1, -1)
      .split(",")
      .filter(Boolean)
      .includes(String(v));
  else if (c.op === "ilike") result = likeToRegex(c.value).test(String(v));
  else throw new Error(`unsupported op ${c.op}`);
  return c.not ? !result : result;
}

export function evalFilter(row: Row, node: FilterNode): boolean {
  if (node.kind === "cond") return evalCond(row, node);
  if (node.kind === "and") return node.items.every((n) => evalFilter(row, n));
  return node.items.some((n) => evalFilter(row, n));
}

export type QueryLog = { table: string; ors: string[]; calls: string[] };

export function fakeDb(
  tables: Record<string, Row[]>,
  rpcs: Record<string, (args: Row) => unknown> = {},
) {
  const queries: QueryLog[] = [];
  const rpcCalls: { fn: string; args: Row }[] = [];

  function from(table: string) {
    const preds: ((r: Row) => boolean)[] = [];
    const log: QueryLog = { table, ors: [], calls: [] };
    queries.push(log);
    let orderBy: { col: string; asc: boolean } | null = null;
    let max: number | null = null;

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
    const add = (name: string, pred: (r: Row) => boolean) => {
      log.calls.push(name);
      preds.push(pred);
      return b;
    };
    const done = (data: unknown): Promise<Result> =>
      Promise.resolve({ data, error: null });

    const b: any = {
      select: () => b,
      eq: (col: string, val: unknown) =>
        add(`eq:${col}`, (r) => r[col] != null && r[col] === val),
      neq: (col: string, val: unknown) =>
        add(`neq:${col}`, (r) => r[col] != null && r[col] !== val),
      in: (col: string, vals: unknown[]) =>
        add(`in:${col}`, (r) => vals.includes(r[col])),
      is: (col: string, val: null) =>
        add(`is:${col}`, (r) => (val === null ? r[col] == null : false)),
      not: (col: string, op: string, val: unknown) => {
        if (op !== "is" || val !== null) throw new Error("unsupported not()");
        return add(`not:${col}`, (r) => r[col] != null);
      },
      gte: (col: string, val: string) =>
        add(`gte:${col}`, (r) => r[col] != null && String(r[col]) >= val),
      ilike: (col: string, pattern: string) =>
        add(
          `ilike:${col}`,
          (r) => r[col] != null && likeToRegex(pattern).test(String(r[col])),
        ),
      or: (value: string) => {
        log.ors.push(value);
        const tree = parseOrFilter(value);
        return add("or", (r) => evalFilter(r, tree));
      },
      order: (col: string, o?: { ascending?: boolean }) => {
        orderBy = { col, asc: o?.ascending !== false };
        return b;
      },
      limit: (n: number) => {
        max = n;
        return b;
      },
      maybeSingle: () => done(run()[0] ?? null),
      single: () => done(run()[0] ?? null),
      then: (ok: (r: Result) => unknown, fail?: (e: unknown) => unknown) =>
        done(run()).then(ok, fail),
    };
    return b;
  }

  function rpc(fn: string, args: Row) {
    rpcCalls.push({ fn, args });
    const handler = rpcs[fn];
    try {
      if (!handler) throw new Error(`unexpected rpc ${fn}`);
      return Promise.resolve({ data: handler(args), error: null });
    } catch (error) {
      return Promise.resolve({ data: null, error });
    }
  }

  return { db: { from, rpc }, queries, rpcCalls };
}
