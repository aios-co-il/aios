import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import {
  alertTargetText,
  baselineTrendLines,
  spentWithoutResults3d,
} from "./instant-alert-lines.ts";

Deno.test("the target text names a market target as Carmen's", () => {
  assertStrictEquals(alertTargetText({ target_value: null }), "אין יעד");
  assertStrictEquals(
    alertTargetText({ target_kind: "cpl", target_value: 60 }),
    "CPL 60",
  );
  assertStrictEquals(
    alertTargetText({
      target_kind: "roas",
      target_value: 3,
      target_source: "carmen_market",
    }),
    "ROAS 3 · יעד שוק (כרמן)",
  );
  assertStrictEquals(
    alertTargetText({ target_kind: "cost_per_result", target_value: 5 }),
    "עלות לתוצאה 5",
  );
});

Deno.test("3 days of spend without results is spotted", () => {
  assertStrictEquals(
    spentWithoutResults3d({ spend_3d: 300, outcomes_3d: null }),
    true,
  );
  assertStrictEquals(
    spentWithoutResults3d({
      spend_3d: 300,
      outcomes_3d: 2,
      efficiency_3d: 150,
    }),
    false,
  );
  assertStrictEquals(spentWithoutResults3d({ spend_3d: 0 }), false);
});

Deno.test("only a campaign without a target gets the baseline line", () => {
  assertEquals(
    baselineTrendLines({
      target_value: null,
      trend_3d_pct: 52,
      trend_7d_pct: 48,
    }),
    ["החמרה מול הבסיס: 3 ימים 52% · 7 ימים 48%"],
  );
  assertEquals(
    baselineTrendLines({
      target_value: null,
      spend_3d: 300,
      trend_3d_pct: null,
      trend_7d_pct: 250,
    }),
    ["החמרה מול הבסיס: 3 ימים אין תוצאות · 7 ימים 250%"],
  );
  assertEquals(
    baselineTrendLines({ target_value: 60, trend_3d_pct: 5, trend_7d_pct: 5 }),
    [],
  );
  assertEquals(
    baselineTrendLines({ target_value: null, trend_7d_pct: 40 }),
    [],
  );
});
