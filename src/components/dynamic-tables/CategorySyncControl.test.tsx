import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { CategorySyncControl } from "./CategorySyncControl";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: "tenant-1" }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

describe("CategorySyncControl", () => {
  it("reloads each ads table's records after syncing, also when a piece fails", async () => {
    mocks.invoke
      .mockResolvedValueOnce({ data: { records_synced: 1 }, error: null })
      .mockResolvedValue({ data: null, error: new Error("504") });
    const { queryClient, wrapper: Wrapper } = createTestQueryHarness();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const user = userEvent.setup();
    render(
      <Wrapper>
        <CategorySyncControl
          category="ads"
          tables={[
            {
              id: "fb-1",
              name: "Facebook",
              integration_type: "facebook_insights",
            },
          ]}
        />
      </Wrapper>,
    );

    await user.click(screen.getByRole("button", { name: /סנכרן עכשיו/ }));

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["crm-records", "fb-1"],
      }),
    );
  });
});
