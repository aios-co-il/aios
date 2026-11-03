import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { CashFlowTab } from "./CashFlowTab";

describe("CashFlowTab tenant-scoped queries", () => {
  it("skips backend reads when disabled queries are manually fetched without a tenant", async () => {
    const { queryClient, wrapper } = withTestQuery();
    const { unmount } = render(<CashFlowTab />, { wrapper });
    const queries = queryClient.getQueryCache().getAll();
    expect(queries).toHaveLength(6);
    // Exercise the query functions without rendering unrelated chart content.
    unmount();

    await expect(
      Promise.all(queries.map((query) => query.fetch())),
    ).resolves.toEqual(Array.from({ length: 6 }, () => []));
    expect(backend.from).not.toHaveBeenCalled();
  });
});

const backend = vi.hoisted(() => ({
  from: vi.fn(() => {
    throw new Error("A tenant is required before reading accounting data");
  }),
}));

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: null }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: backend.from },
}));
