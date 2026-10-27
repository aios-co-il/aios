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
});
