import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import { finalizeSyncOutcome, planLevelWrite } from "./level-plan.ts";

Deno.test("planLevelWrite: a failed campaign level aborts the window", () => {
  const plan = planLevelWrite({
    levelCounts: { campaign: 0, adset: 40, ad: 120 },
    levelErrors: { campaign: "(#17) User request limit reached" },
  });
  assertStrictEquals(plan.write, false);
  assertStrictEquals(plan.status, "failed");
  assertEquals(plan.levelsOk, ["adset", "ad"]);
  assertMatch(plan.error || "", /campaign level fetch failed/);
});

Deno.test(
  "planLevelWrite: a failed ad set / ad level is partial and skips that level",
  () => {
    const plan = planLevelWrite({
      levelCounts: { campaign: 14, adset: 30, ad: 0 },
      levelErrors: { ad: "Please reduce the amount of data" },
    });
    assertStrictEquals(plan.write, true);
    assertStrictEquals(plan.status, "partial");
    assertEquals(plan.levelsOk, ["campaign", "adset"]);
    assertStrictEquals(plan.rows, 44);
  },
);

Deno.test(
  "planLevelWrite: nothing fetched is empty, even when a lower level errored",
  () => {
    assertEquals(
      planLevelWrite({ levelCounts: { campaign: 0, adset: 0, ad: 0 } }),
      {
        write: false,
        status: "empty",
        levelsOk: ["campaign", "adset", "ad"],
        rows: 0,
      },
    );
    // A clean, empty campaign level already proves there was no delivery.
    assertEquals(
      planLevelWrite({
        levelCounts: { campaign: 0, adset: 0, ad: 0 },
        levelErrors: { adset: "timeout" },
      }),
      { write: false, status: "empty", levelsOk: ["campaign", "ad"], rows: 0 },
    );
    // Without a campaign level to vouch for it, a failed level is a failed run.
    const failed = planLevelWrite({
      levels: ["adset", "ad"],
      levelCounts: { adset: 0, ad: 0 },
      levelErrors: { adset: "timeout" },
    });
    assertStrictEquals(failed.write, false);
    assertStrictEquals(failed.status, "failed");
  },
);

Deno.test(
  "planLevelWrite: lower levels without campaign rows never replace the window",
  () => {
    const plan = planLevelWrite({
      levelCounts: { campaign: 0, adset: 5, ad: 9 },
    });
    assertStrictEquals(plan.write, false);
    assertStrictEquals(plan.status, "failed");
  },
);

Deno.test("planLevelWrite: a clean fetch is ok over every level", () => {
  const plan = planLevelWrite({
    levelCounts: { campaign: 7, adset: 0, ad: 0 },
  });
  assertStrictEquals(plan.write, true);
  assertStrictEquals(plan.status, "ok");
  assertEquals(plan.levelsOk, ["campaign", "adset", "ad"]);
});

Deno.test(
  "finalizeSyncOutcome: a write error turns the run into failed",
  () => {
    const plan = planLevelWrite({ levelCounts: { campaign: 600 } });
    const at = "2026-10-26T04:40:00.000Z";
    assertEquals(
      finalizeSyncOutcome(
        plan,
        { inserted: 500, error: "insert: timeout" },
        { at },
      ),
      {
        status: "failed",
        rows: 500,
        levels_ok: ["campaign", "adset", "ad"],
        error: "insert: timeout",
        at,
      },
    );
    assertStrictEquals(
      finalizeSyncOutcome(plan, { inserted: 600 }, { at }).status,
      "ok",
    );
  },
);
