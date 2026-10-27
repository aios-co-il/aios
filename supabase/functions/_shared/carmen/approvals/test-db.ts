// A fake Supabase client for the approval-queue tests.

/** What a query resolves to. */
export interface FakeResult {
  data: unknown;
  error: unknown;
}

/**
 * A client whose queries record every builder call as [table, method, ...args].
 * Each from(table) resolves to the next entry of `results[table]`.
 */
export function fakeDb(results: Record<string, FakeResult[]>) {
  const calls: unknown[][] = [];
  const client = {
    from(table: string) {
      const result = results[table]?.shift() ?? { data: null, error: null };
      const record =
        (method: string) =>
        (...args: unknown[]) => {
          calls.push([table, method, ...args]);
          return query;
        };
      const query = {
        select: record("select"),
        update: record("update"),
        eq: record("eq"),
        in: record("in"),
        or: record("or"),
        limit: record("limit"),
        maybeSingle: () => Promise.resolve(result),
        then: (resolve: (r: FakeResult) => unknown) => resolve(result),
      };
      return query;
    },
  };
  return { client, calls };
}
