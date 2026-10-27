import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { resolvePulseCostRules } from "./cost-rules.ts";
import {
  measureBaselineGuard,
  noResultsIn3Days,
  targetStatusReasons,
  targetlessStatus,
} from "./targetless-status.ts";

const solid = { outcomes: 40, days: 28 };

Deno.test("the baseline guard counts real outcomes and spending days", () => {
  const rows = [
    { data: { date: "2026-09-01", spend: 10 } },
    { data: { date: "2026-09-01", spend: 5 } },
    { data: { date: "2026-09-02", spend: 0 } },
    { data: { date: "2026-09-03", spend: 7 } },
  ];
  assertEquals(
    measureBaselineGuard(rows, 6, (row) => row.data.spend),
    { outcomes: 6, days: 2 },
  );
});

Deno.test(
  "a market target's reasons name Carmen; an approved one's do not",
  () => {
    const approved = targetStatusReasons({
      kind: "cpl",
      value: 60,
      source: "approved",
    });
    assertStrictEquals(approved.breach, "חריגה מתמשכת מהיעד המאושר (CPL 60)");
    assertStrictEquals(approved.within, "התוצאה בתוך היעד המאושר");
    const market = targetStatusReasons({
      kind: "cost_per_result",
      value: 4,
      source: "carmen_market",
    });
    assertStrictEquals(
      market.breach,
      "חריגה מתמשכת מול יעד שוק (כרמן) (עלות לתוצאה 4)",
    );
    assertStrictEquals(
      market.drift,
      "חריגה מול יעד שוק (כרמן) ב־7 ימים; נדרשת התמדה לפני התראה",
    );
  },
);

Deno.test(
  "spend with no results in 3 days counts only for a cost metric",
  () => {
    assertStrictEquals(
      noResultsIn3Days({ spend: 90, outcomes: null }, false),
      true,
    );
    assertStrictEquals(
      noResultsIn3Days({ spend: 90, outcomes: 0 }, false),
      true,
    );
    assertStrictEquals(
      noResultsIn3Days({ spend: 90, outcomes: 2 }, false),
      false,
    );
    assertStrictEquals(
      noResultsIn3Days({ spend: 90, outcomes: null }, true),
      false,
    );
    assertStrictEquals(
      noResultsIn3Days({ spend: 0, outcomes: null }, false),
      false,
    );
  },
);

Deno.test("a target-less exception is red only while its alerts are on", () => {
  const input = {
    goal: "leads",
    useRoas: false,
    trend3: 50,
    trend7: 50,
    spend7d: 1000,
    guard: solid,
    target: null,
  };
  const off = targetlessStatus({
    ...input,
    rules: resolvePulseCostRules(null),
  });
  assertEquals(
    [off.status, off.tier, off.alertEligible],
    ["warning", "exception", false],
  );
  const on = targetlessStatus({
    ...input,
    rules: resolvePulseCostRules({
      manager: { cost: { target_less_alerts: true } },
    }),
  });
  assertEquals(
    [on.status, on.tier, on.alertEligible],
    ["critical", "exception", true],
  );
  assertStrictEquals(on.reason, off.reason);
});

Deno.test(
  "no trend: healthy, and the reason says what it was compared with",
  () => {
    const quiet = {
      goal: "ecommerce",
      useRoas: true,
      trend3: 2,
      trend7: 3,
      spend7d: 1000,
      guard: solid,
      rules: resolvePulseCostRules(null),
    };
    assertStrictEquals(
      targetlessStatus({ ...quiet, target: null }).reason,
      "לא זוהתה חריגה; אין יעד להשוואה",
    );
    assertStrictEquals(
      targetlessStatus({ ...quiet, target: { source: "carmen_market" } })
        .reason,
      "בתוך יעד שוק (כרמן)",
    );
    assertStrictEquals(
      targetlessStatus({ ...quiet, target: { source: "approved" } }).status,
      "healthy",
    );
  },
);
