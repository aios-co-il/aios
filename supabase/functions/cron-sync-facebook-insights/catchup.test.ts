import { assertStrictEquals } from "jsr:@std/assert@1";

import {
  buildSyncOutcome,
  type SyncOutcomeStatus,
} from "../_shared/ads-sync/outcome.ts";
import { runCatchup } from "./catchup.ts";

const WINDOW = { startDate: "2026-09-01", endDate: "2026-09-30" };

Deno.test(
  "runCatchup: the error of a failed or throwing catch-up, null otherwise",
  async () => {
    const ends = (status: SyncOutcomeStatus, error?: string) => () =>
      Promise.resolve({ outcome: buildSyncOutcome({ status, error }) });

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
