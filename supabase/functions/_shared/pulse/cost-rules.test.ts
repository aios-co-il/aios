import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import {
  PULSE_COST_RULE_DEFAULTS,
  resolvePulseCostRules,
} from "./cost-rules.ts";

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
