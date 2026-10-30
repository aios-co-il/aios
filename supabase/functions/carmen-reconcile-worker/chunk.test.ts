import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { CallBudget } from "../_shared/reconcile/budget.ts";
import { ReconcileSourceError } from "../_shared/reconcile/errors.ts";
import type {
  PlatformSource,
  ReconcileTable,
} from "../_shared/reconcile/types.ts";
import { runReconcileChunk } from "./chunk.ts";
import { createFixtureSource, type FixtureTable } from "./fixture-source.ts";
import { account, day, deps, memoryStore, table } from "./test-fixtures.ts";

describe("runReconcileChunk", () => {
  it("follows the cursor until every table is done", async () => {
    const tables = ["a", "b", "c", "d", "e"].map((id) => table(id));
    const fixtures: Record<string, FixtureTable> = {};
    for (const t of tables) {
      fixtures[t.id] = { account, rows: [day("1", 100)] };
    }
    const source = createFixtureSource(fixtures, "staging");
    const aios = Object.fromEntries(tables.map((t) => [t.id, [day("1", 100)]]));
    const { store, saved } = memoryStore(tables, aios);

    const first = await runReconcileChunk(deps(store, source), {
      cursor: null,
      maxTables: 2,
    });
    assertEquals(
      first.processed.map((p) => p.table_id),
      ["a", "b"],
    );
    assertStrictEquals(first.next_cursor, "b");
    assertStrictEquals(first.done, false);
    assertStrictEquals(first.stopped, "max_tables");

    const second = await runReconcileChunk(deps(store, source), {
      cursor: first.next_cursor,
      maxTables: 10,
    });
    assertEquals(
      second.processed.map((p) => p.table_id),
      ["c", "d", "e"],
    );
    assertStrictEquals(second.done, true);
    assertStrictEquals(second.next_cursor, null);
    assertStrictEquals(saved.length, 5);
    assert(saved.every((s) => s.run.status === "ok"));
  });

  it("passes over tables of inactive clients without a run", async () => {
    const tables = [
      table("a", "facebook_insights", { client_status: "paused" }),
      table("b"),
    ];
    const source = createFixtureSource({ b: { account, rows: [] } }, "staging");
    const { store, saved } = memoryStore(tables, {});
    const r = await runReconcileChunk(deps(store, source), {
      cursor: null,
      maxTables: 5,
    });
    assertEquals(
      r.processed.map((p) => p.table_id),
      ["b"],
    );
    assertEquals(
      saved.map((s) => s.run.table_id),
      ["b"],
    );
  });

  it("does not call a rate-limited platform again in the same chunk", async () => {
    const tables = [table("a"), table("b"), table("c", "google_ads")];
    let calls = 0;
    const meta: PlatformSource = {
      name: "meta",
      account: () => {
        calls += 1;
        return Promise.reject(
          new ReconcileSourceError("rate_limit", "Meta 400: too many calls"),
        );
      },
      campaignDays: () => Promise.resolve({ rows: [] }),
    };
    const google = createFixtureSource({ c: { account, rows: [] } }, "staging");
    const { store, saved } = memoryStore(tables, {});
    const r = await runReconcileChunk(
      {
        ...deps(store, meta),
        sourceFor: (t: ReconcileTable) =>
          t.integration_type === "google_ads" ? google : meta,
      },
      { cursor: null, maxTables: 5 },
    );
    assertStrictEquals(calls, 1);
    // b is passed over: its skipped run says why (the trust line and the
    // persisting check look past it), and the worker retries it after the walk.
    assertEquals(
      saved.map((s) => [
        s.run.table_id,
        s.run.status,
        s.run.summary.error_kind ?? s.run.summary.skipped_reason,
      ]),
      [
        ["a", "failed", "rate_limit"],
        ["b", "skipped", "platform_rate_limited"],
        ["c", "ok", undefined],
      ],
    );
    assertEquals(r.rate_limited_tables, ["b"]);
    assertEquals(
      r.processed.map((p) => [p.table_id, p.status, p.skipped_reason]),
      [
        ["a", "failed", undefined],
        ["b", "skipped", "platform_rate_limited"],
        ["c", "ok", undefined],
      ],
    );
    assertStrictEquals(r.done, true);
  });

  it("fails only that table on a per-ad-account throttle, not the platform", async () => {
    const tables = [table("a"), table("b")];
    const fixture = createFixtureSource(
      { b: { account, rows: [] } },
      "staging",
    );
    const meta: PlatformSource = {
      name: "meta",
      account: (t) =>
        t.id === "a"
          ? Promise.reject(
              new ReconcileSourceError(
                "rate_limit",
                "Meta 400: ad account has too many API calls",
                "account",
              ),
            )
          : fixture.account(t),
      campaignDays: fixture.campaignDays,
    };
    const { store, saved } = memoryStore(tables, {});
    await runReconcileChunk(deps(store, meta), { cursor: null, maxTables: 5 });
    assertEquals(
      saved.map((s) => [s.run.table_id, s.run.status]),
      [
        ["a", "failed"],
        ["b", "ok"],
      ],
    );
  });

  it("stops before a table on an exhausted budget and keeps the cursor", async () => {
    const tables = [table("a"), table("b")];
    const fixture = createFixtureSource(
      { a: { account, rows: [] }, b: { account, rows: [] } },
      "staging",
    );
    // Each table takes 4 calls; the budget only has room for one table.
    const budget = new CallBudget(6);
    const counting: PlatformSource = {
      name: "meta",
      account: (t) => {
        for (let i = 0; i < 4; i++) {
          budget.take();
        }
        return fixture.account(t);
      },
      campaignDays: fixture.campaignDays,
    };
    const { store, saved } = memoryStore(tables, {});
    const r = await runReconcileChunk(deps(store, counting, budget), {
      cursor: null,
      maxTables: 5,
    });
    assertEquals(
      r.processed.map((p) => p.table_id),
      ["a"],
    );
    assertStrictEquals(r.stopped, "budget");
    assertStrictEquals(r.next_cursor, "a");
    assertStrictEquals(saved.length, 1);
  });
});
