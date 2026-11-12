import { vi } from "vitest";

/** A share row as `table_shares` and `dashboard_shares` hold it. */
export type FakeShareRow = {
  share_token: string;
  is_active: boolean;
  created_at: string;
  [column: string]: unknown;
};

/**
 * An in-memory stand-in for the supabase client's share tables: reads honour
 * `eq` filters and the `created_at` order, and every update and insert is
 * recorded so a test can assert that opening the card wrote nothing.
 */
export function fakeShareSupabase(rows: Array<FakeShareRow>) {
  const writes = {
    updates: [] as Array<Record<string, unknown>>,
    inserts: [] as Array<Record<string, unknown>>,
  };

  /** A query on one table, built up the way the share token sources chain it. */
  function from(tableName: string) {
    const filters: Array<[string, unknown]> = [];
    let inserted: FakeShareRow | null = null;
    /** The rows the query's filters keep, newest first. */
    function matching() {
      return rows
        .filter((row) =>
          filters.every(([column, value]) => row[column] === value),
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () =>
        tableName === "crm_dashboards"
          ? { data: { tenant_id: "home-tenant" }, error: null }
          : { data: matching()[0] ?? null, error: null },
      update: (values: Record<string, unknown>) => {
        writes.updates.push(values);
        return builder;
      },
      insert: (values: Record<string, unknown>) => {
        writes.inserts.push(values);
        inserted = {
          ...values,
          share_token: String(values.share_token),
          is_active: true,
          created_at: "9999",
        };
        rows.push(inserted);
        return builder;
      },
      single: async () => ({ data: inserted, error: null }),
      then: (resolve: (value: { error: null }) => void) =>
        resolve({ error: null }),
    };
    return builder;
  }

  const supabase = {
    from: vi.fn(from),
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } } }),
    },
  };
  return { supabase, writes };
}
