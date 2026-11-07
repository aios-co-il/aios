import { beforeEach, vi } from "vitest";

const operationState = vi.hoisted(() => {
  const state: {
    tenantId: string | null;
    failure: Error | null;
    rows: Record<string, Array<unknown>>;
    insert: ReturnType<typeof vi.fn>;
    auth: ReturnType<typeof vi.fn>;
  } = {
    tenantId: "tenant-a",
    failure: null,
    rows: {},
    insert: vi.fn(),
    auth: vi.fn(),
  };
  return state;
});

export { operationState };

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: operationState.tenantId }),
}));
vi.mock("@/hooks/useTenantPath", () => ({
  useTenantPath: () => ({ buildPath: (path: string) => path }),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: tableQuery,
    auth: {
      getUser: () => {
        operationState.auth();
        return Promise.resolve({ data: { user: { id: "user-a" } } });
      },
    },
  },
}));

beforeEach(() => {
  operationState.tenantId = "tenant-a";
  operationState.failure = null;
  operationState.rows = {};
});

/** Record the SDK boundary while leaving the component and query cache real. */
function tableQuery(table: string) {
  const query = {
    select: () => query,
    eq: () => query,
    filter: () => query,
    neq: () => query,
    or: () => query,
    order: () => query,
    limit: () => query,
    insert: (payload: unknown) => {
      operationState.insert(table, payload);
      return Promise.resolve({ error: operationState.failure });
    },
    then: (
      resolve: (value: { data: Array<unknown>; error: null }) => unknown,
    ) =>
      Promise.resolve({
        data: operationState.rows[table] ?? [],
        error: null,
      }).then(resolve),
  };
  return query;
}
