import {
  assert,
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import { resolvePulseCostRules } from "./cost-rules.ts";
import { evaluateTargetlessCostTrend } from "./targetless-cost-trend.ts";

const solid = {
  spend7d: 1000,
  baselineOutcomes: 40,
  baselineDays: 28,
};

const ALERTS_ON = resolvePulseCostRules({
  manager: { cost: { target_less_alerts: true } },
});

Deno.test(
  "CPL up 40% on both windows with solid baseline and spend is an exception",
  () => {
    const verdict = evaluateTargetlessCostTrend({
      metric: "cpl",
      trend3: 45,
      trend7: 40,
      ...solid,
      rules: ALERTS_ON,
    });
    assertStrictEquals(verdict.level, "exception");
    assertStrictEquals(verdict.alertEligible, true);
    assertMatch(String(verdict.reason), /CPL/);
    // The reason is part of the alert fingerprint: thresholds only, no live numbers.
    assertNotMatch(String(verdict.reason), /45/);
  },
);

Deno.test(
  "an exception does not alert while target-less alerts are off",
  () => {
    const verdict = evaluateTargetlessCostTrend({
      metric: "cpl",
      trend3: 80,
      trend7: 80,
      ...solid,
    });
    assertStrictEquals(verdict.level, "exception");
    assertStrictEquals(verdict.alertEligible, false);
  },
);

Deno.test("one window under the threshold is only watch", () => {
  const verdict = evaluateTargetlessCostTrend({
    metric: "cpa",
    trend3: 70,
    trend7: 39,
    ...solid,
    rules: ALERTS_ON,
  });
  assertStrictEquals(verdict.level, "watch");
  assertStrictEquals(verdict.alertEligible, false);
  assert(verdict.blockedBy.includes("trend"));
});

Deno.test("ROAS uses the 25% drop threshold", () => {
  assertStrictEquals(
    evaluateTargetlessCostTrend({
      metric: "roas",
      trend3: 26,
      trend7: 25,
      ...solid,
      rules: ALERTS_ON,
    }).level,
    "exception",
  );
  assertStrictEquals(
    evaluateTargetlessCostTrend({
      metric: "roas",
      trend3: 24,
      trend7: 30,
      ...solid,
      rules: ALERTS_ON,
    }).level,
    null,
  );
});

Deno.test("spend under min_spend_7d blocks the alert and says why", () => {
  const verdict = evaluateTargetlessCostTrend({
    metric: "cpl",
    trend3: 90,
    trend7: 90,
    spend7d: 299,
    baselineOutcomes: 40,
    baselineDays: 28,
    rules: ALERTS_ON,
  });
  assertStrictEquals(verdict.level, "watch");
  assertEquals(verdict.blockedBy, ["min_spend"]);
  assertMatch(String(verdict.reason), /הוצאה מתחת ל־300/);
});

Deno.test("a thin baseline (outcomes or days) blocks the alert", () => {
  const fewOutcomes = evaluateTargetlessCostTrend({
    metric: "cpl",
    trend3: 90,
    trend7: 90,
    spend7d: 1000,
    baselineOutcomes: 2,
    baselineDays: 28,
    rules: ALERTS_ON,
  });
  assertStrictEquals(fewOutcomes.level, "watch");
  assertEquals(fewOutcomes.blockedBy, ["baseline_outcomes"]);
  const fewDays = evaluateTargetlessCostTrend({
    metric: "cpl",
    trend3: 90,
    trend7: 90,
    spend7d: 1000,
    baselineOutcomes: 30,
    baselineDays: 6,
    rules: ALERTS_ON,
  });
  assertEquals(fewDays.blockedBy, ["baseline_days"]);
  assertMatch(String(fewDays.reason), /בסיס השוואה קצר/);
});

Deno.test(
  "engagement cost per result never becomes a target-less exception",
  () => {
    const verdict = evaluateTargetlessCostTrend({
      metric: "cost_per_result",
      trend3: 90,
      trend7: 90,
      ...solid,
      rules: ALERTS_ON,
    });
    assertStrictEquals(verdict.level, "watch");
    assertStrictEquals(verdict.alertEligible, false);
  },
);

Deno.test("missing trends give no verdict", () => {
  assertStrictEquals(
    evaluateTargetlessCostTrend({
      metric: "cpl",
      trend3: null,
      trend7: 90,
      ...solid,
    }).level,
    null,
  );
});
