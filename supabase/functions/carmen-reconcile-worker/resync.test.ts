import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { CallBudget } from "../_shared/reconcile/budget.ts";
import type { ReconcileTable } from "../_shared/reconcile/types.ts";
import { runReconcileChunk } from "./chunk.ts";
import { createFixtureSource, type FixtureTable } from "./fixture-source.ts";
import { account, day, deps, memoryStore, table } from "./test-fixtures.ts";

/** One Google campaign day with this cost. */
const costDay = (cost: number) => ({
  ...day("1", 0),
  data: { date: "2026-10-20", campaign_id: "1", cost },
});

describe("followUpMismatch", () => {
  it("resyncs once on a first mismatch, outside refresh windows, only when enabled", async () => {
    const mk = (id: string, autoresync: boolean) =>
      table(id, "google_ads", {
        integration_settings: { reconcile_autoresync: autoresync },
      });
    const tables = [mk("a", true), mk("b", true), mk("c", false)];
    const fixtures: Record<string, FixtureTable> = {};
    for (const t of tables) {
      fixtures[t.id] = { account, rows: [costDay(500)] };
    }
    const source = createFixtureSource(fixtures, "staging");
    const aios = Object.fromEntries(tables.map((t) => [t.id, [costDay(100)]]));
    // b already mismatched last night (and was resynced then): this run is the re-check.
    const { store, saved } = memoryStore(tables, aios, { b: "mismatch" });
    const resyncs: Array<[string, string, string]> = [];
    const r = await runReconcileChunk(
      deps(store, source, new CallBudget(100), {
        triggerResync: (
          t: ReconcileTable,
          w: { start: string; end: string },
        ) => {
          resyncs.push([t.id, w.start, w.end]);
          return Promise.resolve({ queued: true });
        },
      }),
      { cursor: null, maxTables: 5 },
    );
    // Compared days are 19–24 (25 waits for the morning sync). The resync runs
    // through Jerusalem's today, because the sync clears every row from the
    // start date onwards before it inserts.
    assertEquals(resyncs, [["a", "2026-10-19", "2026-10-26"]]);
    assertEquals(
      saved.map((s) => [
        s.run.table_id,
        s.run.status,
        !!s.run.summary.resync,
        !!s.run.summary.persisting,
      ]),
      [
        ["a", "mismatch", true, false],
        ["b", "mismatch", false, true],
        ["c", "mismatch", false, false],
      ],
    );
    const first = r.processed[0].resync;
    assertStrictEquals(first && "queued" in first ? first.queued : null, true);
    assertEquals(
      [saved[0].run.window_start, saved[0].run.window_end],
      ["2026-10-19", "2026-10-24"],
    );
    assertEquals(saved[0].run.summary.top_findings, [
      {
        kind: "mismatch",
        campaign: "C1",
        date: "2026-10-20",
        metric: "spend",
        aios: 100,
        platform: 500,
      },
    ]);
  });

  it("never resyncs Meta insights tables, whose sync ignores the window", async () => {
    const t = table("a", "facebook_insights", {
      integration_settings: { reconcile_autoresync: true },
    });
    const source = createFixtureSource(
      { a: { account, rows: [day("1", 500)] } },
      "staging",
    );
    const { store, saved } = memoryStore([t], { a: [day("1", 100)] });
    let calls = 0;
    await runReconcileChunk(
      deps(store, source, new CallBudget(100), {
        triggerResync: () => {
          calls += 1;
          return Promise.resolve({ queued: true });
        },
      }),
      { cursor: null, maxTables: 5 },
    );
    assertStrictEquals(calls, 0);
    assertEquals(saved[0].run.summary.resync, {
      skipped: "sync_ignores_window",
    });
  });

  it("marks persisting as unknown when the previous run cannot be read", async () => {
    const t = table("a", "google_ads");
    const source = createFixtureSource(
      { a: { account, rows: [costDay(500)] } },
      "staging",
    );
    const { store, saved } = memoryStore([t], { a: [costDay(100)] });
    const logs: string[] = [];
    await runReconcileChunk(
      {
        ...deps(store, source),
        store: { ...store, latestRun: () => Promise.reject(new Error("down")) },
        log: (m) => logs.push(m),
      },
      { cursor: null, maxTables: 5 },
    );
    assertStrictEquals(saved[0].run.summary.persisting_unknown, true);
    assertEquals(logs, ["[reconcile] latest run read failed for a: down"]);
  });
});
