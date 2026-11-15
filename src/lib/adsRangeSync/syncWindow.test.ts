import { describe, expect, it } from "vitest";
import { MAX_REQUESTED_WINDOW_DAYS } from "@functions/_shared/ads-sync/requested-window.ts";
import { shiftYmd } from "@/lib/calendarTimeZone";
import {
  ADS_SYNC_PIECE_DAYS,
  type SyncWindow,
  resolveSyncWindow,
  splitSyncWindow,
} from "./syncWindow";

// Sunday 2026-11-15, midday in Israel and in the test runner's zone.
const NOW = new Date(2026, 10, 15, 12, 0, 0);

/** Inclusive day count of a window. */
function days(window: SyncWindow): number {
  let count = 0;
  for (let day = window.startDate; day <= window.endDate;) {
    count += 1;
    day = shiftYmd(day, 1);
  }
  return count;
}

/** Pieces, newest first, must tile the window exactly. */
function expectTiles(pieces: Array<SyncWindow>, window: SyncWindow): void {
  expect(pieces[0].endDate).toBe(window.endDate);
  expect(pieces[pieces.length - 1].startDate).toBe(window.startDate);
  for (let i = 1; i < pieces.length; i += 1) {
    expect(shiftYmd(pieces[i].endDate, 1)).toBe(pieces[i - 1].startDate);
  }
  for (const piece of pieces) {
    expect(piece.startDate <= piece.endDate).toBe(true);
    expect(days(piece)).toBeLessThanOrEqual(ADS_SYNC_PIECE_DAYS);
  }
}

describe("splitSyncWindow", () => {
  it("keeps a 7-day window in one piece", () => {
    const window = { startDate: "2026-11-08", endDate: "2026-11-14" };
    expect(splitSyncWindow(window)).toEqual([window]);
  });

  it("splits 120 days into 4 pieces of 30, newest first", () => {
    const window = { startDate: "2026-07-18", endDate: "2026-11-14" };
    expect(days(window)).toBe(120);
    const pieces = splitSyncWindow(window);
    expect(pieces).toEqual([
      { startDate: "2026-10-16", endDate: "2026-11-14" },
      { startDate: "2026-09-16", endDate: "2026-10-15" },
      { startDate: "2026-08-17", endDate: "2026-09-15" },
      { startDate: "2026-07-18", endDate: "2026-08-16" },
    ]);
    expectTiles(pieces, window);
  });

  it("puts the short remainder at the oldest end", () => {
    const window = { startDate: "2026-10-15", endDate: "2026-11-14" };
    expect(days(window)).toBe(31);
    expect(splitSyncWindow(window)).toEqual([
      { startDate: "2026-10-16", endDate: "2026-11-14" },
      { startDate: "2026-10-15", endDate: "2026-10-15" },
    ]);
  });

  it("keeps exactly 30 days and a single day in one piece", () => {
    const thirty = { startDate: "2026-10-16", endDate: "2026-11-14" };
    expect(splitSyncWindow(thirty)).toEqual([thirty]);
    const one = { startDate: "2026-11-14", endDate: "2026-11-14" };
    expect(splitSyncWindow(one)).toEqual([one]);
  });

  it("tiles a long custom range across a year boundary", () => {
    const window = { startDate: "2025-12-20", endDate: "2026-03-07" };
    expectTiles(splitSyncWindow(window), window);
  });

  it("never asks for more days than the edge accepts per request", () => {
    expect(ADS_SYNC_PIECE_DAYS).toBeLessThanOrEqual(MAX_REQUESTED_WINDOW_DAYS);
  });
});

describe("resolveSyncWindow", () => {
  it("syncs the 7 days the screen shows for last_7_days", () => {
    expect(resolveSyncWindow({ filter: "last_7_days" }, NOW)).toEqual({
      startDate: "2026-11-08",
      endDate: "2026-11-14",
    });
  });

  it("syncs 120 days for last_120_days", () => {
    const window = resolveSyncWindow({ filter: "last_120_days" }, NOW);
    expect(window).toEqual({ startDate: "2026-07-18", endDate: "2026-11-14" });
  });

  it("includes today for this_week", () => {
    expect(resolveSyncWindow({ filter: "this_week" }, NOW)).toEqual({
      startDate: "2026-11-15",
      endDate: "2026-11-15",
    });
  });

  it("syncs a custom range as picked", () => {
    expect(
      resolveSyncWindow(
        {
          filter: "custom",
          customStart: "2026-03-01",
          customEnd: "2026-03-10",
        },
        NOW,
      ),
    ).toEqual({ startDate: "2026-03-01", endDate: "2026-03-10" });
  });

  it("stops a custom range at today", () => {
    expect(
      resolveSyncWindow(
        {
          filter: "custom",
          customStart: "2026-11-10",
          customEnd: "2026-11-30",
        },
        NOW,
      ),
    ).toEqual({ startDate: "2026-11-10", endDate: "2026-11-15" });
  });

  it("has no window for all dates, an unfinished or a future range", () => {
    expect(resolveSyncWindow({ filter: "all" }, NOW)).toBeNull();
    expect(
      resolveSyncWindow({ filter: "custom", customStart: "2026-11-01" }, NOW),
    ).toBeNull();
    expect(
      resolveSyncWindow(
        {
          filter: "custom",
          customStart: "2026-12-01",
          customEnd: "2026-12-05",
        },
        NOW,
      ),
    ).toBeNull();
  });
});
