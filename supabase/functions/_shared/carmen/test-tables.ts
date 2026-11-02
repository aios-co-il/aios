/**
 * A read-only stand-in for the Supabase client: each query resolves to the first
 * row of `tables[table]` that matches its .eq() filters. `queried` lists the
 * tables read, in order.
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
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return query;
        },
        or: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({
          data:
            (tables[table] || []).find((row) =>
              filters.every(([column, value]) => row[column] === value),
            ) ?? null,
        }),
      };
      return query;
    },
  };
  return client;
}
