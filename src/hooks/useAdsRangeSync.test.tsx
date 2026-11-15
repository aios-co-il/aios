import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import type { AdsRangeSyncResult } from "@/lib/adsRangeSync/syncAdsTableRange";
import { toast } from "sonner";
import {
  NO_SYNC_DAYS_MESSAGE,
  rangeSyncProgressLabel,
  useAdsRangeSync,
} from "./useAdsRangeSync";

type Call = { name: string; body: Record<string, string> };

const state = vi.hoisted(() => ({
  calls: [] as Array<Call>,
  inFlight: 0,
  maxInFlight: 0,
  failOnCall: 0,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: async (
        name: string,
        options: { body: Record<string, string> },
      ) => {
        state.calls.push({ name, body: options.body });
        state.inFlight += 1;
        state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        state.inFlight -= 1;
        if (state.calls.length === state.failOnCall) {
          return { data: null, error: new Error("504 IDLE_TIMEOUT") };
        }
        return {
          data: {
            success: true,
            records_synced: 10,
            by_level: { campaign: 1, adset: 2, ad: 3 },
          },
          error: null,
        };
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const TABLE = { id: "table-1", integration_type: "facebook_insights" };
// 2026-07-01 – 2026-10-28: 120 days, all in the past.
const SELECTION = {
  filter: "custom",
  customStart: "2026-07-01",
  customEnd: "2026-10-28",
};

/** Mounts the hook and runs one sync of TABLE over SELECTION. */
async function syncSelection() {
  const { queryClient, wrapper } = createTestQueryHarness();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const { result } = renderHook(
    () => useAdsRangeSync({ tenantId: "tenant-1", notify: false }),
    { wrapper },
  );
  let results: Array<AdsRangeSyncResult> = [];
  await act(async () => {
    results = await result.current.syncAsync({
      tables: [TABLE],
      selection: SELECTION,
    });
  });
  await waitFor(() => expect(result.current.syncing).toBe(false));
  return { results, invalidate };
}

beforeEach(() => {
  state.calls = [];
  state.inFlight = 0;
  state.maxInFlight = 0;
  state.failOnCall = 0;
});

describe("useAdsRangeSync", () => {
  it("syncs a 120-day selection in 4 sequential 30-day requests, newest first", async () => {
    const { results, invalidate } = await syncSelection();

    expect(state.calls).toEqual([
      {
        name: "sync-facebook-insights",
        body: {
          table_id: "table-1",
          start_date: "2026-09-29",
          end_date: "2026-10-28",
        },
      },
      {
        name: "sync-facebook-insights",
        body: {
          table_id: "table-1",
          start_date: "2026-08-30",
          end_date: "2026-09-28",
        },
      },
      {
        name: "sync-facebook-insights",
        body: {
          table_id: "table-1",
          start_date: "2026-07-31",
          end_date: "2026-08-29",
        },
      },
      {
        name: "sync-facebook-insights",
        body: {
          table_id: "table-1",
          start_date: "2026-07-01",
          end_date: "2026-07-30",
        },
      },
    ]);
    expect(state.maxInFlight).toBe(1);
    expect(results[0]).toMatchObject({
      piecesDone: 4,
      piecesTotal: 4,
      recordsSynced: 40,
      byLevel: { campaign: 4, adset: 8, ad: 12 },
      failure: null,
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["crm-records", "table-1"],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["crm-tables", "tenant-1"],
    });
  });

  it("stops at the first failed piece and keeps the pieces before it", async () => {
    state.failOnCall = 2;

    const { results, invalidate } = await syncSelection();

    expect(state.calls).toHaveLength(2);
    expect(results[0]).toMatchObject({
      piecesDone: 1,
      piecesTotal: 4,
      failure: {
        piece: { startDate: "2026-08-30", endDate: "2026-09-28" },
        message: "504 IDLE_TIMEOUT",
      },
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["crm-records", "table-1"],
    });
  });

  it("syncs the legacy 120 days in 30-day requests when the screen shows all dates", async () => {
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      now: new Date(2026, 10, 15, 12),
    });
    const { wrapper } = createTestQueryHarness();
    const { result } = renderHook(
      () => useAdsRangeSync({ tenantId: "tenant-1", notify: false }),
      { wrapper },
    );
    await act(async () => {
      await result.current.syncAsync({
        tables: [{ id: "table-2", integration_type: "google_ads" }],
        selection: { filter: "all" },
      });
    });
    vi.useRealTimers();
    expect(state.calls.map((call) => call.body)).toEqual([
      { table_id: "table-2", start_date: "2026-10-17", end_date: "2026-11-15" },
      { table_id: "table-2", start_date: "2026-09-17", end_date: "2026-10-16" },
      { table_id: "table-2", start_date: "2026-08-18", end_date: "2026-09-16" },
      { table_id: "table-2", start_date: "2026-07-19", end_date: "2026-08-17" },
    ]);
  });

  it("sends nothing and says why for a range that has not started yet", async () => {
    const { wrapper } = createTestQueryHarness();
    const { result } = renderHook(
      () => useAdsRangeSync({ tenantId: "tenant-1" }),
      { wrapper },
    );
    act(() => {
      result.current.sync({
        tables: [TABLE],
        selection: {
          filter: "custom",
          customStart: "2099-01-01",
          customEnd: "2099-01-05",
        },
      });
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(NO_SYNC_DAYS_MESSAGE),
    );
    expect(state.calls).toEqual([]);
  });
});

describe("rangeSyncProgressLabel", () => {
  it("names the running piece", () => {
    expect(rangeSyncProgressLabel({ done: 1, total: 4 })).toBe("מסנכרן 2/4…");
    expect(rangeSyncProgressLabel({ done: 0, total: 1 })).toBe("מסנכרן…");
  });
});
