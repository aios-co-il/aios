import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { useUsage } from "./useCommandData";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      let tenant: string | undefined;
      const query = {
        select: () => query,
        eq(column: string, value: string) {
          if (column === "tenant_id") tenant = value;
          return query;
        },
        gte: () => query,
        limit: () => query,
        maybeSingle: () => query,
        then(
          resolve: (value: {
            data: never[] | { settings: { monthly_budget_usd: number } };
            error: null;
          }) => unknown,
        ) {
          return Promise.resolve({
            data:
              table === "tenant_integrations"
                ? {
                    settings: {
                      monthly_budget_usd: tenant === "tenant-a" ? 100 : 9000,
                    },
                  }
                : [],
            error: null,
          }).then(resolve);
        },
      };
      return query;
    },
  },
}));

describe("usage integration budget", () => {
  it("reads the current tenant's budget when another tenant is accessible", async () => {
    const { wrapper } = createTestQueryHarness();
    const { result } = renderHook(() => useUsage("tenant-a"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.monthlyBudget).toBe(100);
  });
});
