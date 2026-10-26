import {
  assert,
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import {
  PULSE_COST_RULE_DEFAULTS,
  evaluateTargetlessCostTrend,
  resolvePulseCostRules,
} from "./pulse-cost-rules.mjs";

const solid = {
  spend7d: 1000,
  baselineOutcomes: 40,
  baselineDays: 28,
};

Deno.test(
  "cost rules default to 40% CPL/CPA, 25% ROAS, 300 spend, alerts off",
  () => {
    const rules = resolvePulseCostRules(null);
    assertEquals(rules, { ...PULSE_COST_RULE_DEFAULTS });
    assertStrictEquals(rules.trend_pct, 40);
    assertStrictEquals(rules.roas_drop_pct, 25);
    assertStrictEquals(rules.min_spend_7d, 300);
    assertStrictEquals(rules.target_less_alerts, false);
  },
);

Deno.test(
  "tenant overrides come from pulse_alert_rules.manager.cost; junk falls back",
  () => {
    const rules = resolvePulseCostRules({
      instant_wa_enabled: true,
      manager: {
        cost: {
          trend_pct: 60,
          roas_drop_pct: "abc",
          min_spend_7d: 0,
          target_less_alerts: true,
        },
      },
    });
    assertStrictEquals(rules.trend_pct, 60);
    assertStrictEquals(rules.roas_drop_pct, 25);
    assertStrictEquals(rules.min_spend_7d, 0);
    assertStrictEquals(rules.target_less_alerts, true);
    assertStrictEquals(
      resolvePulseCostRules({
        manager: { cost: { target_less_alerts: "yes" } },
      }).target_less_alerts,
      false,
    );
  },
);

Deno.test(
  "CPL up 40% on both windows with solid baseline and spend is an exception",
  () => {
    const verdict = evaluateTargetlessCostTrend({
      metric: "cpl",
      trend3: 45,
      trend7: 40,
      ...solid,
      rules: resolvePulseCostRules({
        manager: { cost: { target_less_alerts: true } },
      }),
    });
    assertStrictEquals(verdict.level, "exception");
    assertStrictEquals(verdict.alertEligible, true);
    assertMatch(verdict.reason, /CPL/);
    // The reason is part of the alert fingerprint: thresholds only, no live numbers.
    assertNotMatch(verdict.reason, /45/);
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
    rules: resolvePulseCostRules({
      manager: { cost: { target_less_alerts: true } },
    }),
  });
  assertStrictEquals(verdict.level, "watch");
  assertStrictEquals(verdict.alertEligible, false);
  assert(verdict.blockedBy.includes("trend"));
});

Deno.test("ROAS uses the 25% drop threshold", () => {
  const rules = resolvePulseCostRules({
    manager: { cost: { target_less_alerts: true } },
  });
  assertStrictEquals(
    evaluateTargetlessCostTrend({
      metric: "roas",
      trend3: 26,
      trend7: 25,
      ...solid,
      rules,
    }).level,
    "exception",
  );
  assertStrictEquals(
    evaluateTargetlessCostTrend({
      metric: "roas",
      trend3: 24,
      trend7: 30,
      ...solid,
      rules,
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
    rules: resolvePulseCostRules({
      manager: { cost: { target_less_alerts: true } },
    }),
  });
  assertStrictEquals(verdict.level, "watch");
  assertEquals(verdict.blockedBy, ["min_spend"]);
  assertMatch(verdict.reason, /הוצאה מתחת ל־300/);
});

Deno.test("a thin baseline (outcomes or days) blocks the alert", () => {
  const rules = resolvePulseCostRules({
    manager: { cost: { target_less_alerts: true } },
  });
  const fewOutcomes = evaluateTargetlessCostTrend({
    metric: "cpl",
    trend3: 90,
    trend7: 90,
    spend7d: 1000,
    baselineOutcomes: 2,
    baselineDays: 28,
    rules,
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
    rules,
  });
  assertEquals(fewDays.blockedBy, ["baseline_days"]);
  assertMatch(fewDays.reason, /בסיס השוואה קצר/);
});

Deno.test(
  "engagement cost per result never becomes a target-less exception",
  () => {
    const verdict = evaluateTargetlessCostTrend({
      metric: "cost_per_result",
      trend3: 90,
      trend7: 90,
      ...solid,
      rules: resolvePulseCostRules({
        manager: { cost: { target_less_alerts: true } },
      }),
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
