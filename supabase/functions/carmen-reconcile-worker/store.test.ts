import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { memoryDb } from "../_shared/reconcile/memory-db.ts";
import { latestRunForTable, saveReconcileRun } from "./store.ts";

/** A client that records inserts and answers the run insert with id run-1. */
function insertDb(inserts: Array<{ table: string; rows: unknown }>) {
  return {
    from(table: string) {
      return {
        insert(rows: unknown) {
          inserts.push({ table, rows });
          return Object.assign(Promise.resolve({ error: null }), {
            select: () => ({
              single: () =>
                Promise.resolve({ data: { id: "run-1" }, error: null }),
            }),
          });
        },
      };
    },
  };
}

describe("saveReconcileRun", () => {
  it("stores a run and its findings together", async () => {
    const inserts: Array<{ table: string; rows: unknown }> = [];
    const id = await saveReconcileRun(
      insertDb(inserts),
      {
        tenant_id: "tenant-1",
        table_id: "table-1",
        client_id: "client-1",
        platform: "meta",
        started_at: "2026-10-26T01:30:00Z",
        finished_at: "2026-10-26T01:30:05Z",
        status: "mismatch",
        window_start: "2026-10-19",
        window_end: "2026-10-25",
        summary: {},
      },
      [
        {
          kind: "missing_day",
          campaign_id: null,
          date: "2026-10-21",
          metric: "spend",
          aios_value: 0,
          platform_value: 300,
          details: {},
        },
      ],
    );
    assertStrictEquals(id, "run-1");
    assertEquals(
      inserts.map((i) => i.table),
      ["reconcile_runs", "reconcile_findings"],
    );
    const findings = inserts[1].rows;
    assertEquals(
      Array.isArray(findings)
        ? [
            findings[0].run_id,
            findings[0].tenant_id,
            findings[0].table_id,
            findings[0].kind,
          ]
        : null,
      ["run-1", "tenant-1", "table-1", "missing_day"],
    );
  });
});

describe("latestRunForTable", () => {
  it("looks past runs a rate limit stopped", async () => {
    const run = (status: string, started_at: string, summary: object) => ({
      table_id: "t1",
      status,
      started_at,
      summary,
    });
    const db = memoryDb({
      reconcile_runs: [
        run("skipped", "2026-10-26T02:10:00Z", {
          skipped_reason: "platform_rate_limited",
        }),
        run("failed", "2026-10-26T01:40:00Z", { error_kind: "rate_limit" }),
        run("ok", "2026-10-25T01:35:00Z", { findings_total: 0 }),
      ],
    });
    assertEquals((await latestRunForTable(db, "t1"))?.status, "ok");
  });
});
