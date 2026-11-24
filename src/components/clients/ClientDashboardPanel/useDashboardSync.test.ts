import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { useDashboardSync } from "./useDashboardSync";

const ADS_TABLE = {
  id: "ads-1",
  client_id: "client-1",
  integration_type: "google_ads",
};
const GA_TABLE = {
  id: "ga-1",
  client_id: "client-1",
  integration_type: "google_analytics",
};

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  syncReportTables: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

vi.mock("@/lib/reportSync", () => ({
  syncReportTables: mocks.syncReportTables,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    now: new Date(2026, 10, 15, 12),
  });
  mocks.invoke.mockImplementation(async (name: string) =>
    name.startsWith("crm-tables")
      ? { data: [ADS_TABLE, GA_TABLE], error: null }
      : { data: { success: true, records_synced: 3 }, error: null },
  );
  mocks.syncReportTables.mockResolvedValue([{ status: "synced" }]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useDashboardSync", () => {
  it("sends ads tables through the picked window and other sources through reportSync", async () => {
    const { wrapper } = createTestQueryHarness();
    const { result } = renderHook(
      () =>
        useDashboardSync("client-1", "tenant-1", null, {
          filter: "last_7_days",
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loadingTables).toBe(false));

    act(() => result.current.sync());
    await waitFor(() => expect(result.current.syncing).toBe(false));

    expect(mocks.syncReportTables).toHaveBeenCalledWith([GA_TABLE]);
    const syncCalls = mocks.invoke.mock.calls.filter(
      ([name]) => !String(name).startsWith("crm-tables"),
    );
    expect(syncCalls).toEqual([
      [
        "sync-google-ads-data",
        {
          method: "POST",
          body: {
            table_id: "ads-1",
            start_date: "2026-11-08",
            end_date: "2026-11-14",
          },
        },
      ],
    ]);
  });

  it("syncs the custom range picked on the card", async () => {
    const { wrapper } = createTestQueryHarness();
    const { result } = renderHook(
      () =>
        useDashboardSync("client-1", "tenant-1", null, {
          filter: "custom",
          customStart: "2026-11-01",
          customEnd: "2026-11-05",
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.loadingTables).toBe(false));

    act(() => result.current.sync());
    await waitFor(() => expect(result.current.syncing).toBe(false));

    const syncBodies = mocks.invoke.mock.calls
      .filter(([name]) => !String(name).startsWith("crm-tables"))
      .map(([, options]) => options.body);
    expect(syncBodies).toEqual([
      { table_id: "ads-1", start_date: "2026-11-01", end_date: "2026-11-05" },
    ]);
  });
});
