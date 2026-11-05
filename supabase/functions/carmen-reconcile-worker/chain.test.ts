import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { ReconcileSourceError } from "../_shared/reconcile/errors.ts";
import type {
  PlatformSource,
  ReconcileTable,
} from "../_shared/reconcile/types.ts";
import { MAX_DEFERRED, nextAfterChunk } from "./chain.ts";
import { runReconcileChunk } from "./chunk.ts";
import type { ReconcileStore } from "./chunk-types.ts";
import { createFixtureSource } from "./fixture-source.ts";
import { account, deps, memoryStore, table } from "./test-fixtures.ts";

describe("nextAfterChunk", () => {
  it("gives tables passed over for a rate limit one more try after the walk", async () => {
    const tables = [table("a"), table("b"), table("c", "google_ads")];
    const fixture = createFixtureSource(
      {
        a: { account, rows: [] },
        b: { account, rows: [] },
        c: { account, rows: [] },
      },
      "staging",
    );
    let metaCalls = 0;
    // Meta refuses the first request of the night, then recovers.
    const meta: PlatformSource = {
      name: "meta",
      account: (t) => {
        metaCalls += 1;
        return metaCalls === 1
          ? Promise.reject(
              new ReconcileSourceError(
                "rate_limit",
                "Meta 400: too many calls",
              ),
            )
          : fixture.account(t);
      },
      campaignDays: fixture.campaignDays,
    };
    const { store, saved } = memoryStore(tables, {});
    const chunkDeps = (s: ReconcileStore) => ({
      ...deps(s, meta),
      sourceFor: (t: ReconcileTable) =>
        t.integration_type === "google_ads" ? fixture : meta,
    });

    const walk = await runReconcileChunk(chunkDeps(store), {
      cursor: null,
      maxTables: 5,
    });
    assertStrictEquals(walk.done, true);
    const retry = nextAfterChunk("tables", [], walk);
    assertEquals(retry, { phase: "retry", cursor: null, deferred: ["b"] });
    const deferred = retry.deferred || [];

    // The retry pass lists only the deferred tables (the worker's table_ids filter).
    const retryStore: ReconcileStore = {
      ...store,
      listTables: (o) =>
        store
          .listTables(o)
          .then((ts) => ts.filter((t) => deferred.includes(t.id))),
    };
    const again = await runReconcileChunk(chunkDeps(retryStore), {
      cursor: null,
      maxTables: 5,
    });
    assertEquals(nextAfterChunk("retry", deferred, again), {
      phase: "accounts",
      cursor: null,
    });
    assertEquals(
      saved
        .filter((x) => x.run.table_id === "b")
        .map((x) => [x.run.status, x.run.summary.skipped_reason]),
      [
        ["skipped", "platform_rate_limited"],
        ["ok", undefined],
      ],
    );
  });

  it("carries deferred tables until the retry pass", () => {
    const chunk = (
      done: boolean,
      rate_limited_tables: string[],
      next_cursor: string | null = done ? null : "c",
    ) => ({ done, next_cursor, rate_limited_tables });
    // Mid-walk: the cursor moves on, the passed-over tables ride along (once each).
    assertEquals(nextAfterChunk("tables", ["x"], chunk(false, ["x", "y"])), {
      phase: "tables",
      cursor: "c",
      deferred: ["x", "y"],
    });
    // Nothing passed over: straight on to the accounts check.
    assertEquals(nextAfterChunk("tables", [], chunk(true, [])), {
      phase: "accounts",
      cursor: null,
    });
    // The retry pass keeps its list while it pages and never defers again.
    assertEquals(nextAfterChunk("retry", ["x"], chunk(false, ["x"])), {
      phase: "retry",
      cursor: "c",
      deferred: ["x"],
    });
    assertEquals(nextAfterChunk("retry", ["x"], chunk(true, ["x"])), {
      phase: "accounts",
      cursor: null,
    });
    // The carried list is capped; tables past the cap still have their skipped run.
    const many = Array.from({ length: MAX_DEFERRED + 5 }, (_, i) => `t${i}`);
    assertStrictEquals(
      nextAfterChunk("tables", [], chunk(false, many)).deferred?.length,
      MAX_DEFERRED,
    );
  });
});
