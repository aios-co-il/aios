import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";

import {
  HISTORY_BACKFILL_KEY,
  historyBackfillPatch,
  planHistoryBackfill,
  requestedHistoryBackfillPatch,
} from "./history-backfill.ts";

const TODAY = "2026-11-25";
const NO_CATCHUP = { catchup: null, today: TODAY };
const MARKER = {
  [HISTORY_BACKFILL_KEY]: { start: "2026-06-30", end: "2026-07-17" },
};

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
      planHistoryBackfill({ [HISTORY_BACKFILL_KEY]: null }, NO_CATCHUP),
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

    for (const marker of markers) {
      assertEquals(
        planHistoryBackfill({ [HISTORY_BACKFILL_KEY]: marker }, NO_CATCHUP),
        null,
      );
    }
  });
});

describe("historyBackfillPatch", () => {
  it("clears the marker after a clean write, including a confirmed empty window", () => {
    assertEquals(historyBackfillPatch("ok"), { [HISTORY_BACKFILL_KEY]: null });
  });

  it("keeps the marker when a level failed, the write failed or came back empty", () => {
    assertEquals(historyBackfillPatch("partial"), {});
    assertEquals(historyBackfillPatch("failed"), {});
    assertEquals(historyBackfillPatch("empty"), {});
  });
});

describe("requestedHistoryBackfillPatch", () => {
  it("clears the marker for a flagged run from a trusted caller", () => {
    assertEquals(
      requestedHistoryBackfillPatch("ok", {
        historyBackfill: true,
        trusted: true,
      }),
      { [HISTORY_BACKFILL_KEY]: null },
    );
    assertEquals(
      requestedHistoryBackfillPatch("failed", {
        historyBackfill: true,
        trusted: true,
      }),
      {},
    );
  });

  it("ignores the flag from an untrusted caller and an unflagged run", () => {
    assertEquals(
      requestedHistoryBackfillPatch("ok", {
        historyBackfill: true,
        trusted: false,
      }),
      {},
    );
    for (const historyBackfill of [false, "true", undefined]) {
      assertEquals(
        requestedHistoryBackfillPatch("ok", { historyBackfill, trusted: true }),
        {},
      );
    }
  });
});
