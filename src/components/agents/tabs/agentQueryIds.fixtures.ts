import { beforeEach, vi } from "vitest";
import type { Database } from "@/integrations/supabase/types";

const queryState = vi.hoisted(() => {
  const state: {
    tenantId: string | null;
    requests: Array<Request>;
    fetch: ReturnType<typeof vi.fn<typeof fetch>>;
  } = { tenantId: "tenant-a", requests: [], fetch: vi.fn<typeof fetch>() };
  return state;
});

export { queryState };

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: queryState.tenantId }),
}));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return {
    supabase: createClient<Database>("https://example.com", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          queryState.requests.push(new Request(input, init));
          return queryState.fetch(input, init);
        },
      },
    }),
  };
});

beforeEach(() => {
  queryState.tenantId = "tenant-a";
  queryState.requests = [];
  queryState.fetch.mockReset().mockResolvedValue(Response.json([]));
});
