/**
 * A fetch that serves Supabase's REST, RPC and auth endpoints from memory, so
 * a test can run an edge function's real handler, supabase-js included.
 *
 * - GET /rest/v1/<table>: the rows matching its eq./neq./is./in./lt./lte./
 *   gt./gte. filters, each optionally negated with not., limited. Any other
 *   operator throws, so a test cannot pass on a filter the fake ignores.
 * - POST, PATCH, DELETE /rest/v1/<table>: recorded in `calls`, answered empty.
 * - POST /rest/v1/rpc/<fn>: rpc[fn](args).
 * - GET /auth/v1/user: the user `users` maps the bearer token to, else 401.
 * - `failing[table or fn]`: that call answers a PostgREST error.
 * - Any other URL goes to `other` (404 when unset).
 */

type Row = Record<string, unknown>;

/** One request the fake received. */
export type HttpCall = { method: string; url: URL; body: unknown };

export type FakeSupabaseHttpOptions = {
  supabaseUrl: string;
  tables?: Record<string, Row[]>;
  rpc?: Record<string, (args: Row) => unknown>;
  users?: Record<string, string>;
  failing?: Record<string, string>;
  other?: (url: URL, body: unknown) => Response;
};

const CONTROL_PARAMS = ["select", "order", "limit", "offset", "columns"];

/** The fake fetch and every request it received. */
export function fakeSupabaseHttp(opts: FakeSupabaseHttpOptions) {
  const calls: HttpCall[] = [];
  const tables = opts.tables ?? {};
  const impl = async (
    input: string | URL | Request,
    init: RequestInit = {},
  ): Promise<Response> => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const text = await request.text();
    const body: unknown = text ? JSON.parse(text) : null;
    calls.push({ method: request.method, url, body });
    if (!request.url.startsWith(opts.supabaseUrl)) {
      return opts.other?.(url, body) ?? json({ error: "unexpected" }, 404);
    }
    if (url.pathname === "/auth/v1/user") {
      const token = (request.headers.get("authorization") ?? "").slice(7);
      const id = opts.users?.[token];
      return id
        ? json({ id, aud: "authenticated" })
        : json({ msg: "bad jwt" }, 401);
    }
    const name = url.pathname.replace(/^\/rest\/v1\/(rpc\/)?/, "");
    if (opts.failing?.[name]) {
      return json({ message: opts.failing[name], code: "XX000" }, 400);
    }
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      return json(opts.rpc?.[name]?.(isRow(body) ? body : {}) ?? null);
    }
    if (request.method !== "GET") {
      return new Response(null, {
        status: request.method === "POST" ? 201 : 204,
      });
    }
    return json(selectRows(tables[name] ?? [], url.searchParams));
  };
  return { fetch: impl, calls };
}

/** Rows matching every filter param, cut to `limit`. */
function selectRows(rows: Row[], params: URLSearchParams): Row[] {
  const filters = [...params].filter(([key]) => !CONTROL_PARAMS.includes(key));
  const out = rows.filter((row) =>
    filters.every(([col, expr]) => matches(row[col], expr)),
  );
  const limit = Number(params.get("limit"));
  return limit > 0 ? out.slice(0, limit) : out;
}

/** The PostgREST operators the fake models, by name. */
const OPERATORS: Record<string, (value: unknown, arg: string) => boolean> = {
  eq: (value, arg) => String(value) === arg,
  neq: (value, arg) => String(value) !== arg,
  is: (value, arg) => (arg === "null" ? value == null : String(value) === arg),
  in: (value, arg) =>
    arg
      .replace(/^\(|\)$/g, "")
      .split(",")
      .includes(String(value)),
  lt: (value, arg) => value != null && compare(value, arg) < 0,
  lte: (value, arg) => value != null && compare(value, arg) <= 0,
  gt: (value, arg) => value != null && compare(value, arg) > 0,
  gte: (value, arg) => value != null && compare(value, arg) >= 0,
};

/** Whether a value passes one PostgREST filter expression; an operator the fake does not model throws. */
function matches(value: unknown, expr: string): boolean {
  if (expr.startsWith("not.")) {
    return !matches(value, expr.slice(4));
  }
  const dot = expr.indexOf(".");
  const op = OPERATORS[expr.slice(0, dot)];
  if (!op) {
    throw new Error(`fake-supabase-http: unsupported filter "${expr}"`);
  }
  return op(value, expr.slice(dot + 1));
}

/** Orders a column value against a filter argument: as numbers when both are, else as text. */
function compare(value: unknown, arg: string): number {
  const x = String(value);
  if (x !== "" && arg !== "" && !isNaN(Number(x)) && !isNaN(Number(arg))) {
    return Number(x) - Number(arg);
  }
  if (x === arg) {
    return 0;
  }
  return x < arg ? -1 : 1;
}

/** Whether a parsed body is a plain object. */
function isRow(value: unknown): value is Row {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** A JSON response. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
