import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { useReportSync } from "./useReportSync";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  syncReportTable: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

vi.mock("@/lib/reportSync", () => ({
  syncReportTable: mocks.syncReportTable,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const LAST_7_DAYS = { filter: "last_7_days" };

/** Mounts the hook for `table` with the card on the last 7 days. */
function mountReportSync(table: { id: string; integration_type: string }) {
  const harness = createTestQueryHarness();
  const view = renderHook(
    () => useReportSync(table, "tenant-1", null, LAST_7_DAYS),
    { wrapper: harness.wrapper },
  );
  return { ...view, queryClient: harness.queryClient };
}

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    now: new Date(2026, 10, 15, 12),
  });
  mocks.invoke.mockResolvedValue({
    data: { success: true, records_synced: 3 },
    error: null,
  });
  mocks.syncReportTable.mockResolvedValue({ status: "synced" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useReportSync", () => {
  it("syncs an ads report for the 7 days the card shows, not the legacy window", async () => {
    const { result } = mountReportSync({
      id: "table-1",
      integration_type: "facebook_insights",
    });

    act(() => result.current.sync());
    await waitFor(() => expect(result.current.syncing).toBe(false));

    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith("sync-facebook-insights", {
      method: "POST",
      body: {
        table_id: "table-1",
        start_date: "2026-11-08",
        end_date: "2026-11-14",
      },
    });
    expect(mocks.syncReportTable).not.toHaveBeenCalled();
  });

  it("reloads the report after an ads sync even when the card closed meanwhile", async () => {
    const { result, unmount, queryClient } = mountReportSync({
      id: "table-1",
      integration_type: "facebook_insights",
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    act(() => result.current.sync());
    unmount();

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["client-report-data", "table-1"],
      }),
    );
  });

  it("keeps a non-ads report on its own source sync", async () => {
    const { result } = mountReportSync({
      id: "table-2",
      integration_type: "google_analytics",
    });

    act(() => result.current.sync());
    await waitFor(() => expect(mocks.syncReportTable).toHaveBeenCalled());

    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
