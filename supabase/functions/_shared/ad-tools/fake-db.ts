/** A chainable stand-in for the supabase-js client the ad-tools store reads
 * with, for tests: records each query's filters and answers per table or RPC
 * name, whatever the filters. */

type Result = { data: unknown; error: unknown };

type Call = { table: string; ops: unknown[][] };

/** `auth.getUser` accepts only the token "good" (user "u1"). */
export function fakeDb(
  tables: Record<string, Result>,
  rpcs: Record<string, Result> = {},
) {
  const calls: Call[] = [];
  return {
    calls,
    auth: {
      getUser: async (token: string) =>
        token === "good"
          ? { data: { user: { id: "u1" } }, error: null }
          : { data: { user: null }, error: new Error("invalid JWT") },
    },
    rpc: async (fn: string, args: unknown) => {
      calls.push({ table: `rpc:${fn}`, ops: [[args]] });
      return rpcs[fn] ?? { data: null, error: null };
    },
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const q: Record<string, unknown> = {
        then: (ok: (r: Result) => unknown, fail: (e: unknown) => unknown) =>
          Promise.resolve(tables[table] ?? { data: [], error: null }).then(
            ok,
            fail,
          ),
      };
      for (const m of ["select", "eq", "in", "not", "or"]) {
        q[m] = (...args: unknown[]) => (call.ops.push([m, ...args]), q);
      }
      return q;
    },
  };
}

/** A successful answer with these rows. */
export const rows = (data: unknown[]) => ({ data, error: null });
