import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import {
  isPulseTargetGoal,
  isTargetKind,
  normalizeTargetSource,
  pulseTargetDirection,
  pulseTargetKindLabel,
  pulseTargetKindsForGoal,
} from "./kinds.ts";

Deno.test("each goal has its target kinds, the default first", () => {
  assertEquals(pulseTargetKindsForGoal("ecommerce"), ["roas", "cpa"]);
  assertEquals(pulseTargetKindsForGoal("leads"), ["cpl"]);
  assertEquals(pulseTargetKindsForGoal("engagement"), ["cost_per_result"]);
  assertEquals(pulseTargetKindsForGoal("unknown"), []);
  assertEquals(pulseTargetKindsForGoal("constructor"), []);
});

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
