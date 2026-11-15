// A fake Supabase client for the meeting-bot video-storage tests. Every builder
// call is recorded as [table, method, ...args], and each from(table) resolves to
// the next queued result for that table; rpc(fn) to the next one for `rpc:fn`.
import type { DbClient } from "../supabase-clients.ts";

/** What a query resolves to. */
export interface FakeResult {
  data: unknown;
  error: { message: string } | null;
}

/** A fake client, its recorded calls, and the same client typed for callers. */
export interface FakeDb {
  client: DbClient;
  calls: Array<Array<unknown>>;
}

const TERMINALS = new Set(["maybeSingle", "single"]);

/** The data-only result of a query that succeeded. */
export function ok(data: unknown): FakeResult {
  return { data, error: null };
}

/** Builds the fake client over the queued results. */
export function fakeDb(results: Record<string, Array<FakeResult>>): FakeDb {
  const calls: Array<Array<unknown>> = [];
  function next(key: string): FakeResult {
    return results[key]?.shift() ?? { data: null, error: null };
  }

  const fake = {
    from(table: string) {
      const result = next(table);
      const query: Record<string, unknown> = new Proxy(
        {},
        {
          get(_target, method: string) {
            if (method === "then") {
              return (resolve: (r: FakeResult) => unknown) => resolve(result);
            }
            return (...args: Array<unknown>) => {
              calls.push([table, method, ...args]);
              return TERMINALS.has(method) ? Promise.resolve(result) : query;
            };
          },
        },
      );
      return query;
    },
    rpc(fn: string, args: unknown) {
      calls.push(["rpc", fn, args]);
      return Promise.resolve(next(`rpc:${fn}`));
    },
  };
  // The fake implements only the builder calls these modules make.
  return { client: fake as unknown as DbClient, calls };
}

/** The recorded calls made on one table, without the table name. */
export function callsOn(
  calls: Array<Array<unknown>>,
  table: string,
): Array<Array<unknown>> {
  return calls.filter((call) => call[0] === table).map((call) => call.slice(1));
}
