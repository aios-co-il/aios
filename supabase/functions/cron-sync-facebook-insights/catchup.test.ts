import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import {
  buildSyncOutcome,
  type SyncOutcomeStatus,
} from "../_shared/ads-sync/outcome.ts";
import { HISTORY_BACKFILL_KEY } from "../_shared/ads-sync/history-backfill.ts";
import { runCatchup, runHistoryBackfill } from "./catchup.ts";

const WINDOW = { startDate: "2026-09-01", endDate: "2026-09-30" };

/** A writeWindow whose run ends with `status` (and `error`). */
function ends(status: SyncOutcomeStatus, error?: string) {
  return () =>
    Promise.resolve({ outcome: buildSyncOutcome({ status, error }) });
}

Deno.test(
  "runCatchup: the error of a failed or throwing catch-up, null otherwise",
  async () => {
    assertStrictEquals(
      await runCatchup(ends("failed", "campaign level fetch failed"), WINDOW),
      "campaign level fetch failed",
    );
    assertStrictEquals(await runCatchup(ends("failed"), WINDOW), "failed");
    assertStrictEquals(await runCatchup(ends("empty"), WINDOW), null);
    assertStrictEquals(
      await runCatchup(
        () => Promise.reject(new Error("Graph timeout")),
        WINDOW,
      ),
      "Graph timeout",
    );
  },
);

const TODAY = "2026-11-25";
const BACKFILL = { startDate: "2026-06-30", endDate: "2026-07-17" };
const MARKER = {
  [HISTORY_BACKFILL_KEY]: { start: "2026-06-30", end: "2026-07-17" },
};
const NO_CATCHUP = { catchup: null, today: TODAY };

/** A writeWindow that records the windows it was asked for. */
function recording(status: SyncOutcomeStatus, error?: string) {
  const windows: Array<unknown> = [];
  const writeWindow = (window: unknown) => {
    windows.push(window);
    return ends(status, error)();
  };
  return { windows, writeWindow };
}

Deno.test(
  "runHistoryBackfill: writes the marker's window when the run has no catch-up slice",
  async () => {
    const { windows, writeWindow } = recording("ok");

    assertEquals(await runHistoryBackfill(writeWindow, MARKER, NO_CATCHUP), {
      status: "ok",
      error: null,
      settingsPatch: { [HISTORY_BACKFILL_KEY]: null },
    });
    assertEquals(windows, [BACKFILL]);
  },
);

Deno.test(
  "runHistoryBackfill: nothing while a catch-up slice is due or without a marker",
  async () => {
    const { windows, writeWindow } = recording("ok");
    const catchup = { startDate: "2026-08-01", endDate: "2026-08-21" };

    assertStrictEquals(
      await runHistoryBackfill(writeWindow, MARKER, { catchup, today: TODAY }),
      null,
    );
    assertStrictEquals(
      await runHistoryBackfill(writeWindow, {}, NO_CATCHUP),
      null,
    );
    assertEquals(windows, []);
  },
);

Deno.test(
  "runHistoryBackfill: keeps the marker when a level failed, the write failed, came back empty or threw",
  async () => {
    const keeps = (status: SyncOutcomeStatus, error: string | null) => ({
      status,
      error,
      settingsPatch: {},
    });

    assertEquals(
      await runHistoryBackfill(
        ends("partial", "ad: timeout"),
        MARKER,
        NO_CATCHUP,
      ),
      keeps("partial", "ad: timeout"),
    );
    assertEquals(
      await runHistoryBackfill(ends("empty"), MARKER, NO_CATCHUP),
      keeps("empty", null),
    );
    assertEquals(
      await runHistoryBackfill(
        ends("failed", "delete: timeout"),
        MARKER,
        NO_CATCHUP,
      ),
      keeps("failed", "delete: timeout"),
    );
    assertEquals(
      await runHistoryBackfill(
        () => Promise.reject(new Error("Graph timeout")),
        MARKER,
        NO_CATCHUP,
      ),
      keeps("failed", "Graph timeout"),
    );
  },
);
