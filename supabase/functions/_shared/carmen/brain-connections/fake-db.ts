/**
 * A real supabase-js client over in-memory tables, for brain-connection
 * tests. Its fetch answers the PostgREST calls those modules make: select with
 * eq / neq / in filters (maybeSingle included), insert and delete, and the
 * RPCs get_user_tenant_id and carmen_brain_secret_get. A second share of one
 * brain into one tenant fails like carmen_brain_key_shares_target_slug_key.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Database } from "../../database.types.ts";
import type { DbClient } from "../../supabase-clients.ts";

export type Row = Record<string, unknown>;

export type FakeWorld = {
  tables: Record<string, Array<Row>>;
  /** Each user's acting tenant, as get_user_tenant_id answers it. */
  acting?: Record<string, string>;
  /** Vault keys by connection id. */
  secrets?: Record<string, string>;
};

// Query parameters that are not row filters.
const NOT_FILTERS = new Set(["select", "order", "limit", "offset", "columns"]);

/** A client whose requests read and change `world`. */
export function fakeDb(world: FakeWorld): DbClient {
  return createClient<Database>("http://fake.supabase.local", "fake-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => answer(world, new Request(input, init)) },
  });
}

/** The PostgREST response to one request. */
async function answer(world: FakeWorld, req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/rest\/v1\//, "");
  if (path.startsWith("rpc/")) {
    return json(rpc(world, path.slice(4), await objectBody(req)));
  }
  const rows = (world.tables[path] ??= []);
  const matches = rowFilter(url.searchParams);
  if (req.method === "GET") {
    const select = url.searchParams.get("select") ?? "*";
    return json(rows.filter(matches).map((r) => project(r, select)));
  }
  if (req.method === "DELETE") {
    world.tables[path] = rows.filter((r) => !matches(r));
    return new Response(null, { status: 204 });
  }
  if (req.method === "POST") {
    return insert(rows, path, await req.json());
  }
  throw new Error(`fake db: ${req.method} ${path}`);
}

/** The RPCs these modules call, answered from `world`. */
function rpc(world: FakeWorld, fn: string, args: Row): unknown {
  if (fn === "get_user_tenant_id") {
    return world.acting?.[String(args._user_id)] ?? null;
  }
  if (fn === "carmen_brain_secret_get") {
    return world.secrets?.[String(args.p_connection_id)] ?? null;
  }
  throw new Error(`fake db: rpc ${fn}`);
}

/** Rows matching every eq / neq / in filter of the query string. */
function rowFilter(params: URLSearchParams): (row: Row) => boolean {
  const tests = [...params]
    .filter(([column]) => !NOT_FILTERS.has(column))
    .map(([column, expr]) => columnTest(column, expr));
  return (row) => tests.every((t) => t(row));
}

/** One PostgREST filter (`eq.x`, `neq.x`, `in.(a,b)`) on a column. */
function columnTest(column: string, expr: string): (row: Row) => boolean {
  const dot = expr.indexOf(".");
  const op = expr.slice(0, dot);
  const value = expr.slice(dot + 1);
  const cell = (row: Row) => (row[column] == null ? null : String(row[column]));
  if (op === "eq") {
    return (row) => cell(row) === value;
  }
  if (op === "neq") {
    return (row) => cell(row) !== value;
  }
  if (op === "in") {
    const list = value
      .slice(1, -1)
      .split(",")
      .map((v) => v.replace(/^"|"$/g, ""));
    return (row) => list.includes(cell(row) ?? "");
  }
  throw new Error(`fake db: filter ${expr}`);
}

/** The selected columns of a row ("*" keeps them all). */
function project(row: Row, select: string): Row {
  if (select === "*") {
    return { ...row };
  }
  return Object.fromEntries(select.split(",").map((c) => [c, row[c] ?? null]));
}

/** Appends the body's rows; a duplicate share answers like Postgres. */
function insert(rows: Array<Row>, table: string, body: unknown): Response {
  const incoming = (Array.isArray(body) ? body : [body]).filter(isRow);
  for (const row of incoming) {
    const duplicate =
      table === "carmen_brain_key_shares" &&
      rows.some(
        (r) =>
          r.target_tenant_id === row.target_tenant_id &&
          r.builtin_slug === row.builtin_slug,
      );
    if (duplicate) {
      return json({ code: "23505", message: "duplicate key value" }, 409);
    }
    rows.push({ ...row });
  }
  return new Response(null, { status: 201 });
}

/** The request's JSON body when it is an object, else {}. */
async function objectBody(req: Request): Promise<Row> {
  const body: unknown = await req.json();
  return isRow(body) ? body : {};
}

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
