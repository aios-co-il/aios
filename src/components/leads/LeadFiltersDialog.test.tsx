import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { LeadFiltersDialog, type FilterState } from "./LeadFiltersDialog";

// The insert answers the new preset's id.
vi.mock("@/integrations/supabase/client", () => {
  const single = () =>
    Promise.resolve({ data: { id: "preset-new" }, error: null });
  const insert = () => ({ select: () => ({ single }) });
  return { supabase: { from: () => ({ insert }) } };
});
vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: "t1" }),
}));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "u1" }),
}));

const filters: FilterState = {
  searchQuery: "",
  salesPersonIds: [],
  stageIds: ["new"],
  stageFilterMode: "show",
  responseStatus: [],
  responseStatusFilterMode: "show",
  tagIds: [],
  startDate: undefined,
  endDate: undefined,
  followUpToday: false,
};

describe("LeadFiltersDialog save as preset", () => {
  test("applies the filters as the saved preset, so the page selects its tab", async () => {
    const onApply = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LeadFiltersDialog
          open
          onOpenChange={vi.fn()}
          currentFilters={filters}
          onApply={onApply}
          salesPeople={[]}
          pipelineStages={[{ id: "new", label: "חדש" }]}
          leadStatuses={[]}
          allTags={[]}
        />
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "שמור כפריסט" }));
    await userEvent.type(screen.getByLabelText("שם הפריסט"), "חדשים{Enter}");

    await waitFor(() =>
      expect(onApply).toHaveBeenCalledWith(
        expect.objectContaining({ stageIds: ["new"] }),
        "preset-new",
      ),
    );
  });
});
