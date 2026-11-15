import { describe, expect, it, vi } from "vitest";
import {
  adsSyncLabel,
  isAdsSyncTable,
  planSyncPieces,
  syncAdsTableRange,
} from "./syncAdsTableRange";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

const NOW = new Date(2026, 10, 15, 12);
const TABLE = { id: "table-1", integration_type: "facebook_ecommerce" };
const PIECES = [
  { startDate: "2026-10-16", endDate: "2026-11-14" },
  { startDate: "2026-09-16", endDate: "2026-10-15" },
  { startDate: "2026-08-17", endDate: "2026-09-15" },
];

describe("isAdsSyncTable / adsSyncLabel", () => {
  it("routes only the three ads report types", () => {
    expect(isAdsSyncTable({ id: "a", integration_type: "google_ads" })).toBe(
      true,
    );
    expect(
      isAdsSyncTable({ id: "b", integration_type: "google_analytics" }),
    ).toBe(false);
    expect(isAdsSyncTable({ id: "c", integration_type: null })).toBe(false);
    expect(adsSyncLabel(TABLE)).toBe("Facebook Ecom");
    expect(adsSyncLabel({ id: "d", integration_type: "ahrefs" })).toBeNull();
  });
});

describe("planSyncPieces", () => {
  it("plans a 7-day view as one request", () => {
    expect(planSyncPieces({ filter: "last_7_days" }, NOW)).toEqual([
      { startDate: "2026-11-08", endDate: "2026-11-14" },
    ]);
  });

  it("plans 'all' as the legacy 120 days in 30-day requests", () => {
    const pieces = planSyncPieces({ filter: "all" }, NOW);

    expect(pieces).toHaveLength(4);
    expect(pieces[0]).toEqual({
      startDate: "2026-10-17",
      endDate: "2026-11-15",
    });
    expect(pieces[3].startDate).toBe("2026-07-19");
  });

  it("plans an unfinished custom range as the legacy 120 days", () => {
    const pieces = planSyncPieces(
      { filter: "custom", customStart: "2026-11-01", customEnd: null },
      NOW,
    );

    expect(pieces).toHaveLength(4);
    expect(pieces[3].startDate).toBe("2026-07-19");
  });

  it("plans no request for a range entirely in the future", () => {
    expect(
      planSyncPieces(
        {
          filter: "custom",
          customStart: "2026-12-01",
          customEnd: "2026-12-05",
        },
        NOW,
      ),
    ).toEqual([]);
  });
});

describe("syncAdsTableRange", () => {
  it("sends each piece's window to the table's sync function and sums the counts", async () => {
    const invoke = vi.fn().mockResolvedValue({
      records_synced: 5,
      by_level: { campaign: 1, adset: 2, ad: 2 },
    });

    const result = await syncAdsTableRange(TABLE, PIECES, { invoke });

    expect(invoke.mock.calls).toEqual(
      PIECES.map((piece) => [
        "sync-facebook-ecommerce",
        {
          table_id: "table-1",
          start_date: piece.startDate,
          end_date: piece.endDate,
        },
      ]),
    );
    expect(result).toMatchObject({
      piecesDone: 3,
      piecesTotal: 3,
      recordsSynced: 15,
      byLevel: { campaign: 3, adset: 6, ad: 6 },
      failure: null,
    });
  });

  it("stops at the first failed piece and names it", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ records_synced: 5 })
      .mockRejectedValueOnce(new Error("504 IDLE_TIMEOUT"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await syncAdsTableRange(TABLE, PIECES, { invoke });

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(result.piecesDone).toBe(1);
    expect(result.failure).toEqual({
      piece: PIECES[1],
      message: "504 IDLE_TIMEOUT",
    });
  });

  it("refuses a table that is not an ads report", async () => {
    await expect(
      syncAdsTableRange(
        { id: "ga", integration_type: "google_analytics" },
        PIECES,
        { invoke: vi.fn() },
      ),
    ).rejects.toThrow("Not an ads report table");
  });
});
