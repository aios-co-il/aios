import assert from "node:assert/strict";
import test from "node:test";

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

test("cost rules default to 40% CPL/CPA, 25% ROAS, 300 spend, alerts off", () => {
  const rules = resolvePulseCostRules(null);
  assert.deepEqual(rules, { ...PULSE_COST_RULE_DEFAULTS });
  assert.equal(rules.trend_pct, 40);
  assert.equal(rules.roas_drop_pct, 25);
  assert.equal(rules.min_spend_7d, 300);
  assert.equal(rules.target_less_alerts, false);
});

test("tenant overrides come from pulse_alert_rules.manager.cost; junk falls back", () => {
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
  assert.equal(rules.trend_pct, 60);
  assert.equal(rules.roas_drop_pct, 25);
  assert.equal(rules.min_spend_7d, 0);
  assert.equal(rules.target_less_alerts, true);
  assert.equal(
    resolvePulseCostRules({ manager: { cost: { target_less_alerts: "yes" } } })
      .target_less_alerts,
    false,
  );
});

test("CPL up 40% on both windows with solid baseline and spend is an exception", () => {
  const verdict = evaluateTargetlessCostTrend({
    metric: "cpl",
    trend3: 45,
    trend7: 40,
    ...solid,
    rules: resolvePulseCostRules({
      manager: { cost: { target_less_alerts: true } },
    }),
  });
  assert.equal(verdict.level, "exception");
  assert.equal(verdict.alertEligible, true);
  assert.match(verdict.reason, /CPL/);
  // The reason is part of the alert fingerprint: thresholds only, no live numbers.
  assert.doesNotMatch(verdict.reason, /45/);
});

test("an exception does not alert while target-less alerts are off", () => {
  const verdict = evaluateTargetlessCostTrend({
    metric: "cpl",
    trend3: 80,
    trend7: 80,
    ...solid,
  });
  assert.equal(verdict.level, "exception");
  assert.equal(verdict.alertEligible, false);
});

test("one window under the threshold is only watch", () => {
  const verdict = evaluateTargetlessCostTrend({
    metric: "cpa",
    trend3: 70,
    trend7: 39,
    ...solid,
    rules: resolvePulseCostRules({
      manager: { cost: { target_less_alerts: true } },
    }),
  });
  assert.equal(verdict.level, "watch");
  assert.equal(verdict.alertEligible, false);
  assert.ok(verdict.blockedBy.includes("trend"));
});

test("ROAS uses the 25% drop threshold", () => {
  const rules = resolvePulseCostRules({
    manager: { cost: { target_less_alerts: true } },
  });
  assert.equal(
    evaluateTargetlessCostTrend({
      metric: "roas",
      trend3: 26,
      trend7: 25,
      ...solid,
      rules,
    }).level,
    "exception",
  );
  assert.equal(
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

test("spend under min_spend_7d blocks the alert and says why", () => {
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
  assert.equal(verdict.level, "watch");
  assert.deepEqual(verdict.blockedBy, ["min_spend"]);
  assert.match(verdict.reason, /הוצאה מתחת ל־300/);
});

test("a thin baseline (outcomes or days) blocks the alert", () => {
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
  assert.equal(fewOutcomes.level, "watch");
  assert.deepEqual(fewOutcomes.blockedBy, ["baseline_outcomes"]);
  const fewDays = evaluateTargetlessCostTrend({
    metric: "cpl",
    trend3: 90,
    trend7: 90,
    spend7d: 1000,
    baselineOutcomes: 30,
    baselineDays: 6,
    rules,
  });
  assert.deepEqual(fewDays.blockedBy, ["baseline_days"]);
  assert.match(fewDays.reason, /בסיס השוואה קצר/);
});

test("engagement cost per result never becomes a target-less exception", () => {
  const verdict = evaluateTargetlessCostTrend({
    metric: "cost_per_result",
    trend3: 90,
    trend7: 90,
    ...solid,
    rules: resolvePulseCostRules({
      manager: { cost: { target_less_alerts: true } },
    }),
  });
  assert.equal(verdict.level, "watch");
  assert.equal(verdict.alertEligible, false);
});

test("missing trends give no verdict", () => {
  assert.equal(
    evaluateTargetlessCostTrend({
      metric: "cpl",
      trend3: null,
      trend7: 90,
      ...solid,
    }).level,
    null,
  );
});
