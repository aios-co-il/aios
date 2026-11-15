/**
 * A read-only stand-in for the Supabase client: `.maybeSingle()` resolves to the
 * first row of `tables[table]` that matches its .eq() filters, and awaiting the
 * query itself to all of them. `queried` lists the tables read, in order.
 */
export function fakeTables(
  tables: Record<string, Array<Record<string, unknown>>>,
) {
  const queried: string[] = [];
  const client = {
    queried,
    from(table: string) {
      queried.push(table);
      const filters: Array<[string, unknown]> = [];
      /** The rows of this table that match every .eq() filter so far. */
      function matching() {
        return (tables[table] || []).filter((row) =>
          filters.every(([column, value]) => row[column] === value),
        );
      }
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return query;
        },
        or: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
        then: (resolve: (result: unknown) => unknown) =>
          resolve({ data: matching(), error: null }),
      };
      return query;
    },
  };
  return client;
}
