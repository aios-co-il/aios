import { vi } from "vitest";

/** A failed Supabase call, as the client returns it. */
export type Failure = { message: string } | null;

/** The fake lead_list_defaults backend that useLeadTableColumnOrder tests drive. */
export const backend = {
  row: null as { column_order: Array<string> | null } | null,
  readError: null as Failure,
  writeError: null as Failure,
  filters: [] as Array<[string, string]>,
  upsert: vi.fn(),
  // When set, each upsert waits on the next deferred result instead of resolving at once.
  deferred: null as Array<{
    resolve: (result: { error: Failure }) => void;
  }> | null,
  toastError: vi.fn(),
};

/** Stands in for "sonner"; errors land on backend.toastError. */
export const sonnerModule = {
  toast: { error: backend.toastError, success: vi.fn() },
};

/** Stands in for "@/integrations/supabase/client", reading and writing backend. */
export const supabaseModule = {
  supabase: {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: (column: string, value: string) => {
          backend.filters.push([column, value]);
          return query;
        },
        maybeSingle: () =>
          Promise.resolve({ data: backend.row, error: backend.readError }),
        upsert: (row: unknown, options: unknown) => {
          backend.upsert(table, row, options);
          const deferred = backend.deferred;
          if (deferred) {
            return new Promise<{ error: Failure }>((resolve) => {
              deferred.push({ resolve });
            });
          }
          return Promise.resolve({ error: backend.writeError });
        },
      };
      return query;
    },
  },
};
