import type { DbClient } from "../_shared/supabase-clients.ts";

/** One recorded write: the table, the operation and its values. */
export type FakeWrite = { table: string; op: string; values: unknown };

/**
 * A tiny stand-in for the Supabase client in this function's tests: every read of a table returns
 * its rows, writes are recorded, and an update guarded by `.is(col, null)` succeeds only once.
 */
export function fakeDb(tables: Record<string, Array<Record<string, unknown>>>) {
  const writes: Array<FakeWrite> = [];
  const claimed = new Set<string>();
  const from = (table: string) => {
    let op = "select";
    let values: unknown = null;
    let guard: string | null = null;
    const rows = () => tables[table] ?? [];
    const result = () => {
      if (op !== "select") {
        writes.push({ table, op, values });
      }
      if (op === "update" && guard) {
        const key = `${table}.${guard}`;
        const first = !claimed.has(key);
        claimed.add(key);
        return { data: first ? [{ id: "x" }] : [], error: null };
      }
      return { data: rows(), error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      insert: (v: unknown) => ((op = "insert"), (values = v), chain),
      update: (v: unknown) => ((op = "update"), (values = v), chain),
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      or: () => chain,
      is: (col: string) => ((guard = col), chain),
      maybeSingle: () =>
        Promise.resolve({ ...result(), data: rows()[0] ?? null }),
      single: () => Promise.resolve({ ...result(), data: rows()[0] ?? null }),
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
        Promise.resolve(result()).then(ok, bad),
    };
    return chain;
  };
  const rpc = () => Promise.resolve({ data: [], error: null });
  return { db: { from, rpc } as unknown as DbClient, writes };
}
