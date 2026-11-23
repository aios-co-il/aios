/** A Supabase client stand-in that records each query's calls and answers with `rows`. */
export function recordingDb(rows: Array<Record<string, unknown>>) {
  const calls: Array<[string, ...Array<unknown>]> = [];
  const result = Promise.resolve({ data: rows, error: null });
  const chain: Record<string, unknown> = {};
  for (const method of [
    "select",
    "eq",
    "neq",
    "in",
    "or",
    "limit",
    "upsert",
    "update",
    "delete",
  ]) {
    chain[method] = (...args: Array<unknown>) => {
      calls.push([method, ...args]);
      return chain;
    };
  }
  chain.then = result.then.bind(result);
  const db = {
    from: (table: string) => {
      calls.push(["from", table]);
      return chain;
    },
  };
  return { db, calls };
}
