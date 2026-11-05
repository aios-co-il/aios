import { assertStrictEquals } from "jsr:@std/assert@1";

import { marketRangeProblem, ownBaseline } from "./market-range.ts";
import type { TargetInput } from "./parse-target-input.ts";

const shop: TargetInput = {
  clientId: "client-1",
  platform: "meta",
  goal: "ecommerce",
  kind: "roas",
  value: 3,
  campaignId: null,
};

const rows = [
  {
    platform: "meta",
    goal: "ecommerce",
    baseline_efficiency_7d: 2,
    spend_7d: 100,
  },
  {
    platform: "meta",
    goal: "ecommerce",
    baseline_efficiency_7d: 4,
    spend_7d: 300,
  },
  // Measured on CPA, so it is not a ROAS baseline.
  {
    platform: "meta",
    goal: "ecommerce",
    target_kind: "cpa",
    baseline_efficiency_7d: 90,
    spend_7d: 900,
  },
  {
    platform: "google",
    goal: "ecommerce",
    baseline_efficiency_7d: 9,
    spend_7d: 900,
  },
];

Deno.test("the baseline is spend-weighted over rows on the same metric", () => {
  assertStrictEquals(ownBaseline(rows, shop), 3.5);
  assertStrictEquals(ownBaseline(rows, { ...shop, kind: "cpa" }), 90);
  assertStrictEquals(ownBaseline([], shop), null);
});

Deno.test("a value within ±50% of the baseline passes", () => {
  assertStrictEquals(marketRangeProblem(rows, { ...shop, value: 5.25 }), null);
  assertStrictEquals(
    marketRangeProblem(rows, { ...shop, value: 5.3 })?.error,
    "value_out_of_range",
  );
  assertStrictEquals(marketRangeProblem([], { ...shop, value: 50 }), null);
});
