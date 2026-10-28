import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import {
  isPulseTargetGoal,
  isTargetKind,
  normalizeTargetSource,
  pulseTargetDirection,
  pulseTargetKindLabel,
  pulseTargetKindsForGoal,
  pulseMeasuredKind,
} from "./kinds.ts";

Deno.test("each goal has its target kinds, the default first", () => {
  assertEquals(pulseTargetKindsForGoal("ecommerce"), ["roas", "cpa"]);
  assertEquals(pulseTargetKindsForGoal("leads"), ["cpl"]);
  assertEquals(pulseTargetKindsForGoal("engagement"), ["cost_per_result"]);
  assertEquals(pulseTargetKindsForGoal("unknown"), []);
  assertEquals(pulseTargetKindsForGoal("constructor"), []);
});

Deno.test(
  "a campaign is measured on its target's kind, else the goal's default",
  () => {
    assertStrictEquals(pulseMeasuredKind("ecommerce", "cpa"), "cpa");
    assertStrictEquals(pulseMeasuredKind("ecommerce", null), "roas");
    assertStrictEquals(pulseMeasuredKind("ecommerce", "cpl"), "roas");
    assertStrictEquals(pulseMeasuredKind("leads", "roas"), "cpl");
    assertStrictEquals(
      pulseMeasuredKind("engagement", null),
      "cost_per_result",
    );
    assertStrictEquals(pulseMeasuredKind("unknown", "cpl"), "cost_per_result");
  },
);

Deno.test("only leads and ecommerce take a cost target", () => {
  assertStrictEquals(isPulseTargetGoal("leads"), true);
  assertStrictEquals(isPulseTargetGoal("ecommerce"), true);
  assertStrictEquals(isPulseTargetGoal("engagement"), false);
  assertStrictEquals(isPulseTargetGoal(null), false);
});

Deno.test("kinds are named, guarded and directed", () => {
  assertEquals(
    ["roas", "cpa", "cpl", "cost_per_result"].map(pulseTargetKindLabel),
    ["ROAS", "CPA", "CPL", "עלות לתוצאה"],
  );
  assertStrictEquals(isTargetKind("cpa"), true);
  assertStrictEquals(isTargetKind("ctr"), false);
  assertStrictEquals(pulseTargetDirection("roas"), "minimum");
  assertStrictEquals(pulseTargetDirection("cpl"), "maximum");
});

Deno.test("anything but carmen_market is an approved source", () => {
  assertStrictEquals(normalizeTargetSource(" carmen_market "), "carmen_market");
  assertStrictEquals(normalizeTargetSource("manual"), "approved");
  assertStrictEquals(normalizeTargetSource(undefined), "approved");
});
