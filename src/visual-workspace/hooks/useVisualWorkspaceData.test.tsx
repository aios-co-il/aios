import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { useVisualWorkspaceData } from "./useVisualWorkspaceData";

const state = vi.hoisted(() => ({ campaignFilter: false }));
vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: "tenant-a" }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        neq: () => query,
        in: () => query,
        lte: () => query,
        gte: () => query,
        maybeSingle: () => query,
        is(column: string, value: unknown) {
          if (table === "campaign_alerts" && column === "resolved_at" && value === null) {
            state.campaignFilter = true;
          }
          return query;
        },
        then(resolve: (value: { data: never[]; count: number; error: null }) => unknown) {
          return Promise.resolve({
            data: [],
            count: table === "campaign_alerts" && state.campaignFilter ? 2 : 0,
            error: null,
          }).then(resolve);
        },
      };
      return query;
    },
  },
}));

describe("visual workspace campaign alerts", () => {
  it("uses unresolved alerts to drive the marketing warning", async () => {
    state.campaignFilter = false;
    const { wrapper } = createTestQueryHarness();
    const { result } = renderHook(() => useVisualWorkspaceData(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(state.campaignFilter).toBe(true);
    const marketing = result.current.data?.islands.find(island => island.id === "marketing");
    expect(marketing?.alerts).toBe(2);
    expect(marketing?.status).toBe("watch");
  });
});
