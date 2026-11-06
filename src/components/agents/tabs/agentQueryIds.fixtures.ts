import { beforeEach, vi } from "vitest";

type QueryFixture = {
  tenantId: string | null;
  rows: Record<string, Array<unknown>>;
  filter: ReturnType<
    typeof vi.fn<
      (table: string, column: string, value: unknown, operator?: string) => void
    >
  >;
  exclude: ReturnType<
    typeof vi.fn<(table: string, column: string, value: string) => void>
  >;
  scope: ReturnType<typeof vi.fn<(table: string, expression: string) => void>>;
};

const queryState = vi.hoisted((): QueryFixture => ({
  tenantId: "tenant-a",
  rows: {},
  filter:
    vi.fn<
      (table: string, column: string, value: unknown, operator?: string) => void
    >(),
  exclude: vi.fn<(table: string, column: string, value: string) => void>(),
  scope: vi.fn<(table: string, expression: string) => void>(),
}));

export { queryState };

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: queryState.tenantId }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: tableQuery },
}));

beforeEach(() => {
  queryState.tenantId = "tenant-a";
  queryState.rows = {};
});

/** Record query filters while exercising the actual component and cache. */
function tableQuery(table: string) {
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      queryState.filter(table, column, value);
      return query;
    },
    filter: (column: string, operator: string, value: unknown) => {
      queryState.filter(table, column, value, operator);
      return query;
    },
    neq: (column: string, value: string) => {
      queryState.exclude(table, column, value);
      return query;
    },
    or: (expression: string) => {
      queryState.scope(table, expression);
      return query;
    },
    order: () => query,
    limit: () => query,
    then: (
      resolve: (value: { data: Array<unknown>; error: null }) => unknown,
    ) =>
      Promise.resolve({ data: queryState.rows[table] ?? [], error: null }).then(
        resolve,
      ),
  };
  return query;
}
