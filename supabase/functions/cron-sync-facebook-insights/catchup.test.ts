import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import {
  buildSyncOutcome,
  type SyncOutcomeStatus,
} from "../_shared/ads-sync/outcome.ts";
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

Deno.test(
  "runHistoryBackfill: the outcome status, failed with the error when it throws",
  async () => {
    assertEquals(await runHistoryBackfill(ends("ok"), WINDOW), {
      status: "ok",
      error: null,
    });
    assertEquals(await runHistoryBackfill(ends("empty"), WINDOW), {
      status: "empty",
      error: null,
    });
    assertEquals(
      await runHistoryBackfill(ends("failed", "delete: timeout"), WINDOW),
      { status: "failed", error: "delete: timeout" },
    );
    assertEquals(
      await runHistoryBackfill(
        () => Promise.reject(new Error("Graph timeout")),
        WINDOW,
      ),
      { status: "failed", error: "Graph timeout" },
    );
  },
);
