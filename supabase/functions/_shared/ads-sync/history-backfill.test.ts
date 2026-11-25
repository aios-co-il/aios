import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";

import {
  historyBackfillPatch,
  planHistoryBackfill,
} from "./history-backfill.ts";

const TODAY = "2026-11-25";
const NO_CATCHUP = { catchup: null, today: TODAY };
const MARKER = { history_backfill: { start: "2026-06-30", end: "2026-07-17" } };

describe("planHistoryBackfill", () => {
  it("returns the marker's window when the run has no catch-up slice", () => {
    assertEquals(planHistoryBackfill(MARKER, NO_CATCHUP), {
      startDate: "2026-06-30",
      endDate: "2026-07-17",
    });
  });

  it("waits while a catch-up slice is still due", () => {
    const catchup = { startDate: "2026-08-01", endDate: "2026-08-21" };

    assertEquals(planHistoryBackfill(MARKER, { catchup, today: TODAY }), null);
  });

  it("is null without a marker or after it was cleared", () => {
    assertEquals(planHistoryBackfill({}, NO_CATCHUP), null);
    assertEquals(planHistoryBackfill(null, NO_CATCHUP), null);
    assertEquals(
      planHistoryBackfill({ history_backfill: null }, NO_CATCHUP),
      null,
    );
  });

  it("ignores a malformed, future or too long marker", () => {
    const markers = [
      { start: "2026-06-30" },
      { start: "2026-07-17", end: "2026-06-30" },
      { start: "2026-02-30", end: "2026-03-01" },
      { start: "2026-11-20", end: "2026-11-26" },
      { start: "2026-06-01", end: "2026-07-17" },
    ];

    for (const history_backfill of markers) {
      assertEquals(planHistoryBackfill({ history_backfill }, NO_CATCHUP), null);
    }
  });
});

describe("historyBackfillPatch", () => {
  it("clears the marker after a write, including a confirmed empty window", () => {
    assertEquals(historyBackfillPatch("ok"), { history_backfill: null });
    assertEquals(historyBackfillPatch("partial"), { history_backfill: null });
  });

  it("keeps the marker when the write failed or came back empty", () => {
    assertEquals(historyBackfillPatch("failed"), {});
    assertEquals(historyBackfillPatch("empty"), {});
  });
});
