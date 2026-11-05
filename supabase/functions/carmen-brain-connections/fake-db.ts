/**
 * In-memory service client for carmen-brain-connections tests: `from()` with
 * select / eq / neq / in / maybeSingle / insert / delete over `tables`, and
 * `rpc()` for is_super_admin and Vault keys. Inserting a second share of one
 * brain into one tenant fails like carmen_brain_key_shares_target_slug_key.
 */
import type { DbClient } from "../_shared/supabase-clients.ts";
import type { ActionContext } from "./request.ts";

export type Row = Record<string, unknown>;
export type Tables = Record<string, Array<Row>>;

type Result = {
  data: unknown;
  error: { code: string; message: string } | null;
};

export type FakeWorld = {
  tables: Tables;
  /** Users for whom is_super_admin answers true. */
  superAdmins?: Array<string>;
  /** Vault keys by connection id. */
  secrets?: Record<string, string>;
};

/** A service client over `world`; writes change `world.tables`. */
export function fakeDb(world: FakeWorld): DbClient {
  const client = {
    from: (table: string) => fakeQuery(world.tables, table),
    rpc: (fn: string, args: Record<string, string>) => {
      if (fn === "is_super_admin") {
        const admin = (world.superAdmins ?? []).includes(args._user_id);
        return Promise.resolve({ data: admin, error: null });
      }
      if (fn === "carmen_brain_secret_get") {
        const key = world.secrets?.[args.p_connection_id] ?? null;
        return Promise.resolve({ data: key, error: null });
      }
      throw new Error(`fake rpc: ${fn}`);
    },
  };
  return client as unknown as DbClient;
}

/** The action context of `userId` managing `tenantId`, with `body`. */
export function fakeCtx(
  world: FakeWorld,
  tenantId: string,
  userId: string,
  body: Record<string, unknown> = {},
): ActionContext {
  return { sb: fakeDb(world), tenantId, agentId: null, userId, body };
}

function fakeQuery(tables: Tables, table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let deleting = false;
  const rows = () => (tables[table] ??= []);
  const run = (): Result => {
    const matched = rows().filter((r) => filters.every((f) => f(r)));
    if (!deleting) {
      return { data: matched.map((r) => ({ ...r })), error: null };
    }
    tables[table] = rows().filter((r) => !matched.includes(r));
    return { data: null, error: null };
  };
  const query = {
    select: () => query,
    delete: () => {
      deleting = true;
      return query;
    },
    eq: (col: string, value: unknown) => {
      filters.push((r) => r[col] === value);
      return query;
    },
    neq: (col: string, value: unknown) => {
      filters.push((r) => r[col] !== value);
      return query;
    },
    in: (col: string, values: Array<unknown>) => {
      filters.push((r) => values.includes(r[col]));
      return query;
    },
    maybeSingle: () => {
      const { data } = run();
      return Promise.resolve({
        data: Array.isArray(data) ? (data[0] ?? null) : null,
        error: null,
      });
    },
    insert: (row: Row) => Promise.resolve(insert(rows(), table, row)),
    then: (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(run()).then(resolve, reject),
  };
  return query;
}

function insert(rows: Array<Row>, table: string, row: Row): Result {
  const duplicate =
    table === "carmen_brain_key_shares" &&
    rows.some(
      (r) =>
        r.target_tenant_id === row.target_tenant_id &&
        r.builtin_slug === row.builtin_slug,
    );
  if (duplicate) {
    return { data: null, error: { code: "23505", message: "duplicate key" } };
  }
  rows.push({ ...row });
  return { data: null, error: null };
}
