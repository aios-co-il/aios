import { assertEquals } from "jsr:@std/assert@1";
import { hasActivity, roundLog } from "./heartbeat.ts";

Deno.test("hasActivity and roundLog", async (t) => {
  await t.step("a quiet run writes no row", () => {
    assertEquals(
      hasActivity({
        tenant_id: "t",
        mode: "observe",
        collectors: [],
        routed: 0,
        brief: null,
        dispatch: null,
      }),
      false,
    );
    assertEquals(
      hasActivity({ tenant_id: "t", mode: "observe", error: "x" }),
      true,
    );
  });

  await t.step(
    "a routing gap the database did not store writes a row; a dismissed one does not",
    () => {
      const quiet = { tenant_id: "t", mode: "observe" as const, routed: 0 };
      assertEquals(
        hasActivity({ ...quiet, gaps_dropped: { conflict: 1 } }),
        true,
      );
      assertEquals(
        hasActivity({ ...quiet, gaps_dropped: { suppressed: 2 } }),
        false,
      );
    },
  );

  await t.step("the row carries counts, LLM use and the run kind", () => {
    const row = roundLog(
      {
        tenant_id: "t",
        mode: "team",
        collectors: [
          {
            id: "c",
            status: "ok",
            candidates: 3,
            inserted: 2,
            cleared: 1,
            dropped: {},
            llm: { calls: 4, costUsd: 0.02 },
          },
        ],
        routed: 5,
        gaps: 0,
        brief: null,
        dispatch: { messages: 2, sent: 2, deferred: 0, cancelled: 0 },
      },
      1200,
    );
    assertEquals(
      [
        row.run_kind,
        row.status,
        row.tasks_reviewed,
        row.llm_calls,
        row.llm_cost_usd,
        row.duration_ms,
      ],
      ["manager_round", "ok", 5, 4, 0.02, 1200],
    );
    assertEquals(
      row.summary,
      "סבב כרמן (team): 2 ממצאים חדשים, 1 נסגרו, 2 הודעות",
    );
  });

  await t.step("the row counts the candidates that were not stored", () => {
    const row = roundLog(
      {
        tenant_id: "t",
        mode: "observe",
        collectors: [
          {
            id: "c",
            status: "ok",
            candidates: 3,
            inserted: 1,
            cleared: 0,
            dropped: { rejected_client: 1, suppressed: 1 },
            llm: { calls: 0, costUsd: 0 },
          },
        ],
        routed: 0,
        gaps: 1,
        gaps_dropped: { invalid: 1 },
      },
      10,
    );
    assertEquals(
      row.summary,
      "סבב כרמן (observe): 1 ממצאים חדשים, 0 נסגרו, 0 הודעות, 2 לא נשמרו",
    );
    const stats = row.stats as {
      collectors: { dropped: unknown }[];
      gaps_dropped: unknown;
    };
    assertEquals(stats.collectors[0].dropped, {
      rejected_client: 1,
      suppressed: 1,
    });
    assertEquals(stats.gaps_dropped, { invalid: 1 });
  });

  await t.step("a failed card write alone writes a row that counts it", () => {
    const report = {
      tenant_id: "t",
      mode: "team" as const,
      collectors: [],
      card_writes: {
        written: 0,
        planned: 0,
        failed: 1,
        already_closed: 0,
        finding_ids: [],
      },
      routed: 0,
      brief: null,
      dispatch: null,
    };
    assertEquals(hasActivity(report), true);
    const stats = roundLog(report, 10).stats as { card_writes: unknown };
    assertEquals(stats.card_writes, {
      written: 0,
      failed: 1,
      already_closed: 0,
    });
  });
});
