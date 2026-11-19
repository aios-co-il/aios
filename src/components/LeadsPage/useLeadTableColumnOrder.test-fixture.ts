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
  update: vi.fn(),
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
        update: (row: unknown) => {
          const filters: Array<[string, unknown]> = [];
          const write = {
            eq: (column: string, value: unknown) => {
              filters.push([column, value]);
              return write;
            },
            is: (column: string, value: unknown) => {
              filters.push([`${column} is`, value]);
              return write;
            },
            then: (resolve: (result: { error: Failure }) => void) => {
              backend.update(table, row, filters);
              resolve({ error: backend.writeError });
            },
          };
          return write;
        },
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

/** Clears the fake backend, browser storage and console noise before each test. */
export function resetBackend() {
  backend.row = null;
  backend.readError = null;
  backend.writeError = null;
  backend.filters = [];
  backend.upsert.mockClear();
  backend.update.mockClear();
  backend.deferred = null;
  backend.toastError.mockClear();
  window.localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
}
